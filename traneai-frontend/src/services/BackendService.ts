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
        onUpdate: (text: string, isFinal: boolean) => void
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
}
