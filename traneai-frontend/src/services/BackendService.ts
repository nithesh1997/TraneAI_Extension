/**
 * BackendService handles communication between the webview and the extension backend API.
 * It sends chat messages, attachments, and workspace context to the local backend
 * and streams responses back into the extension UI.
 *
 * Supports three SSE event types:
 *   - 'token': Individual content tokens streamed from the AI (append to fullText)
 *   - 'step':  Tool execution step notifications (prepended to fullText)
 *   - 'done':  Signals end of stream
 *   - 'error': Server-side error during streaming
 */
export class BackendService {
    public static async sendChatMessage(
        message: string,
        history: any[],
        workspaceRoot: string | undefined,
        model: string | undefined,
        attachments: any[] | undefined,
        signal: AbortSignal | undefined,
        onUpdate: (text: string, isFinal: boolean) => void,
        modeRules?: string
    ): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('message', message);
            if (model) {
                formData.append('model', model);
            }

            formData.append('history', JSON.stringify(history));
            
            if (workspaceRoot) {
                formData.append('workspaceRoot', workspaceRoot);
            }

            if (modeRules) {
                formData.append('modeRules', modeRules);
            }

            const imageAttachments = attachments?.filter((a: any) => a.type === 'image' && a.imageData) ?? [];
            for (const imageAttachment of imageAttachments) {
                const imageBuffer = Buffer.from(imageAttachment.imageData, 'base64');
                const blob = new Blob([imageBuffer], { type: imageAttachment.mimeType || 'image/jpeg' });
                formData.append('images', blob, imageAttachment.name);
            }

            const response = await fetch('http://localhost:5000/api/chat/message?stream=true', {
                method: 'POST',
                body: formData,
                signal: signal as any,
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API failed: ${error}`);
            }

            if (response.headers.get('content-type')?.includes('application/json')) {
                const data = await response.json();
                const reply = data.message || 'No response';
                onUpdate(reply, true);
                return reply;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Streaming not supported');
            }

            let fullText = '';
            let steps: string[] = [];
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                // Keep the last (possibly incomplete) line in the buffer
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    let data: any;
                    try {
                        data = JSON.parse(line.slice(6));
                    } catch {
                        continue;
                    }

                    if (data.type === 'token') {
                        // Append individual token to the running content
                        fullText += data.content;
                        // Build display text: steps + content
                        const displayText = steps.length > 0
                            ? steps.join('\n') + '\n\n' + fullText
                            : fullText;
                        onUpdate(displayText, false);
                    } else if (data.type === 'step') {
                        steps.push(data.content);
                        const displayText = steps.join('\n') + (fullText ? '\n\n' + fullText : '');
                        onUpdate(displayText, false);
                    } else if (data.type === 'done') {
                        // Stream complete
                        const displayText = steps.length > 0
                            ? steps.join('\n') + '\n\n' + fullText
                            : fullText;
                        onUpdate(displayText, true);
                    } else if (data.type === 'error') {
                        const errorText = `Error: ${data.content}`;
                        onUpdate(errorText, true);
                        return errorText;
                    } else if (data.type === 'final') {
                        // Legacy support: some older backends may still send 'final'
                        fullText = data.content;
                        onUpdate(fullText, true);
                    }
                }
            }

            // If we exit the loop without a 'done' event, finalize
            const finalText = steps.length > 0
                ? steps.join('\n') + '\n\n' + fullText
                : fullText;
            onUpdate(finalText, true);
            return finalText;
        } catch (error: any) {
            console.error('TraneAI API Error:', error);
            const errorMsg = `Backend API error: ${error.message || 'Something went wrong'}`;
            onUpdate(errorMsg, true);
            return errorMsg;
        }
    }

    public static async login(email: string, password: string):Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
        try {
            const response = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.error || 'Login failed' };
            }
            return data;
        } catch (error: any) {
            return { success: false, error: error.message || 'Connection failed' };
        }
    }

    public static async signup(email: string, password: string):Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
        try {
            const response = await fetch('http://localhost:5000/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.error || 'Signup failed' };
            }
            return data;
        } catch (error: any) {
            return { success: false, error: error.message || 'Connection failed' };
        }
    }

    public static async fetchProjectConfig(projectName: string): Promise<{ success: boolean, data?: any, error?: string }> {
        try {
            const response = await fetch('http://localhost:5000/api/workspace/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName })
            });
            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.error || 'Failed to fetch config' };
            }
            return { success: true, data };
        } catch (error: any) {
            return { success: false, error: error.message || 'Connection failed' };
        }
    }

    public static async updateProjectConfig(projectName: string, project: any, roles: any): Promise<{ success: boolean, data?: any, error?: string }> {
        try {
            const response = await fetch('http://localhost:5000/api/workspace/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, project, roles })
            });
            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.error || 'Failed to update config' };
            }
            return { success: true, data };
        } catch (error: any) {
            return { success: false, error: error.message || 'Connection failed' };
        }
    }

    public static async syncModeFilesLocally(workspaceRoot: string, mode: string, config: any, machineId: string): Promise<void> {
        if (!config || !config.roles) return;
        const matchedRoleKey = Object.keys(config.roles).find(k => {
            const kl = k.toLowerCase().replace(/-/g, ' ');
            const ml = mode.toLowerCase().replace(/-/g, ' ');
            return kl === ml || kl + 's' === ml || kl === ml + 's';
        });
        if (!matchedRoleKey) return;
        
        const roleData = config.roles[matchedRoleKey];
        if (!roleData.files || !Array.isArray(roleData.files)) return;

        const fs = require('fs');
        const path = require('path');

        for (const file of roleData.files) {
            if (file.name === '.keep' || file.fileName === '.keep') continue;
            
            if (file.path) {
                try {
                    const response = await fetch('http://localhost:5000/api/workspace/file-content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rootPath: workspaceRoot, mid: machineId, filePath: file.path, isEncrypted: file.encrypted })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.content !== undefined) {
                            const fullPath = path.join(workspaceRoot, file.path);
                            const dir = path.dirname(fullPath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(fullPath, data.content, 'utf-8');
                        }
                    }
                } catch (err) {
                    console.error('Failed to sync mode file:', file.path, err);
                }
            }
        }
    }
}
