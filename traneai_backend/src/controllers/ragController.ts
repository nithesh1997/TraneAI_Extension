import { Request, Response } from 'express';
import { chunkMarkdown } from '../services/rag/chunker.js';
import { Indexer } from '../services/rag/indexer.js';
import { RagAgentPipeline } from '../services/rag/agents.js';
import crypto from 'crypto';
import zlib from 'zlib';
import { WorkspaceFile } from '../models/WorkspaceFile.js';
import { getEncryptionKey } from './workspaceController.js';const indexerCache = new Map<string, Indexer>();

export async function getIndexer(workspaceId: string, apiKey?: string): Promise<Indexer> {
    const hash = crypto.createHash('md5').update(workspaceId).digest('hex');
    
    if (!indexerCache.has(hash)) {
        const indexer = new Indexer(hash);
        await indexer.initialize(apiKey);
        indexerCache.set(hash, indexer);
    } else {
        const indexer = indexerCache.get(hash)!;
        if (apiKey) indexer.setApiKey(apiKey);
    }
    return indexerCache.get(hash)!;
}

export const indexBatch = async (req: Request, res: Response) => {
    try {
        const { workspaceId, files } = req.body;
        const apiKey = req.headers['x-openai-api-key'] as string | undefined;

        if (!workspaceId || !files || !Array.isArray(files)) {
            return res.status(400).json({ error: 'workspaceId and files array required' });
        }

        const indexer = await getIndexer(workspaceId, apiKey);

        for (const file of files) {
            const { filePath, content } = file;
            if (filePath && content) {
                const chunks = await chunkMarkdown(content, filePath);
                await indexer.updateChunks(filePath, chunks);
            }
        }

        res.json({ success: true, message: 'Batch indexed successfully' });
    } catch (error: any) {
        console.error('Error indexing batch:', error);
        res.status(500).json({ error: error.message });
    }
};

export const syncWorkspace = async (req: Request, res: Response) => {
    try {
        const { workspaceId } = req.body;
        const apiKey = req.headers['x-openai-api-key'] as string | undefined;
        // Optional mid for decryption, usually from req.headers or hardcoded if default
        const mid = (req.headers['x-machine-id'] as string) || 'default-mid';

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        const indexer = await getIndexer(workspaceId, apiKey);
        
        // Fetch all markdown files from DB
        const files = await WorkspaceFile.find({ filePath: /\.md$/i });
        
        let indexedCount = 0;
        
        for (const file of files) {
            try {
                let content = '';
                const buffer = Buffer.from(file.content, 'base64');
                
                if (file.encrypted) {
                    if (buffer.length > 0) {
                        const iv = buffer.subarray(0, 16);
                        const encryptedData = buffer.subarray(16);
                        const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(mid), iv);
                        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
                        content = zlib.inflateSync(decrypted).toString('utf-8');
                    }
                } else {
                    content = buffer.toString('utf-8');
                }
                
                if (content) {
                    const chunks = await chunkMarkdown(content, file.filePath);
                    await indexer.updateChunks(file.filePath, chunks);
                    indexedCount++;
                }
            } catch (err) {
                console.error(`Error decrypting/indexing file ${file.filePath}:`, err);
            }
        }

        res.json({ success: true, message: `Successfully synced ${indexedCount} markdown files to vector DB` });
    } catch (error: any) {
        console.error('Error syncing workspace:', error);
        res.status(500).json({ error: error.message });
    }
};

export const removeFile = async (req: Request, res: Response) => {
    try {
        const { workspaceId, filePath } = req.body;
        
        if (!workspaceId || !filePath) {
            return res.status(400).json({ error: 'workspaceId and filePath required' });
        }

        const indexer = await getIndexer(workspaceId);
        await indexer.removeFile(filePath);

        res.json({ success: true, message: 'File removed from index' });
    } catch (error: any) {
        console.error('Error removing file:', error);
        res.status(500).json({ error: error.message });
    }
};

export const search = async (req: Request, res: Response) => {
    try {
        const { workspaceId, query } = req.body;
        const apiKey = req.headers['x-openai-api-key'] as string | undefined;

        if (!workspaceId || !query) {
            return res.status(400).json({ error: 'workspaceId and query required' });
        }

        const indexer = await getIndexer(workspaceId, apiKey);
        const pipeline = new RagAgentPipeline(indexer);

        const result = await pipeline.execute(query);

        res.json(result);
    } catch (error: any) {
        console.error('Error searching RAG:', error);
        res.status(500).json({ error: error.message });
    }
};
