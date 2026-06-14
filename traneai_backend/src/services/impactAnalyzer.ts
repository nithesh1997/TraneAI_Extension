import path from 'path';
import { ImpactAnalysis } from '../types/index.js';
import { WorkspaceIndexer } from './workspaceIndexer.js';

// Requirement 3: Multi-file impact analysis
export class ImpactAnalyzer {
  constructor(private indexer: WorkspaceIndexer) {}

  public analyzeImpact(primaryFile: string, changeDescription: string): ImpactAnalysis {
    const context = this.indexer.getFileContext(primaryFile);
    if (!context) {
      return { primaryFile, affectedFiles: [], riskLevel: 'low', recommendation: 'File not found in workspace index.' };
    }

    const affectedFiles: ImpactAnalysis['affectedFiles'] = [];
    const seenFiles = new Set<string>();

    // Dependents (files that import from primaryFile)
    for (const dependent of context.dependents) {
      if (seenFiles.has(dependent)) continue;
      seenFiles.add(dependent);
      affectedFiles.push({
        filePath: dependent,
        impactType: 'import',
        summary: 'Imports symbols from ' + primaryFile,
      });
    }

    // Same-directory files
    const primaryDir = primaryFile.substring(0, primaryFile.lastIndexOf('/'));
    if (primaryDir) {
      for (const ctx of this.indexer.getAllFileContexts()) {
        if (ctx.filePath !== primaryFile && !seenFiles.has(ctx.filePath) && ctx.filePath.startsWith(primaryDir)) {
          seenFiles.add(ctx.filePath);
          affectedFiles.push({
            filePath: ctx.filePath,
            impactType: 'dependency',
            summary: 'Located in same directory [' + primaryDir + ']',
          });
        }
      }
    }

    // Symbols exported by primaryFile and used elsewhere
    for (const symbol of context.exports) {
      const usages = this.indexer.findSymbolUsage(symbol);
      for (const usage of usages) {
        if (usage.file !== primaryFile && !seenFiles.has(usage.file) && usage.context !== 'definition') {
          seenFiles.add(usage.file);
          affectedFiles.push({
            filePath: usage.file,
            impactType: 'reference',
            summary: 'References symbol [' + symbol + ']',
          });
        }
      }
    }

    const riskLevel = affectedFiles.length > 5 ? 'high' : affectedFiles.length > 2 ? 'medium' : 'low';
    const recommendation = riskLevel === 'high'
      ? 'HIGH RISK: ' + changeDescription + ' affects ' + affectedFiles.length + ' files. Consider breaking into smaller steps.'
      : riskLevel === 'medium'
        ? 'MODERATE RISK: ' + affectedFiles.length + ' files affected by ' + changeDescription + '. Review each file before approving.'
        : 'LOW RISK: Minimal impact across ' + Math.max(1, affectedFiles.length) + ' file(s).';

    return { primaryFile, affectedFiles: affectedFiles.slice(0, 20), riskLevel, recommendation };
  }
}
