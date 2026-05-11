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
