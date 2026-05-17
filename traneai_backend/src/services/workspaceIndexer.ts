import fs from 'fs';
import path from 'path';

interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'component' | 'service' | 'selector' | 'route';
  line?: number;
}

interface FileContext {
  filePath: string;
  exports: string[];
  imports: string[];
  symbols: SymbolInfo[];
}

export class WorkspaceIndexer {
  private index: Map<string, FileContext> = new Map();
  private lastIndexed: number = 0;

  constructor(private workspaceRoot: string) {}

  public async indexWorkspace() {
    console.log(`[WorkspaceIndexer] Starting index for: ${this.workspaceRoot}`);
    this.index.clear();
    await this.scanDir(this.workspaceRoot);
    this.lastIndexed = Date.now();
    console.log(`[WorkspaceIndexer] Indexing complete. Indexed ${this.index.size} files.`);
  }

  private async scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', '.vscode', '.traneAI'].includes(entry.name)) continue;
        await this.scanDir(fullPath);
      } else if (entry.isFile()) {
        if (this.isIndexable(entry.name)) {
          this.indexFile(fullPath, relativePath);
        }
      }
    }
  }

  private isIndexable(fileName: string): boolean {
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.html', '.css', '.scss'];
    return exts.some(ext => fileName.endsWith(ext));
  }

  private indexFile(fullPath: string, relativePath: string) {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(fullPath).toLowerCase();
      
      const fileContext: FileContext = {
        filePath: relativePath,
        exports: [],
        imports: [],
        symbols: []
      };

      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        this.parseTSJS(content, fileContext);
      } else if (ext === '.py') {
        this.parsePython(content, fileContext);
      }

      this.index.set(relativePath, fileContext);
    } catch (err) {
      console.error(`[WorkspaceIndexer] Error indexing ${relativePath}:`, err);
    }
  }

  private parseTSJS(content: string, context: FileContext) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Imports
      const importMatch = trimmed.match(/^import\s+.*?from\s+['"]([^'"]+)['"]/);
      if (importMatch) context.imports.push(importMatch[1]);

      // Exports
      const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/);
      if (exportMatch) context.exports.push(exportMatch[1]);

      // Symbols
      if (trimmed.match(/class\s+(\w+)/)) {
        const name = trimmed.match(/class\s+(\w+)/)![1];
        context.symbols.push({ name, type: 'class', line: lineNum });
        if (name.endsWith('Component')) context.symbols.push({ name, type: 'component', line: lineNum });
        if (name.endsWith('Service')) context.symbols.push({ name, type: 'service', line: lineNum });
      }

      if (trimmed.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/)) {
        const match = trimmed.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*)/);
        const name = match ? (match[1] || match[2]) : null;
        if (name && !['if', 'for', 'while', 'switch'].includes(name)) {
          context.symbols.push({ name, type: 'function', line: lineNum });
        }
      }

      // Angular specific (selectors)
      if (trimmed.includes('selector:')) {
        const selectorMatch = trimmed.match(/selector\s*:\s*['"]([^'"]+)['"]/);
        if (selectorMatch) context.symbols.push({ name: selectorMatch[1], type: 'selector', line: lineNum });
      }
    });
  }

  private parsePython(content: string, context: FileContext) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const lineNum = i + 1;

      if (trimmed.startsWith('def ')) {
        const name = trimmed.split(' ')[1]?.split('(')[0];
        if (name) context.symbols.push({ name, type: 'function', line: lineNum });
      } else if (trimmed.startsWith('class ')) {
        const name = trimmed.split(' ')[1]?.split('(')[0]?.replace(':', '');
        if (name) context.symbols.push({ name, type: 'class', line: lineNum });
      }
    });
  }

  public getIndexSummary(): string {
    let summary = `Total indexed files: ${this.index.size}\n\n`;
    
    const components = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'component'));
    const services = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'service'));
    
    if (components.length > 0) {
      summary += `Components: ${components.length}\n`;
    }
    if (services.length > 0) {
      summary += `Services: ${services.length}\n`;
    }
    
    return summary;
  }

  public searchSymbols(query: string): FileContext[] {
    const results: FileContext[] = [];
    const lowerQuery = query.toLowerCase();

    for (const context of this.index.values()) {
      const hasMatch = context.symbols.some(s => s.name.toLowerCase().includes(lowerQuery)) ||
                       context.filePath.toLowerCase().includes(lowerQuery);
      if (hasMatch) {
        results.push(context);
      }
    }

    return results.slice(0, 10);
  }

  public getContextForPrompt(): string {
    let contextStr = "Workspace Index Summary:\n";
    contextStr += this.getIndexSummary() + "\n";
    
    // Include some key file structures if small enough, or just a few relevant ones
    // For now, let's just provide the summary and allow the AI to search if needed.
    return contextStr;
  }
}
