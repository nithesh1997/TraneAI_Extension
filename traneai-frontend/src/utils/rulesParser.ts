import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from '../services/SessionManager';

// Helper function to recursively find all files in a directory
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) {
        return arrayOfFiles;
    }
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

export function extractRulesForMode(workspaceRoot: string | undefined, mode: string): string | undefined {
    if (!workspaceRoot || !mode || mode === 'None') {
        return undefined;
    }

    const sessionManager = new SessionManager();
    const normalizedMode = mode.toLowerCase().replace(/-/g, ' ');
    const folderMode = normalizedMode.replace(/\s+/g, '-');
    
    // Try to find the directory for this mode
    // We assume the folder name matches the mode (e.g., 'developer', 'qa')
    const modeDir = path.join(workspaceRoot, '.traneAI', folderMode);
    
    if (fs.existsSync(modeDir)) {
        console.log(`[TraneAI Rules] Found role folder '${modeDir}' for mode '${mode}'.`);
        
        let combinedRules = '';
        const allFiles = getAllFiles(modeDir);
        
        for (const filePath of allFiles) {
            try {
                // Since files could be encrypted or not, we can't tell just from the extension
                // The filename might end with .enc or .json or .md.enc
                const isEncrypted = filePath.endsWith('.enc');
                
                // Read the file content
                let fileContent = '';
                if (isEncrypted) {
                    fileContent = sessionManager._decryptAndDecompress(fs.readFileSync(filePath)) || '';
                } else {
                    fileContent = fs.readFileSync(filePath, 'utf8');
                }
                
                if (fileContent) {
                    // Try parsing as JSON since we now save the full JSON object in the file
                    try {
                        const jsonObj = JSON.parse(fileContent);
                        if (jsonObj && jsonObj.content) {
                            combinedRules += `\n\n--- [${jsonObj.name || path.basename(filePath)}] ---\n\n${jsonObj.content}`;
                        } else {
                            // If it's a JSON object but has no content field, ignore or append whole?
                            // Let's assume content is the actual markdown
                        }
                    } catch (jsonErr) {
                        // If it's not JSON, fallback to appending raw content
                        combinedRules += `\n\n--- [${path.basename(filePath)}] ---\n\n${fileContent}`;
                    }
                }
            } catch (err) {
                console.error(`Failed to read/decrypt rule file ${filePath}:`, err);
            }
        }
        
        if (combinedRules.trim().length > 0) {
            return combinedRules.trim();
        }
    }

    // Fallback to reading markdown file for backwards compatibility
    const possiblePaths = [
        path.join(workspaceRoot, 'traneai-rules.md'),
        path.join(workspaceRoot, '.traneai-rules.md'),
        path.join(workspaceRoot, 'rules.md'),
    ];

    let rulesContent: string | undefined;

    for (const rulePath of possiblePaths) {
        if (fs.existsSync(rulePath)) {
            console.log(`[TraneAI Rules] Found rules file at: ${rulePath}`);
            try {
                rulesContent = fs.readFileSync(rulePath, 'utf8');
                break;
            } catch (error) {
                console.error(`Failed to read rules file at ${rulePath}:`, error);
            }
        }
    }

    if (!rulesContent) {
        return undefined;
    }

    // Parse the markdown
    const lines = rulesContent.split(/\r?\n/);
    let isCapturing = false;
    const capturedLines: string[] = [];

    let regexMode = mode.replace(/-/g, '\\s*');
    if (regexMode.toLowerCase().endsWith('s')) {
        regexMode = regexMode.slice(0, -1) + 's?';
    }
    
    const modeRegex = new RegExp(`^#+\\s*${regexMode}\\s*$`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.trim().startsWith('#')) {
            if (isCapturing) {
                break;
            } else if (modeRegex.test(line)) {
                isCapturing = true;
                continue;
            }
        }

        if (isCapturing) {
            capturedLines.push(line);
        }
    }

    const extracted = capturedLines.join('\n').trim();
    return extracted.length > 0 ? extracted : undefined;
}
