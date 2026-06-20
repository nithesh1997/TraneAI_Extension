import fs from 'fs';
import path from 'path';

function normalizeWS(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function normalizeQuotes(s: string): string {
  return s.replace(/["']/g, "'");
}

function fuzzyFindMatch(haystack: string, needle: string): { index: number, text: string } | null {
  const exactIdx = haystack.indexOf(needle);
  if (exactIdx !== -1) return { index: exactIdx, text: needle };

  const nNeedle = needle.replace(/["']/g, "'");
  const nHaystack = haystack.replace(/["']/g, "'");
  const qIdx = nHaystack.indexOf(nNeedle);
  if (qIdx !== -1) return { index: qIdx, text: haystack.substring(qIdx, qIdx + needle.length) };

  interface Char { char: string; index: number; }
  const hChars: Char[] = [];
  for (let i = 0; i < haystack.length; i++) {
    if (!/\s/.test(haystack[i])) {
      hChars.push({ char: haystack[i] === '"' ? "'" : haystack[i], index: i });
    }
  }

  const nChars: string[] = [];
  for (let i = 0; i < needle.length; i++) {
    if (!/\s/.test(needle[i])) {
      nChars.push(needle[i] === '"' ? "'" : needle[i]);
    }
  }

  if (nChars.length === 0) return null;

  for (let i = 0; i <= hChars.length - nChars.length; i++) {
    let match = true;
    for (let j = 0; j < nChars.length; j++) {
      if (hChars[i + j].char !== nChars[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      let startIndex = hChars[i].index;
      let endIndex = hChars[i + nChars.length - 1].index;

      const leadingWsMatch = needle.match(/^(\s+)/);
      if (leadingWsMatch) {
        let hWsStart = startIndex;
        while (hWsStart > 0 && /\s/.test(haystack[hWsStart - 1])) {
          if (haystack[hWsStart - 1] === '\n' && !leadingWsMatch[1].includes('\n')) break;
          hWsStart--;
        }
        startIndex = hWsStart;
      }

      const trailingWsMatch = needle.match(/(\s+)$/);
      if (trailingWsMatch) {
        let hWsEnd = endIndex;
        while (hWsEnd < haystack.length - 1 && /\s/.test(haystack[hWsEnd + 1])) {
          if (haystack[hWsEnd + 1] === '\n' && !trailingWsMatch[1].includes('\n')) break;
          hWsEnd++;
        }
        endIndex = hWsEnd;
      }

      return {
        index: startIndex,
        text: haystack.substring(startIndex, endIndex + 1)
      };
    }
  }

  return null;
}

export function findMatch(content: string, oldString: string): number {
  const match = fuzzyFindMatch(content, oldString);
  return match ? match.index : -1;
}

export async function listFiles(workspaceRoot?: string, directory: string = '.'): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const targetDir = path.join(workspaceRoot, directory);
  if (!fs.existsSync(targetDir)) return 'Directory not found: ' + directory;
  try {
    const files = fs.readdirSync(targetDir, { withFileTypes: true });
    let result = 'Contents of ' + directory + ':\n';
    for (const file of files) {
      if (file.name === 'node_modules' || file.name === '.git') continue;
      result += (file.isDirectory() ? '[DIR] ' : '[FILE] ') + file.name + '\n';
    }
    return result;
  } catch (err: any) {
    return 'Error listing files: ' + err.message;
  }
}

export async function readFile(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return 'File not found: ' + filePath;
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (err: any) {
    return 'Error reading file: ' + err.message;
  }
}

export async function createFile(filePath: string, content: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  if (!content || typeof content !== 'string') return 'ERROR: content is empty or missing. You must provide file content.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (fs.existsSync(fullPath)) return 'ERROR: File already exists: ' + filePath + '. Use edit_file or write_file instead.';
  
  return '[EDIT_PROPOSAL]\nfile: ' + filePath + '\nold: |\n\nnew: |\n' + content + '\nstatus: ready\nmessage: Proposal to create new file\n[END_EDIT]';
}

export async function writeFile(filePath: string, content: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  if (!content || typeof content !== 'string') return 'ERROR: content is empty or missing.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return 'File not found: ' + filePath + '. Use create_file to create a new file.';
  
  let oldContent = '';
  try {
    oldContent = fs.readFileSync(fullPath, 'utf-8');
  } catch (e) {
    return 'ERROR: Could not read existing file to generate proposal.';
  }

  return '[EDIT_PROPOSAL]\nfile: ' + filePath + '\nold: |\n' + oldContent + '\nnew: |\n' + content + '\nstatus: ready\nmessage: Proposal to overwrite file\n[END_EDIT]';
}

export async function editFile(filePath: string, oldString: string, newString: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  if (!oldString || typeof oldString !== 'string') return 'ERROR: oldString is empty or missing. You must provide the exact text to find and replace.';
  if (newString === undefined || newString === null) return 'ERROR: newString is missing. You must provide the replacement text.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return 'File not found: ' + filePath;
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const match = fuzzyFindMatch(content, oldString);
    if (!match) {
      return 'ERROR: The text to replace was not found in ' + filePath + '.\n\n' +
        'This usually means the oldString has incorrect whitespace, indentation, or content.\n\n' +
        'To fix this:\n' +
        '1. Use read_file to get the EXACT current content of ' + filePath + '\n' +
        '2. Copy the EXACT text including ALL whitespace from the file\n' +
        '3. Verify that your oldString matches the file content character-for-character\n' +
        '4. For adding NEW code, include 2-3 lines of surrounding context as oldString\n\n' +
        'Common mistakes:\n' +
        '- Indentation differs (file uses tabs, you used spaces or vice versa)\n' +
        '- You are trying to insert code but did not include enough surrounding context\n' +
        '- The surrounding code you referenced does not exist in the file (wrong file?)';
    }
    const matchedText = match.text;
    return '[EDIT_PROPOSAL]\nfile: ' + filePath + '\nold: |\n' + matchedText + '\nnew: |\n' + newString + '\nstatus: ready\nmessage: Targeted edit proposal\n[END_EDIT]';
  } catch (err: any) {
    return 'Error editing file: ' + err.message;
  }
}

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
        if (entry.isDirectory()) { walkDir(fullPath); }
        else if (entry.isFile()) {
          const relPath = path.relative(workspaceRoot, fullPath);
          const name = entry.name.toLowerCase();
          let score = 0;
          if (name === lowerQuery) score += 100;
          else if (name.startsWith(lowerQuery)) score += 50;
          else if (name.includes(lowerQuery)) score += 25;
          let qi = 0;
          for (const ch of name) { if (qi < lowerQuery.length && ch === lowerQuery[qi]) qi++; }
          if (qi === lowerQuery.length && lowerQuery.length > 1) score += 40 - lowerQuery.length;
          const depth = relPath.split(/[\\/]/).length;
          score -= depth * 2;
          if (score > 0) results.push({ path: relPath, score });
        }
      }
    } catch { /* skip */ }
  };
  walkDir(workspaceRoot);
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, maxResults);
  if (top.length === 0) return 'No matching files found.';
  return top.map((r, i) => (i + 1) + '. ' + r.path).join('\n');
}

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

// Requirement 4: analyze_code with structural landmarks for accurate edit placement
export async function analyzeCode(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return 'File not found: ' + filePath;
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();

    const imports: string[] = [];
    const exports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    const interfaces: string[] = [];

    // Structural landmarks for accurate edit placement
    let lastImportLine = -1;
    let functionStartLine = -1;
    let componentBodyStartLine = -1;
    let returnLine = -1;
    let functionEndLine = -1;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNum = index + 1;

      if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
        if (trimmed.match(/^import\s+.*from\s+['"]/)) {
          imports.push(lineNum + ': ' + trimmed);
          lastImportLine = lineNum;
        } else if (trimmed.match(/^export\s+(default\s+)?(class|function|const|interface|type)/)) {
          const match = trimmed.match(/export\s+(default\s+)?(class|function|const|interface|type)\s+(\w+)/);
          if (match) exports.push(match[3] + ' (' + match[2] + ')');
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

      // Detect structural landmarks
      if (trimmed.startsWith('import ')) lastImportLine = lineNum;
      if (trimmed.match(/(?:export\s+)?(?:function\s+|class\s+|const\s+\w+\s*=\s*(?:async\s*)?\()/) && functionStartLine === -1) {
        functionStartLine = lineNum;
      }
      if (trimmed.startsWith('return ') || trimmed.startsWith('return(') || trimmed.startsWith('return (')) {
        if (returnLine === -1) returnLine = lineNum;
      }
      // Detect component body start (after opening brace of function/component)
      if (functionStartLine !== -1 && componentBodyStartLine === -1) {
        if (trimmed.includes('=>') || trimmed.includes('){') || trimmed.includes(') {')) {
          componentBodyStartLine = lineNum + 1;
        }
      }
    });

    // Find function end (closing brace)
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (functionEndLine === -1 && (trimmed === '}' || trimmed === '});' || trimmed === '})')) {
        const beforeLine = i > 0 ? lines[i - 1].trim() : '';
        if (!beforeLine.includes('=>') && !beforeLine.includes('{')) {
          functionEndLine = i + 1;
        }
      }
    }

    let analysis = '## Code Analysis: ' + path.basename(filePath) + '\n\n';
    analysis += '**File:** ' + filePath + '\n';
    analysis += '**Lines:** ' + lines.length + '\n';
    analysis += '**Language:** ' + (ext.slice(1) || 'unknown') + '\n\n';

    // Requirement 4: Structural landmarks
    analysis += '### STRUCTURAL LANDMARKS (for edit placement)\n';
    if (lastImportLine > 0) analysis += '- Last import statement: line ' + lastImportLine + '\n';
    if (functionStartLine > 0) analysis += '- Component/function starts: line ' + functionStartLine + '\n';
    if (componentBodyStartLine > 0) analysis += '- Component body starts: line ' + componentBodyStartLine + '\n';
    if (returnLine > 0) analysis += '- Return statement: line ' + returnLine + ' (DO NOT place code after this line)\n';
    if (functionEndLine > 0) analysis += '- Component/function ends: line ' + functionEndLine + '\n';
    analysis += '\n';

    // Placement guidance
    analysis += '### PLACEMENT GUIDE\n';
    analysis += '- Add NEW imports: at line ' + (lastImportLine > 0 ? lastImportLine + 1 : 1) + ' (after last import)\n';
    analysis += '- Add React hooks/state: at line ' + (componentBodyStartLine > 0 ? componentBodyStartLine : functionStartLine + 1) + ' (top of function body, before return)\n';
    analysis += '- Add functions/methods: before line ' + (functionEndLine > 0 ? functionEndLine : lines.length) + ' (before closing brace)\n';
    analysis += '- Add JSX elements: before the closing tag (line ' + (returnLine > 0 ? returnLine + 1 : 'after return') + ')\n\n';

    if (classes.length > 0) analysis += '### Classes\n' + classes.map(c => '- ' + c).join('\n') + '\n\n';
    if (interfaces.length > 0) analysis += '### Interfaces\n' + interfaces.map(i => '- ' + i).join('\n') + '\n\n';
    if (functions.length > 0) analysis += '### Functions/Methods\n' + functions.map(f => '- ' + f).join('\n') + '\n\n';
    if (exports.length > 0) analysis += '### Exports\n' + exports.map(e => '- ' + e).join('\n') + '\n\n';
    if (imports.length > 0) {
      analysis += '### Imports (first 10)\n' + imports.slice(0, 10).join('\n') + '\n';
      if (imports.length > 10) analysis += '\n... and ' + (imports.length - 10) + ' more imports';
    }
    analysis += '\n\n### Code Preview (first 50 lines)\n```' + (ext.slice(1) || 'text') + '\n' + lines.slice(0, 50).join('\n') + '\n```';
    return analysis;
  } catch (err: any) {
    return 'Error analyzing file: ' + err.message;
  }
}

// Requirement 2: Search symbols across workspace
export async function searchBySymbol(query: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const lowerQuery = query.toLowerCase().replace(/[^a-z0-9_$]/g, '');
  const results: { filePath: string; symbols: { name: string; type: string; line?: number }[] }[] = [];

  const walkDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walkDir(fullPath); }
        else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(workspaceRoot, fullPath);
              const fileSymbols: { name: string; type: string; line?: number }[] = [];
              const lines = content.split('\n');
              lines.forEach((line, i) => {
                const trimmed = line.trim();
                const lineNum = i + 1;
                const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
                if (classMatch && classMatch[1].toLowerCase() === lowerQuery) fileSymbols.push({ name: classMatch[1], type: 'class', line: lineNum });
                const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
                if (interfaceMatch && interfaceMatch[1].toLowerCase() === lowerQuery) fileSymbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum });
                const funcMatch = trimmed.match(/(?:export\s+)?(?:function\s+|const\s+\w+\s*=\s*(?:async\s*)?\()(\w+)/);
                if (funcMatch && funcMatch[1].toLowerCase() === lowerQuery) fileSymbols.push({ name: funcMatch[1], type: 'function', line: lineNum });
                if (trimmed.includes(query) && !trimmed.startsWith('import ')) fileSymbols.push({ name: query, type: 'reference', line: lineNum });
              });
              if (fileSymbols.length > 0) results.push({ filePath: relPath, symbols: fileSymbols });
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  };

  walkDir(workspaceRoot);
  if (results.length === 0) return 'No results found for symbol "' + query + '".';
  let output = '## Search Results: "' + query + '"\n\n';
  for (const r of results) {
    const definitions = r.symbols.filter(s => s.type !== 'reference');
    const references = r.symbols.filter(s => s.type === 'reference');
    if (definitions.length > 0) {
      output += '**' + r.filePath + '** (definition)\n';
      for (const s of definitions) output += '  ' + s.type + ' `' + s.name + '` at line ' + s.line + '\n';
    }
    if (references.length > 0 && definitions.length === 0) {
      output += '**' + r.filePath + '** (reference)\n';
      output += '  ' + references.length + ' reference(s)\n';
    }
    output += '\n';
  }
  return output;
}

