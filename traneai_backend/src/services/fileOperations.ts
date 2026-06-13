import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Fuzzy / smart string matching helpers
// ---------------------------------------------------------------------------

/** Normalize whitespace: collapse runs of spaces/tabs, trim, unify line endings */
function normalizeWS(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Find the best fuzzy match position of `needle` in `haystack`.
 * Returns the index of the match or -1.
 *
 * Strategy ladder:
 *  1. Exact match (fast path)
 *  2. Line-based normalized match (handles whitespace/indentation diffs)
 */
function fuzzyIndexOf(haystack: string, needle: string): number {
  // 1 – exact
  const idx = haystack.indexOf(needle);
  if (idx !== -1) return idx;

  // 2 – line-based fuzzy
  return fuzzyLineMatch(haystack, needle);
}

/**
 * Line-based fuzzy match: split both strings into lines, normalize each line,
 * find the block in haystack that best matches the needle lines.
 */
function fuzzyLineMatch(haystack: string, needle: string): number {
  const hLines = haystack.split('\n');
  const nLines = needle.split('\n');
  if (nLines.length === 0) return -1;

  // Normalize each line (trim right, collapse internal whitespace)
  const normHLines = hLines.map(l => l.trimEnd().replace(/[ \t]+/g, ' '));
  const normNLines = nLines.map(l => l.trimEnd().replace(/[ \t]+/g, ' '));

  const firstLine = normNLines[0];
  if (!firstLine) return -1;

  let bestScore = -1;
  let bestStart = -1;

  for (let i = 0; i < normHLines.length; i++) {
    if (normHLines[i] === firstLine) {
      let score = 0;
      for (let j = 0; j < normNLines.length && i + j < normHLines.length; j++) {
        if (normHLines[i + j] === normNLines[j]) {
          score++;
        } else if (normHLines[i + j].includes(normNLines[j]) || normNLines[j].includes(normHLines[i + j])) {
          score += 0.5;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
  }

  if (bestStart === -1 || bestScore < Math.max(1, nLines.length * 0.3)) return -1;

  // Map line start back to character index
  let charIdx = 0;
  for (let i = 0; i < bestStart; i++) {
    const nextIdx = haystack.indexOf('\n', charIdx);
    if (nextIdx === -1) return -1;
    charIdx = nextIdx + 1;
  }
  return charIdx;
}

/** Try to find the oldString in the file content using fuzzy matching */
export function findMatch(content: string, oldString: string): number {
  return fuzzyIndexOf(content, oldString);
}

// ---------------------------------------------------------------------------
// Existing helpers (unchanged signature)
// ---------------------------------------------------------------------------

export async function listFiles(workspaceRoot?: string, directory: string = '.'): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const targetDir = path.join(workspaceRoot, directory);
  if (!fs.existsSync(targetDir)) return `Directory not found: ${directory}`;
  
  try {
    const files = fs.readdirSync(targetDir, { withFileTypes: true });
    let result = `Contents of ${directory}:\n`;
    for (const file of files) {
      if (file.name === 'node_modules' || file.name === '.git') continue;
      result += `${file.isDirectory() ? '[DIR]' : '[FILE]'} ${file.name}\n`;
    }
    return result;
  } catch (err: any) {
    return `Error listing files: ${err.message}`;
  }
}

export async function readFile(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return `File not found: ${filePath}`;
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return content;
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

export async function createFile(filePath: string, content: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  
  // Return as a proposal instead of writing directly
  return `[EDIT_PROPOSAL]\nfile: ${filePath}\nold: |\n(NEW FILE)\nnew: |\n${content}\nstatus: ready\nmessage: Proposal to create new file\n[END_EDIT]`;
}

export async function writeFile(filePath: string, content: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return `File not found: ${filePath}. Use create_file to create a new file.`;
  }

  const oldContent = fs.readFileSync(fullPath, 'utf-8');
  
  // Return as a proposal instead of writing directly
  return `[EDIT_PROPOSAL]\nfile: ${filePath}\nold: |\n${oldContent}\nnew: |\n${content}\nstatus: ready\nmessage: Proposal to overwrite file contents\n[END_EDIT]`;
}

export async function editFile(filePath: string, oldString: string, newString: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return `File not found: ${filePath}`;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const matchIdx = fuzzyIndexOf(content, oldString);
    
    if (matchIdx === -1) {
      return `ERROR: The exact text to replace was not found in the file.\n\nTo fix this:\n1. Use read_file first to get the exact current content\n2. Copy the EXACT text including all whitespace and formatting\n3. Make sure you're replacing the correct section\n\nThe oldString must match the file content exactly.`;
    }
    
    const matchedText = content.substring(matchIdx, matchIdx + oldString.length);
    return `[EDIT_PROPOSAL]\nfile: ${filePath}\nold: |\n${matchedText}\nnew: |\n${newString}\nstatus: ready\nmessage: Targeted edit proposal\n[END_EDIT]`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}

/** Fuzzy find files by partial name match */
export async function fuzzyFindFile(query: string, workspaceRoot?: string, maxResults: number = 15): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const lowerQuery = query.toLowerCase();
  
  const results: Array<{ path: string; score: number }> = [];

  const walkDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(workspaceRoot, fullPath);
          const name = entry.name.toLowerCase();
          
          let score = 0;
          if (name === lowerQuery) score += 100;
          else if (name.startsWith(lowerQuery)) score += 50;
          else if (name.includes(lowerQuery)) score += 25;
          
          // Fuzzy character match
          let qi = 0;
          for (const ch of name) {
            if (qi < lowerQuery.length && ch === lowerQuery[qi]) qi++;
          }
          if (qi === lowerQuery.length && lowerQuery.length > 1) score += 40 - lowerQuery.length;
          
          // Penalize deep paths
          const depth = relPath.split(/[\\/]/).length;
          score -= depth * 2;
          
          if (score > 0) results.push({ path: relPath, score });
        }
      }
    } catch { /* skip unreadable dirs */ }
  };

  walkDir(workspaceRoot);
  results.sort((a, b) => b.score - a.score);
  
  const top = results.slice(0, maxResults);
  if (top.length === 0) return 'No matching files found.';
  return top.map((r, i) => `${i + 1}. ${r.path}`).join('\n');
}

