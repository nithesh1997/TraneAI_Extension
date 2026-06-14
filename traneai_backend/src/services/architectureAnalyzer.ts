import { WorkspaceIndexer } from './workspaceIndexer.js';

// Requirements 1, 6: Architecture analysis
export class ArchitectureAnalyzer {
  constructor(private indexer: WorkspaceIndexer) {}

  public getArchitectureOverview(): string {
    const arch = this.indexer.getArchitecture();
    const summary = this.indexer.getIndexSummary();

    let overview = '[ANALYSIS]\n';
    overview += '**Project Architecture: ' + (arch?.type || 'Unknown') + '**\n\n';
    overview += '**Summary**\n' + summary + '\n';

    if (arch && arch.patterns.length > 0) {
      overview += '**Architecture Patterns**\n';
      overview += arch.patterns.map(p => '- ' + p).join('\n') + '\n\n';
    }
    if (arch && arch.directories.length > 0) {
      const topDirs = arch.directories.filter(d => d.split('/').length <= 2).slice(0, 30);
      overview += '**Directory Structure**\n';
      overview += topDirs.map(d => '- ' + d + '/').join('\n') + '\n\n';
    }
    overview += '**Capabilities**\n';
    overview += '- Tests: ' + (arch?.hasTests ? 'Yes' : 'No') + '\n';
    overview += '- Router: ' + (arch?.hasRouter ? 'Yes' : 'No') + '\n';
    overview += '- State Management: ' + (arch?.hasStore ? 'Yes' : 'No') + '\n';

    return overview;
  }

  public getComponentMap(): string {
    const allContexts = this.indexer.getAllFileContexts();
    const components: string[] = [];
    const services: string[] = [];
    const routes: string[] = [];
    const modules: string[] = [];

    for (const ctx of allContexts) {
      const fp = ctx.filePath;
      if (fp.endsWith('.component.ts') || fp.endsWith('.component.tsx')) components.push(fp);
      if (fp.endsWith('.service.ts') || fp.endsWith('.service.tsx')) services.push(fp);
      if (fp.includes('/routes/') || fp.endsWith('.routing.ts') || fp.endsWith('.router.ts')) routes.push(fp);
      if (fp.endsWith('.module.ts')) modules.push(fp);
    }

    let map = '[RELATED FILES]\n';
    if (components.length > 0) map += '\n**Components (' + components.length + ')**\n' + components.map(f => '- ' + f).join('\n') + '\n';
    if (services.length > 0) map += '\n**Services (' + services.length + ')**\n' + services.map(f => '- ' + f).join('\n') + '\n';
    if (routes.length > 0) map += '\n**Routes (' + routes.length + ')**\n' + routes.map(f => '- ' + f).join('\n') + '\n';
    if (modules.length > 0) map += '\n**Modules (' + modules.length + ')**\n' + modules.map(f => '- ' + f).join('\n') + '\n';
    return map;
  }

  public getDataFlowOverview(): string {
    const allContexts = this.indexer.getAllFileContexts();
    const entries: string[] = [];
    const services: string[] = [];
    const storeFiles: string[] = [];
    const effects: string[] = [];

    for (const ctx of allContexts) {
      const fp = ctx.filePath;
      if (fp.includes('/pages/') || fp.includes('/views/') || fp.includes('/screens/')) entries.push(fp);
      if (fp.includes('/services/') || fp.endsWith('.service.ts')) services.push(fp);
      if (fp.includes('/store/') || fp.includes('/state/') || fp.includes('/reducers/')) storeFiles.push(fp);
      if (fp.includes('/effects/') || fp.includes('/middleware/')) effects.push(fp);
    }

    let flow = '[FLOW]\n\n**Data Flow Overview**\n\n';
    if (entries.length > 0) {
      flow += '1. **Entry Points** - User interactions start here:\n';
      flow += entries.slice(0, 5).map(f => '   - `' + f + '`').join('\n') + '\n\n';
    }
    if (services.length > 0) {
      flow += '2. **Service Layer** - Business logic is handled here:\n';
      flow += services.slice(0, 5).map(f => '   - `' + f + '`').join('\n') + '\n\n';
    }
    if (storeFiles.length > 0) {
      flow += '3. **State Management** - Application state lives here:\n';
      flow += storeFiles.slice(0, 5).map(f => '   - `' + f + '`').join('\n') + '\n\n';
    }
    if (effects.length > 0) {
      flow += '4. **Side Effects** - Async operations and middleware:\n';
      flow += effects.slice(0, 5).map(f => '   - `' + f + '`').join('\n') + '\n\n';
    }
    return flow;
  }
}