// Requirement 2: Find all references of a symbol
export async function findReferences(symbolName: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const lowerSymbol = symbolName.toLowerCase();
  const definitions: { filePath: string; line: number; context: string }[] = [];
  const references: { filePath: string; line: number; context: string }[] = [];

  const walkDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walkDir(fullPath); }
        else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(workspaceRoot, fullPath);
              const lines = content.split('\n');
              lines.forEach((line, i) => {
                const trimmed = line.trim();
                const lineNum = i + 1;
                const isClassDef = (trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)?.[1])?.toLowerCase() === lowerSymbol;
                const isInterfaceDef = (trimmed.match(/(?:export\s+)?interface\s+(\w+)/)?.[1])?.toLowerCase() === lowerSymbol;
                const isFuncDef = (trimmed.match(/(?:export\s+)?(?:function\s+|const\s+\w+\s*=\s*(?:async\s*)?\()(\w+)/)?.[1])?.toLowerCase() === lowerSymbol;
                const isImport = trimmed.startsWith('import ') && trimmed.toLowerCase().includes(lowerSymbol);
                if (isClassDef || isInterfaceDef || isFuncDef) {
                  definitions.push({ filePath: relPath, line: lineNum, context: trimmed.substring(0, 60) });
                } else if (trimmed.toLowerCase().includes(lowerSymbol) && !isImport) {
                  references.push({ filePath: relPath, line: lineNum, context: trimmed.substring(0, 60) });
                }
              });
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  };

  walkDir(workspaceRoot);
  let output = '## References: "' + symbolName + '"\n\n';
  if (definitions.length > 0) {
    output += '### Definitions (' + definitions.length + ')\n';
    for (const d of definitions) output += '- `' + d.filePath + ':' + d.line + '` -- ' + d.context + '\n';
    output += '\n';
  }
  if (references.length > 0) {
    output += '### References (' + references.length + ')\n';
    for (const r of references.slice(0, 30)) output += '- `' + r.filePath + ':' + r.line + '` -- ' + r.context + '\n';
    if (references.length > 30) output += '\n... and ' + (references.length - 30) + ' more references\n';
  }
  if (definitions.length === 0 && references.length === 0) output += 'No references found.';
  return output;
}