/** Smart multi-file edit: creates a combined proposal block */
export async function multiFileEdit(
  changes: { filePath: string; oldString: string; newString: string }[],
  workspaceRoot?: string
): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const parts: string[] = [];
  for (const change of changes) {
    const result = await editFile(change.filePath, change.oldString, change.newString, workspaceRoot);
    parts.push(result);
  }
  return parts.join('\n');
}

export async function analyzeCode(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  
  if (!fs.existsSync(fullPath)) return `File not found: ${filePath}`;
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();
    
    const imports: string[] = [];
    const exports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    const interfaces: string[] = [];
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNum = index + 1;
      
      if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
        if (trimmed.match(/^import\s+.*from\s+['"]/)) {
          imports.push(`${lineNum}: ${trimmed}`);
        } else if (trimmed.match(/^export\s+(default\s+)?(class|function|const|interface|type)/)) {
          const match = trimmed.match(/export\s+(default\s+)?(class|function|const|interface|type)\s+(\w+)/);
          if (match) exports.push(`${match[3]} (${match[2]})`);
        } else if (trimmed.match(/^class\s+\w+/)) {
          const match = trimmed.match(/class\s+(\w+)/);
          if (match) classes.push(match[1]);
        } else if (trimmed.match(/^(export\s+)?(function|const|let|var)\s+\w+\s*=/)) {
          const match = trimmed.match(/(function|const|let|var)\s+(\w+)/);
          if (match && match[1] !== 'function') functions.push(match[2]);
          else if (match && match[1] === 'function') functions.push(trimmed.replace(/^(export\s+)?function\s+/, '').split('(')[0]);
        } else if (trimmed.match(/^interface\s+\w+/)) {
          const match = trimmed.match(/interface\s+(\w+)/);
          if (match) interfaces.push(match[1]);
        }
      }
    });
    
    let analysis = `## Code Analysis: ${path.basename(filePath)}\n\n`;
    analysis += `**File:** ${filePath}\n`;
    analysis += `**Lines:** ${lines.length}\n`;
    analysis += `**Language:** ${ext.slice(1) || 'unknown'}\n\n`;
    
    if (classes.length > 0) {
      analysis += `### Classes\n${classes.map(c => `- ${c}`).join('\n')}\n\n`;
    }
    if (interfaces.length > 0) {
      analysis += `### Interfaces\n${interfaces.map(i => `- ${i}`).join('\n')}\n\n`;
    }
    if (functions.length > 0) {
      analysis += `### Functions/Methods\n${functions.map(f => `- ${f}`).join('\n')}\n\n`;
    }
    if (exports.length > 0) {
      analysis += `### Exports\n${exports.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    if (imports.length > 0) {
      analysis += `### Imports (first 10)\n${imports.slice(0, 10).join('\n')}\n`;
      if (imports.length > 10) analysis += `\n... and ${imports.length - 10} more imports`;
    }
    
    analysis += `\n\n### Code Preview (first 50 lines)\n\`\`\`${ext.slice(1) || 'text'}\n${lines.slice(0, 50).join('\n')}\n\`\`\``;
    
    return analysis;
  } catch (err: any) {
    return `Error analyzing file: ${err.message}`;
  }
}
