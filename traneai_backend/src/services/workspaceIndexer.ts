import fs from 'fs';
import path from 'path';
import { ArchitectureInfo, FileContext as FileContextType, SymbolInfo as SymbolInfoType } from '../types/index.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.vscode', '.traneAI', '.angular']);
const INDEXABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.html', '.css', '.scss']);

interface FileContextInternal {
  filePath: string;
  exports: string[];
  imports: Array<{ source: string; symbols: string[] }>;
  symbols: SymbolInfoType[];
  dependencies: string[];
  dependents: string[];
  routes?: string[];
  lineCount: number;
}

export class WorkspaceIndexer {
  private index: Map<string, FileContextInternal> = new Map();
  private lastIndexed: number = 0;
  private architecture: ArchitectureInfo | null = null;

  constructor(private workspaceRoot: string) {}

  public async indexWorkspace() {
    console.log('[WorkspaceIndexer] Starting index for: ' + this.workspaceRoot);
    this.index.clear();
    await this.scanDir(this.workspaceRoot);
    this.buildDependencyGraph();
    this.detectArchitecture();
    this.lastIndexed = Date.now();
    console.log('[WorkspaceIndexer] Indexing complete. Indexed ' + this.index.size + ' files.');
  }

  private async scanDir(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await this.scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (INDEXABLE_EXTS.has(ext)) {
          this.indexFile(fullPath, relativePath);
        }
      }
    }
  }

  private indexFile(fullPath: string, relativePath: string) {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(fullPath).toLowerCase();
      const lines = content.split('\n');

      const fileContext: FileContextInternal = {
        filePath: relativePath,
        exports: [],
        imports: [],
        symbols: [],
        dependencies: [],
        dependents: [],
        lineCount: lines.length,
      };

      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        this.parseTSJS(content, lines, fileContext);
      } else if (ext === '.py') {
        this.parsePython(lines, fileContext);
      } else if (['.java', '.cs'].includes(ext)) {
        this.parseJavaLike(lines, fileContext);
      }

      this.index.set(relativePath, fileContext);
    } catch (err) {
      console.error('[WorkspaceIndexer] Error indexing ' + relativePath + ':', err);
    }
  }

  private parseTSJS(content: string, lines: string[], context: FileContextInternal) {
    const importRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s*from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(content)) !== null) {
      const source = m[1];
      if (!context.imports.find(i => i.source === source)) {
        context.imports.push({ source, symbols: [] });
        context.dependencies.push(source);
      }
    }

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const lineNum = i + 1;

      const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/);
      if (exportMatch) context.exports.push(exportMatch[1]);

      const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch && !trimmed.match(/^\s*\/\//)) {
        context.symbols.push({ name: classMatch[1], type: 'class', line: lineNum, filePath: context.filePath });
        if (classMatch[1].endsWith('Component')) context.symbols.push({ name: classMatch[1], type: 'component', line: lineNum, filePath: context.filePath });
        if (classMatch[1].endsWith('Service')) context.symbols.push({ name: classMatch[1], type: 'service', line: lineNum, filePath: context.filePath });
        if (classMatch[1].endsWith('Module')) context.symbols.push({ name: classMatch[1], type: 'module', line: lineNum, filePath: context.filePath });
      }

      const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) context.symbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum, filePath: context.filePath });

      const enumMatch = trimmed.match(/(?:export\s+)?enum\s+(\w+)/);
      if (enumMatch) context.symbols.push({ name: enumMatch[1], type: 'enum', line: lineNum, filePath: context.filePath });

      const typeMatch = trimmed.match(/(?:export\s+)?type\s+(\w+)\s*=/);
      if (typeMatch) context.symbols.push({ name: typeMatch[1], type: 'type', line: lineNum, filePath: context.filePath });

      const fnMatch = trimmed.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*)/);
      if (fnMatch && trimmed.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\()/)) {
        const name = fnMatch[1] || fnMatch[2];
        if (name && !['if', 'for', 'while', 'switch', 'catch', 'then', 'else'].includes(name)) {
          context.symbols.push({ name, type: 'function', line: lineNum, filePath: context.filePath });
        }
      }

      if (trimmed.includes('selector:')) {
        const selMatch = trimmed.match(/selector\s*:\s*['"]([^'"]+)['"]/);
        if (selMatch) context.symbols.push({ name: selMatch[1], type: 'selector', line: lineNum, filePath: context.filePath });
      }

      if (trimmed.match(/(?:path|route)\s*:\s*['"]/)) {
        const routeMatch = trimmed.match(/(?:path|route)\s*:\s*['"]([^'"]+)['"]/);
        if (routeMatch) {
          if (!context.routes) context.routes = [];
          context.routes.push(routeMatch[1]);
        }
      }
      if (trimmed.match(/\.(?:get|post|put|delete|patch)\s*\(/)) {
        const routeMatch = trimmed.match(/\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
        if (routeMatch) {
          if (!context.routes) context.routes = [];
          context.routes.push(routeMatch[1]);
        }
      }
    });
  }

  private parsePython(lines: string[], context: FileContextInternal) {
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const lineNum = i + 1;
      if (trimmed.startsWith('def ')) {
        const name = trimmed.split(' ')[1]?.split('(')[0];
        if (name) context.symbols.push({ name, type: 'function', line: lineNum, filePath: context.filePath });
      } else if (trimmed.startsWith('class ')) {
        const name = trimmed.split(' ')[1]?.split('(')[0]?.replace(':', '');
        if (name) context.symbols.push({ name, type: 'class', line: lineNum, filePath: context.filePath });
      } else if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
        const match = trimmed.match(/(?:import|from)\s+([\w.]+)/);
        if (match) {
          const source = match[1];
          if (!context.imports.find(i => i.source === source)) {
            context.imports.push({ source, symbols: [] });
            context.dependencies.push(source);
          }
        }
      }
      const routeMatch = trimmed.match(/@(?:app|router)\.(?:route|get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/);
      if (routeMatch) {
        if (!context.routes) context.routes = [];
        context.routes.push(routeMatch[1]);
      }
    });
  }

  private parseJavaLike(lines: string[], context: FileContextInternal) {
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const lineNum = i + 1;
      if (trimmed.startsWith('import ')) {
        const match = trimmed.match(/import\s+([\w.*]+);/);
        if (match) {
          const source = match[1];
          if (!context.imports.find(i => i.source === source)) {
            context.imports.push({ source, symbols: [] });
            context.dependencies.push(source);
          }
        }
      }
      const accessMatch = trimmed.match(/(public|private|protected)\s+(static\s+)?(class|interface|enum)\s+(\w+)/);
      if (accessMatch) {
        context.symbols.push({ name: accessMatch[4], type: accessMatch[3] as any, line: lineNum, filePath: context.filePath });
      }
      const methodMatch = trimmed.match(/(public|private|protected)\s+(static\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/);
      if (methodMatch && !trimmed.startsWith('import ')) {
        const name = methodMatch[4];
        if (!['if', 'for', 'while'].includes(name)) {
          context.symbols.push({ name, type: 'function', line: lineNum, filePath: context.filePath });
        }
      }
    });
  }

  private buildDependencyGraph() {
    for (const [filePath, context] of this.index) {
      for (const dep of context.dependencies) {
        if (dep.startsWith('.') || dep.startsWith('..')) {
          const baseDir = path.dirname(filePath);
          for (const ext of INDEXABLE_EXTS) {
            const candidate = path.join(baseDir, dep) + ext;
            const normalized = path.normalize(candidate);
            if (this.index.has(normalized)) {
              this.index.get(normalized)!.dependents.push(filePath);
              break;
            }
            const indexCandidate = path.join(path.dirname(candidate), 'index' + ext);
            const normalizedIndex = path.normalize(indexCandidate);
            if (this.index.has(normalizedIndex)) {
              this.index.get(normalizedIndex)!.dependents.push(filePath);
              break;
            }
          }
        } else {
          // Try to find files exporting matching symbols
          for (const [potentialPath, potentialContext] of this.index) {
            if (potentialPath !== filePath && potentialContext.exports.some(e => dep.includes(e) || e.includes(dep))) {
              potentialContext.dependents.push(filePath);
            }
          }
        }
      }
    }
  }

  private detectArchitecture() {
    const allContexts = Array.from(this.index.values());
    const allImports = allContexts.flatMap(c => c.imports);
    const allSymbols = allContexts.flatMap(c => c.symbols);
    const allFiles = Array.from(this.index.keys());

    const hasAngularModule = allSymbols.some(s => s.type === 'module') || allImports.some(i => i.source.includes('@angular'));
    const hasReact = allImports.some(i => i.source === 'react' || i.source.includes('@emotion'));
    const hasVue = allImports.some(i => i.source === 'vue');
    const hasNodeExpress = allImports.some(i => i.source === 'express');
    const hasPythonFlask = allImports.some(i => i.source === 'flask');

    const hasRouter = allImports.some(i => i.source.includes('router') || i.source.includes('Route'));
    const hasStore = allImports.some(i => i.source.includes('store') || i.source.includes('redux') || i.source.includes('ngrx'));
    const hasTests = allFiles.some(f => f.includes('.test.') || f.includes('.spec.') || f.includes('_test.'));

    const dirs = new Set<string>();
    for (const f of allFiles) {
      const d = path.dirname(f);
      if (d !== '.') dirs.add(d);
    }

    const patterns: string[] = [];
    if (allSymbols.some(s => s.type === 'component')) patterns.push('Component-based architecture');
    if (allSymbols.some(s => s.type === 'service')) patterns.push('Service layer');
    if (hasRouter) patterns.push('Client-side routing');
    if (hasStore) patterns.push('State management');
    if (allFiles.some(f => f.endsWith('.module.ts'))) patterns.push('Angular modules');
    if (allFiles.some(f => f.includes('/middleware/'))) patterns.push('Express middleware');
    if (allFiles.some(f => f.includes('/models/'))) patterns.push('Data models');
    if (allFiles.some(f => f.includes('/controllers/'))) patterns.push('MVC controllers');

    let type: ArchitectureInfo['type'] = 'unknown';
    if (hasAngularModule) type = 'angular';
    else if (hasReact) type = 'react';
    else if (hasVue) type = 'vue';
    else if (hasNodeExpress) type = 'node-express';
    else if (hasPythonFlask) type = 'python-flask';

    this.architecture = { type, hasRouter, hasStore, hasTests, directories: Array.from(dirs), patterns };
  }

  // --- PUBLIC API ---

  public getIndexSummary(): string {
    let summary = 'Total indexed files: ' + this.index.size + '\n';
    if (this.architecture) {
      summary += 'Architecture: ' + this.architecture.type + '\n';
      summary += 'Has tests: ' + (this.architecture.hasTests ? 'Yes' : 'No') + '\n';
      summary += 'Has router: ' + (this.architecture.hasRouter ? 'Yes' : 'No') + '\n';
      summary += 'Has store: ' + (this.architecture.hasStore ? 'Yes' : 'No') + '\n';
    }
    const components = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'component'));
    const services = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'service'));
    const functions = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'function'));
    const classes = Array.from(this.index.values()).flatMap(f => f.symbols.filter(s => s.type === 'class'));
    const routes = Array.from(this.index.values()).flatMap(f => f.routes || []);
    if (components.length > 0) summary += 'Components: ' + components.length + '\n';
    if (services.length > 0) summary += 'Services: ' + services.length + '\n';
    if (functions.length > 0) summary += 'Functions: ' + functions.length + '\n';
    if (classes.length > 0) summary += 'Classes: ' + classes.length + '\n';
    if (routes.length > 0) summary += 'Routes: ' + routes.length + '\n';
    return summary;
  }

  public getArchitecture(): ArchitectureInfo | null {
    return this.architecture;
  }

  public getContextForPrompt(): string {
    let s = '## Workspace Analysis\n\n' + this.getIndexSummary() + '\n';
    if (this.architecture && this.architecture.patterns.length > 0) {
      s += '### Architecture Patterns\n' + this.architecture.patterns.map(p => '- ' + p).join('\n') + '\n\n';
    }
    if (this.architecture && this.architecture.directories.length > 0) {
      s += '### Project Structure\n';
      s += this.architecture.directories.filter(d => d.split('/').length <= 3).slice(0, 20).map(d => '- ' + d).join('\n') + '\n\n';
    }
    return s;
  }

  public getFileContext(filePath: string): FileContextInternal | undefined {
    return this.index.get(filePath);
  }

  public getAllFileContexts(): FileContextInternal[] {
    return Array.from(this.index.values());
  }

  public findRelatedFiles(filePath: string): string[] {
    const ctx = this.index.get(filePath);
    if (!ctx) return [];
    const related = new Set<string>();
    for (const dep of ctx.dependents) related.add(dep);
    for (const dep of ctx.dependencies) {
      for (const [p, c] of this.index) {
        if (c.exports.some(e => dep.includes(e))) related.add(p);
      }
    }
    return Array.from(related);
  }

  public searchSymbols(query: string): { filePath: string; symbols: SymbolInfoType[] }[] {
    const lowerQuery = query.toLowerCase();
    const results: { filePath: string; symbols: SymbolInfoType[] }[] = [];
    for (const [fp, ctx] of this.index) {
      const matching = ctx.symbols.filter(s => s.name.toLowerCase().includes(lowerQuery));
      if (matching.length > 0) results.push({ filePath: fp, symbols: matching });
    }
    return results.slice(0, 15);
  }

  public findSymbolUsage(symbolName: string): { file: string; line?: number; context: string }[] {
    const usages: { file: string; line?: number; context: string }[] = [];
    const lower = symbolName.toLowerCase();
    for (const [fp, ctx] of this.index) {
      const def = ctx.symbols.find(s => s.name.toLowerCase() === lower);
      if (def) usages.push({ file: fp, line: def.line, context: 'definition' });
      if (ctx.imports.some(i => i.source.toLowerCase().includes(lower))) {
        usages.push({ file: fp, context: 'import' });
      }
    }
    return usages;
  }
}
