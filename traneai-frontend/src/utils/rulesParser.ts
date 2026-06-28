import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from '../services/SessionManager';

export function extractRulesForMode(workspaceRoot: string | undefined, mode: string): string | undefined {
    if (!workspaceRoot || !mode || mode === 'None') {
        return undefined;
    }

    const sessionManager = new SessionManager();
    const config = sessionManager.loadProjectConfig();
    
    if (config && config.roles) {
        // Find matching role key (case-insensitive, handling trailing 's' like Developer vs Developers)
        const matchedRoleKey = Object.keys(config.roles).find(k => {
            const kl = k.toLowerCase().replace(/-/g, ' ');
            const ml = mode.toLowerCase().replace(/-/g, ' ');
            return kl === ml || kl + 's' === ml || kl === ml + 's';
        });
        
        if (matchedRoleKey) {
            const roleData = config.roles[matchedRoleKey];
            if (roleData.enabled !== false && roleData.files && Array.isArray(roleData.files)) {
                console.log(`[TraneAI Rules] Found role data in config.json for mode '${mode}'.`);
                let combinedRules = '';
                
                for (const file of roleData.files) {
                    if (file.content) {
                        combinedRules += `\n\n--- [${file.name || file.id || 'Rule'}] ---\n\n${file.content}`;
                    } else if (file.path) {
                        const fileContent = sessionManager.loadRuleFile(file.path, file.encrypted);
                        if (fileContent) {
                            combinedRules += `\n\n--- [${file.name || file.id || 'Rule'}] ---\n\n${fileContent}`;
                        }
                    }
                }
                
                if (combinedRules.trim().length > 0) {
                    return combinedRules.trim();
                }
            }
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
