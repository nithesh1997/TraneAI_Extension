import fs from 'fs';
import path from 'path';

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
    
    if (!content.includes(oldString)) {
      return `ERROR: The exact text to replace was not found in the file.\n\nTo fix this:\n1. Use read_file first to get the exact current content\n2. Copy the EXACT text including all whitespace and formatting\n3. Make sure you're replacing the correct section\n\nThe oldString must match the file content exactly.`;
    }
    
    // Return as a proposal instead of writing directly
    return `[EDIT_PROPOSAL]\nfile: ${filePath}\nold: |\n${oldString}\nnew: |\n${newString}\nstatus: ready\nmessage: Targeted edit proposal\n[END_EDIT]`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
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

export async function deleteFile(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return `File not found: ${filePath}`;
  
  try {
    fs.unlinkSync(fullPath);
    return `Successfully deleted file: ${filePath}`;
  } catch (err: any) {
    return `Error deleting file: ${err.message}`;
  }
}

export async function renameFile(oldPath: string, newPath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullOldPath = path.join(workspaceRoot, oldPath);
  const fullNewPath = path.join(workspaceRoot, newPath);
  
  if (!fs.existsSync(fullOldPath)) return `File not found: ${oldPath}`;
  
  try {
    const newDir = path.dirname(fullNewPath);
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }
    fs.renameSync(fullOldPath, fullNewPath);
    return `Successfully renamed ${oldPath} to ${newPath}`;
  } catch (err: any) {
    return `Error renaming file: ${err.message}`;
  }
}

export async function searchFiles(query: string, workspaceRoot?: string): Promise<string> {
    if (!workspaceRoot) return 'Workspace root not found.';
    
    const results: string[] = [];
    const maxResults = 50;
    
    async function searchRecursive(dir: string) {
        if (results.length >= maxResults) return;
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
                
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(workspaceRoot!, fullPath);
                
                if (entry.isDirectory()) {
                    await searchRecursive(fullPath);
                } else {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        if (content.includes(query)) {
                            const lines = content.split('\n');
                            const matches = lines
                                .map((line, idx) => line.includes(query) ? `${idx + 1}: ${line.trim()}` : null)
                                .filter(Boolean);
                            
                            results.push(`File: ${relativePath}\n${matches.slice(0, 3).join('\n')}\n`);
                        }
                    } catch (e) {}
                }
                if (results.length >= maxResults) break;
            }
        } catch (e) {}
    }
    
    try {
        await searchRecursive(workspaceRoot);
        return results.length > 0 ? results.join('\n') : 'No matches found.';
    } catch (err: any) {
        return `Error searching files: ${err.message}`;
    }
}
