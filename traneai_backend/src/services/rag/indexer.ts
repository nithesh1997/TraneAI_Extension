import * as path from 'path';
import * as fs from 'fs';
import { LocalIndex } from 'vectra';
import { AzureOpenAI } from 'openai';
import { pipeline, env } from '@xenova/transformers';

// Prevent network timeouts completely by only loading the model we downloaded locally
env.allowRemoteModels = false;
import pLimit from 'p-limit';
import { Chunk } from './chunker.js';

export interface ItemMetadata extends Record<string, unknown> {
    filePath: string;
    heading: string;
    text: string;
    hash: string;
}

export class Indexer {
    private index: LocalIndex;
    private openai: AzureOpenAI | null = null;
    private extractor: any = null;
    
    constructor(workspaceId: string) {
        const storagePath = path.join(process.cwd(), 'uploads', 'rag-indexes', workspaceId);
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        const indexPath = path.join(storagePath, 'vectra-index');
        this.index = new LocalIndex(indexPath);
    }
    
    public async initialize(apiKey?: string) {
        if (!await this.index.isIndexCreated()) {
            await this.index.createIndex();
        }
        
        const key = apiKey || process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (key) {
            this.setApiKey(key);
        }

        if (!this.extractor) {
            try {
                this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            } catch (err) {
                console.error('[Indexer] Failed to download/load Xenova model due to network error. Using dummy embeddings fallback.', err);
                // Assign a dummy function so it doesn't keep retrying and timing out
                this.extractor = (text: string) => ({ data: new Float32Array(384).fill(0.01) });
            }
        }
    }
    
    public setApiKey(apiKey: string) {
        this.openai = new AzureOpenAI({ 
            apiKey: apiKey,
            endpoint: process.env.AZURE_OPENAI_ENDPOINT,
            apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
        });
    }

    public getOpenAI(): AzureOpenAI | null {
        return this.openai;
    }
    
    public async updateChunks(filePath: string, newChunks: Chunk[]) {
        if (!this.extractor) {
            console.warn('Cannot update chunks: Embedding model not initialized');
            return;
        }

        console.log(`\n[Indexer] Processing file: ${filePath}`);
        console.log(`[Indexer] Extracted ${newChunks.length} chunks to store.`);

        if (!await this.index.isIndexCreated()) {
             await this.index.createIndex();
        }
        
        const limit = pLimit(3);
        
        const allIndexItems = await this.index.listItems();
        const fileItems = allIndexItems.filter(i => (i.metadata as ItemMetadata).filePath === filePath);
        
        const existingItemsMap = new Map();
        for (const item of fileItems) {
            existingItemsMap.set((item.metadata as ItemMetadata).hash, item);
        }
        
        const chunksToAdd: Chunk[] = [];
        const hashesToKeep = new Set<string>();
        
        for (const chunk of newChunks) {
            if (existingItemsMap.has(chunk.hash)) {
                hashesToKeep.add(chunk.hash);
            } else {
                chunksToAdd.push(chunk);
                hashesToKeep.add(chunk.hash);
            }
        }
        
        let needsUpdate = false;
        
        for (const item of fileItems) {
            const meta = item.metadata as ItemMetadata;
            if (!hashesToKeep.has(meta.hash)) {
                if (!needsUpdate) {
                    await this.index.beginUpdate();
                    needsUpdate = true;
                }
                await this.index.deleteItem(item.id);
            }
        }
        
        if (chunksToAdd.length > 0) {
            if (!needsUpdate) {
                await this.index.beginUpdate();
                needsUpdate = true;
            }
            try {
                const addPromises = chunksToAdd.map(chunk => limit(async () => {
                    const embedding = await this.getEmbedding(chunk.text);
                    
                    console.log(`[Indexer] Storing chunk from heading: "${chunk.heading}"`);
                    console.log(`[Indexer] Content preview: ${chunk.text.substring(0, 80).replace(/\n/g, ' ')}...`);
                    
                    await this.index.insertItem({
                        vector: embedding,
                        metadata: {
                            filePath: chunk.filePath,
                            heading: chunk.heading,
                            text: chunk.text,
                            hash: chunk.hash
                        }
                    });
                }));
                await Promise.all(addPromises);
            } catch (e) {
                this.index.cancelUpdate();
                console.error("Error updating index:", e);
                throw e;
            }
        }
        
        if (needsUpdate) {
            await this.index.endUpdate();
        }
    }
    
    public async removeFile(filePath: string) {
        if (!await this.index.isIndexCreated()) return;
        
        const allIndexItems = await this.index.listItems();
        const fileItems = allIndexItems.filter(i => (i.metadata as ItemMetadata).filePath === filePath);
        
        if (fileItems.length > 0) {
            await this.index.beginUpdate();
            for (const item of fileItems) {
                await this.index.deleteItem(item.id);
            }
            await this.index.endUpdate();
        }
    }
    
    public async search(query: string, topK: number = 5): Promise<ItemMetadata[]> {
        if (!this.extractor) {
            throw new Error('Embedding model not initialized');
        }
        
        const queryEmbedding = await this.getEmbedding(query);
        const results = await this.index.queryItems(queryEmbedding, query, topK);
        
        return results.map(r => r.item.metadata as ItemMetadata);
    }
    
    private async getEmbedding(text: string): Promise<number[]> {
        if (!this.extractor) {
            try {
                this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            } catch (err) {
                this.extractor = (text: string) => ({ data: new Float32Array(384).fill(0.01) });
            }
        }
        
        try {
            const output = await this.extractor(text, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        } catch (err) {
            console.error('[Indexer] Embedding generation failed, returning dummy vector.');
            return Array.from(new Float32Array(384).fill(0.01));
        }
    }
}
