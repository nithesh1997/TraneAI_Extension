import * as fs from 'fs';
import * as path from 'path';

export function extractRulesForMode(workspaceRoot: string | undefined, mode: string): string | undefined {
    if (!workspaceRoot || !mode || mode === 'None') {
        return undefined;
    }

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
        } else {
            console.log(`[TraneAI Rules] Checked path but not found: ${rulePath}`);
        }
    }

    if (!rulesContent) {
        return undefined;
    }

    // Parse the markdown
    const lines = rulesContent.split(/\r?\n/);
    let isCapturing = false;
    const capturedLines: string[] = [];

    // Normalize mode string for matching:
    // e.g., 'new-joiner' -> 'new joiner'
    // 'developers' -> 'developer(s)?'
    let normalizedMode = mode.replace(/-/g, '\\s*');
    if (normalizedMode.toLowerCase().endsWith('s')) {
        normalizedMode = normalizedMode.slice(0, -1) + 's?';
    }
    
    // Allow looking for # Mode, ## Mode, etc. (case insensitive)
    const modeRegex = new RegExp(`^#+\\s*${normalizedMode}\\s*$`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // If we hit any heading
        if (line.trim().startsWith('#')) {
            if (isCapturing) {
                // We reached the NEXT heading, stop capturing
                break;
            } else if (modeRegex.test(line)) {
                // We found our heading, start capturing
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
