import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';
import matter from 'gray-matter';
import * as crypto from 'crypto';

export interface Chunk {
    filePath: string;
    heading: string;
    text: string;
    hash: string;
}

export async function chunkMarkdown(content: string, filePath: string): Promise<Chunk[]> {
    const { content: markdownContent } = matter(content);
    const ast = unified().use(remarkParse).parse(markdownContent);
    
    const chunks: Chunk[] = [];
    let currentHeading = 'Document';
    let currentText = '';
    
    for (const node of ast.children) {
        if (node.type === 'heading') {
            if (currentText.trim()) {
                chunks.push(createChunk(filePath, currentHeading, currentText.trim()));
                currentText = '';
            }
            currentHeading = toString(node);
        } else {
            if (node.position && node.position.start.offset !== undefined && node.position.end.offset !== undefined) {
                const nodeText = markdownContent.substring(node.position.start.offset, node.position.end.offset);
                currentText += nodeText + '\n\n';
            }
        }
    }
    
    if (currentText.trim()) {
        chunks.push(createChunk(filePath, currentHeading, currentText.trim()));
    }
    
    const finalChunks: Chunk[] = [];
    const MAX_CHARS = 2000;
    
    for (const chunk of chunks) {
        if (chunk.text.length <= MAX_CHARS) {
            finalChunks.push(chunk);
        } else {
            let remainingText = chunk.text;
            let part = 1;
            while (remainingText.length > 0) {
                let sliceLen = Math.min(remainingText.length, MAX_CHARS);
                if (sliceLen < remainingText.length) {
                    const lastNewline = remainingText.lastIndexOf('\n', sliceLen);
                    if (lastNewline > 0) {
                        sliceLen = lastNewline;
                    } else {
                        const lastSpace = remainingText.lastIndexOf(' ', sliceLen);
                        if (lastSpace > 0) {
                            sliceLen = lastSpace;
                        }
                    }
                }
                const sliceText = remainingText.substring(0, sliceLen).trim();
                if (sliceText) {
                    finalChunks.push(createChunk(filePath, `${chunk.heading} (Part ${part})`, sliceText));
                }
                remainingText = remainingText.substring(sliceLen).trim();
                part++;
            }
        }
    }

    return finalChunks;
}

function createChunk(filePath: string, heading: string, text: string): Chunk {
    const hash = crypto.createHash('sha256').update(filePath + heading + text).digest('hex');
    return {
        filePath,
        heading,
        text,
        hash
    };
}
