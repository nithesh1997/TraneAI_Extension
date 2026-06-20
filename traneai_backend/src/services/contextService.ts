import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Lightweight BM25 (Okapi BM25) implementation — no external deps
// ---------------------------------------------------------------------------

interface ScoredDoc {
  filePath: string;
  score: number;
  snippet: string;
  lines: number;
}

interface DocTerms {
  filePath: string;
  terms: string[];
  length: number;
}

const K1 = 1.5;
const B = 0.75;

export class BM25Index {
  private docs: DocTerms[] = [];
  private avgDocLen: number = 0;
  private docCount: number = 0;
  private df: Map<string, number> = new Map(); // document frequency per term
  private totalTerms: number = 0;

  addDocument(filePath: string, content: string): void {
    const terms = tokenize(content);
    if (terms.length === 0) return;
    this.docs.push({ filePath, terms, length: terms.length });
    this.docCount++;
    this.totalTerms += terms.length;

    const seen = new Set<string>();
    for (const t of terms) {
      this.df.set(t, (this.df.get(t) || 0) + 1);
      seen.add(t);
    }
  }

  build(): void {
    this.avgDocLen = this.docCount > 0 ? this.totalTerms / this.docCount : 0;
  }

  /** Return top-K scored results for a query */
  search(query: string, topK: number = 5): ScoredDoc[] {
    const qTerms = tokenize(query);
    if (qTerms.length === 0 || this.docCount === 0) return [];

    const idf = (term: string): number => {
      const n = this.df.get(term) || 0;
      return Math.log(1 + (this.docCount - n + 0.5) / (n + 0.5));
    };

    const scores: { filePath: string; score: number; doc: DocTerms }[] = [];

    for (const doc of this.docs) {
      let score = 0;
      const tf = new Map<string, number>();
      for (const t of doc.terms) tf.set(t, (tf.get(t) || 0) + 1);

      for (const qt of qTerms) {
        const f = tf.get(qt) || 0;
        if (f === 0) continue;
        score += idf(qt) * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (doc.length / this.avgDocLen))));
      }
      if (score > 0) {
        scores.push({ filePath: doc.filePath, score, doc });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map(s => ({
      filePath: s.filePath,
      score: s.score,
      snippet: '(scored)',
      lines: s.doc.length > 0 ? s.doc.length : 0,
    }));
  }
}

// ---------------------------------------------------------------------------
// Workspace-wide context injector
// ---------------------------------------------------------------------------

export class ContextInjector {
  private index: Map<string, BM25Index> = new Map();
  private fileContents: Map<string, string> = new Map();
  private lastRoot: string = '';

  async buildIndex(workspaceRoot: string): Promise<void> {
    if (this.lastRoot === workspaceRoot) return;
    this.lastRoot = workspaceRoot;
    this.index.clear();
    this.fileContents.clear();

    const bm25 = new BM25Index();
    const indexableExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.html', '.css', '.scss', '.json', '.md', '.yaml', '.yml', '.go', '.rs', '.rb', '.php', '.swift', '.kt']);

    const walkDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.angular') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (indexableExts.has(ext)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const relPath = path.relative(workspaceRoot, fullPath);
                bm25.addDocument(relPath, content);
                this.fileContents.set(relPath, content);
              } catch { /* skip unreadable */ }
            }
          }
        }
      } catch { /* skip */ }
    };

    walkDir(workspaceRoot);
    bm25.build();
    this.index.set(workspaceRoot, bm25);
  }

  /** Get top-K file paths + snippets relevant to the user's query */
  getRelevantContext(query: string, topK: number = 5): string {
    const bm25 = this.index.get(this.lastRoot);
    if (!bm25) return '';

    const results = bm25.search(query, topK);
    if (results.length === 0) return '';

    let context = '\n--- RELEVANT FILES (auto-injected) ---\n';
    for (const r of results) {
      const content = this.fileContents.get(r.filePath) || '';
      const lines = content.split('\n');
      const preview = lines.slice(0, 30).join('\n');
      context += `\n### ${r.filePath} (relevance: ${r.score.toFixed(2)})\n\`\`\`\n${preview}\n\`\`\`\n`;
    }
    context += '--- END RELEVANT FILES ---\n';
    return context;
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  // Split on non-alphanumeric, lowercase, filter short tokens
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$]/)
    .filter(t => t.length >= 2 && t.length <= 40)
    .slice(0, 5000); // cap per-document tokens
}
