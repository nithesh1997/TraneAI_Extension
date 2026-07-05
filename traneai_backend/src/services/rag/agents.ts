import { z } from 'zod';
import { Indexer, ItemMetadata } from './indexer.js';
import pLimit from 'p-limit';

const PlannerSchema = z.object({
    type: z.enum(['simple', 'complex']),
    subQueries: z.array(z.string()).optional()
});

export type PlanResult = z.infer<typeof PlannerSchema>;

export interface Citation {
    filePath: string;
    heading: string;
}

export interface FinalAnswer {
    answer: string;
    citations: Citation[];
}

export class RagAgentPipeline {
    constructor(private indexer: Indexer) {}

    public async execute(query: string): Promise<FinalAnswer> {
        const plan = await this.planQuery(query);
        const retrievedContext = await this.retrieve(plan, query);
        return await this.synthesize(query, retrievedContext);
    }

    private async planQuery(query: string): Promise<PlanResult> {
        const openai = this.indexer.getOpenAI();
        if (!openai) throw new Error('OpenAI API Key not set');

        const systemPrompt = `You are a query planner. Determine if a user's query about a codebase/documentation is simple or complex. 
- A "simple" query can be answered by looking up a single topic.
- A "complex" query requires looking up multiple distinct topics or files (e.g., comparing two files, multi-step instructions).
If complex, provide an array of subQueries to search for. If simple, subQueries can be omitted or just contain the original query.
Output your response as JSON matching this schema:
{
  "type": "simple" | "complex",
  "subQueries": ["query1", "query2"]
}`;

        const response = await openai.chat.completions.create({
            model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ]
        });

        const rawJson = JSON.parse(response.choices[0].message.content || '{}');
        return PlannerSchema.parse(rawJson);
    }

    private async retrieve(plan: PlanResult, originalQuery: string): Promise<ItemMetadata[]> {
        if (plan.type === 'simple') {
            const queryToUse = (plan.subQueries && plan.subQueries.length > 0) ? plan.subQueries[0] : originalQuery;
            return await this.indexer.search(queryToUse, 5);
        } else {
            const queries = plan.subQueries || [originalQuery];
            const limit = pLimit(3);
            const allResults: ItemMetadata[] = [];
            const searchPromises = queries.map(q => limit(async () => {
                return await this.indexer.search(q, 3);
            }));
            const resultsArrays = await Promise.all(searchPromises);
            
            const seen = new Set<string>();
            for (const results of resultsArrays) {
                for (const r of results) {
                    if (!seen.has(r.hash)) {
                        seen.add(r.hash);
                        allResults.push(r);
                    }
                }
            }
            return allResults;
        }
    }

    private async synthesize(query: string, contextChunks: ItemMetadata[]): Promise<FinalAnswer> {
        const openai = this.indexer.getOpenAI();
        if (!openai) throw new Error('OpenAI API Key not set');

        let contextText = '';
        contextChunks.forEach((chunk, index) => {
            contextText += `--- Chunk ${index + 1} ---\nFile: ${chunk.filePath}\nHeading: ${chunk.heading}\nContent:\n${chunk.text}\n\n`;
        });

        const systemPrompt = `You are a helpful assistant that answers questions based on the provided context chunks.
Your answer must cite the sources using the provided File and Heading information. 
Format citations naturally in your answer, e.g. "According to [File: Heading], ...".
If the context doesn't contain the answer, say "I don't have enough information to answer that."
Only answer from the provided context. Resolve any conflicting information logically.

Context:
${contextText}`;

        const response = await openai.chat.completions.create({
            model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ]
        });

        const answer = response.choices[0].message.content || 'No answer generated.';
        
        const citationsMap = new Map<string, Citation>();
        for (const chunk of contextChunks) {
            citationsMap.set(`${chunk.filePath}#${chunk.heading}`, {
                filePath: chunk.filePath,
                heading: chunk.heading
            });
        }

        return {
            answer,
            citations: Array.from(citationsMap.values())
        };
    }
}
