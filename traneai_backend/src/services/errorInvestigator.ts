import fs from 'fs';
import path from 'path';
import { ErrorAnalysis } from '../types/index.js';
import { WorkspaceIndexer } from './workspaceIndexer.js';

// Requirement 7: Error Investigation
export class ErrorInvestigator {
  constructor(private indexer: WorkspaceIndexer) {}

  public analyzeError(errorMessage: string): ErrorAnalysis {
    const stackTrace = this.extractStackTrace(errorMessage);
    const sourceFile = this.findSourceFile(stackTrace);
    const sourceLine = this.findSourceLine(stackTrace, sourceFile);
    const rootCause = this.identifyRootCause(errorMessage, sourceFile);
    const impactedFiles = this.findImpactedFiles(sourceFile);

    return {
      errorMessage: this.cleanErrorMessage(errorMessage),
      stackTrace,
      rootCause,
      sourceFile,
      sourceLine,
      fixProposal: this.generateFixProposal(rootCause, sourceFile, sourceLine),
      impactedFiles,
    };
  }

  private extractStackTrace(errorMessage: string): string[] {
    const lines = errorMessage.split('\n');
    const trace: string[] = [];
    let inTrace = false;
    for (const line of lines) {
      if (line.match(/^\s*at\s/) || line.match(/^\s*->\s/) || line.match(/^\s*File\s/)) {
        inTrace = true;
        trace.push(line.trim());
      } else if (inTrace && line.trim() === '') break;
      else if (!inTrace && line.trim()) trace.push(line.trim());
    }
    return trace.slice(0, 20);
  }

  private findSourceFile(stackTrace: string[]): string {
    for (const line of stackTrace) {
      const nodeMatch = line.match(/\(([^:)]+\.(?:ts|js|tsx|jsx|py|java)):\d+:\d+\)/);
      if (nodeMatch) return nodeMatch[1];
      const simpleMatch = line.match(/([a-zA-Z0-9_\-/.]+\.(?:ts|js|tsx|jsx|py|java)):\d+/);
      if (simpleMatch) return simpleMatch[1];
    }
    return 'Unknown';
  }

  private findSourceLine(stackTrace: string[], sourceFile: string): number {
    for (const line of stackTrace) {
      const escaped = sourceFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = line.match(new RegExp(escaped + ':(\\d+)'));
      if (match) return parseInt(match[1], 10);
    }
    return 0;
  }

  private cleanErrorMessage(errorMessage: string): string {
    const lines = errorMessage.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('at ') && !trimmed.startsWith('->')) return trimmed;
    }
    return errorMessage;
  }

  private identifyRootCause(errorMessage: string, sourceFile: string): string {
    const lower = errorMessage.toLowerCase();
    if (lower.includes('cannot find module') || lower.includes('module not found')) {
      const m = errorMessage.match(/(?:cannot find module|module not found)\s*['"]([^'"]+)['"]/i);
      return 'Missing module import: ' + (m ? m[1] : 'unknown module') + '. The module may not be installed or the import path is incorrect.';
    }
    if (lower.includes('is not a function')) {
      const m = errorMessage.match(/(\w+)\s+is not a function/i);
      return 'Type error: ' + (m ? m[1] : 'A value') + ' is being called as a function but is undefined or the wrong type.';
    }
    if (lower.includes('cannot read properties of undefined') || lower.includes('cannot read property')) {
      const m = errorMessage.match(/cannot read properties? of undefined \(reading ['"](\w+)['"]\)/i);
      return 'Null reference: Attempting to access [' + (m ? m[1] : 'a property') + '] on undefined. Ensure the object is initialized.';
    }
    if (lower.includes('cannot read properties of null')) {
      return 'Null reference: Attempting to access properties on null. Ensure the value is not null.';
    }
    if (lower.includes('is not defined')) {
      const m = errorMessage.match(/(\w+)\s+is not defined/i);
      return 'Reference error: [' + (m ? m[1] : 'Variable') + '] is not defined in the current scope. Check for typos or missing imports.';
    }
    if (lower.includes('unexpected token') || lower.includes('syntax error')) {
      return 'Syntax error: There is a syntax issue in the code. Check for missing brackets, parentheses, or commas.';
    }
    if (lower.includes('typeerror') || lower.includes('type error')) {
      return 'Type error: A value is not of the expected type. Check function arguments and variable assignments for type mismatches.';
    }
    if (lower.includes('networkerror') || lower.includes('failed to fetch')) {
      return 'Network error: An HTTP request failed. Check that the server is running and the URL is correct.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'Timeout: An operation exceeded the allowed time limit. Check for infinite loops or slow database queries.';
    }
    if (lower.includes('econnrefused') || lower.includes('connection refused')) {
      return 'Connection refused: The target server is not running or not accepting connections.';
    }
    if (lower.includes('enoent') || lower.includes('no such file')) {
      const m = errorMessage.match(/enoent.*?['"]([^'"]+)['"]|no such file.*?['"]([^'"]+)['"]/i);
      return 'File not found: [' + (m ? (m[1] || m[2]) : 'the specified file') + '] does not exist. Check the file path.';
    }
    if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
      return 'Database constraint violation: Attempting to insert a duplicate value into a unique field.';
    }
    if (lower.includes('permission denied') || lower.includes('eacces')) {
      return 'Permission denied: The application does not have sufficient permissions to access a file or resource.';
    }
    return 'Error in ' + sourceFile + ': ' + this.cleanErrorMessage(errorMessage) + '. Review the stack trace for the source.';
  }

  private findImpactedFiles(sourceFile: string): string[] {
    if (sourceFile === 'Unknown') return [];
    const ctx = this.indexer.getFileContext(sourceFile);
    if (!ctx) return [sourceFile];
    const impacted = new Set<string>();
    impacted.add(sourceFile);
    for (const dep of ctx.dependents) impacted.add(dep);
    return Array.from(impacted);
  }

  private generateFixProposal(rootCause: string, sourceFile: string, sourceLine: number): string {
    if (sourceFile === 'Unknown' || sourceLine === 0) {
      return '1. Review the error message.\n2. Check the stack trace for the first file in your project.\n3. Inspect that file for the issue.\n4. Apply the necessary fix.';
    }

    let content = '';
    try {
      const fullPath = path.resolve(this.indexer['workspaceRoot'], sourceFile);
      if (fs.existsSync(fullPath)) content = fs.readFileSync(fullPath, 'utf-8');
    } catch {}

    if (!content) {
      return '1. Open `' + sourceFile + '` at line ' + sourceLine + '\n2. Inspect the code around that line\n3. Root cause: ' + rootCause + '\n4. Apply the appropriate fix.';
    }

    const lines = content.split('\n');
    const startLine = Math.max(0, sourceLine - 5);
    const endLine = Math.min(lines.length, sourceLine + 5);
    const contextBlock = lines.slice(startLine, endLine).map((l, i) => {
      const lineNum = startLine + i + 1;
      return (lineNum === sourceLine ? ' >>> ' : '     ') + lineNum + ': ' + l;
    }).join('\n');

    return '## Error Fix Proposal\n\n**File:** `' + sourceFile + '`\n**Line:** ' + sourceLine + '\n**Root Cause:** ' + rootCause + '\n\n### Code Context\n```\n' + contextBlock + '\n```\n\n### Suggested Fix\n1. Open `' + sourceFile + '` at line ' + sourceLine + '\n2. Review the code in context\n3. ' + rootCause + '\n4. Apply the fix and retest';
  }
}
