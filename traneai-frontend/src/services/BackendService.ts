/**
 * BackendService handles communication between the webview and the extension backend API.
 * It sends chat messages, attachments, and workspace context to the local backend
 * and streams responses back into the extension UI.
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
        context?: any
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

            if (context) {
                formData.append('context', JSON.stringify(context));
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
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'step') {
                            fullText += (fullText ? '\n' : '') + data.content;
                            onUpdate(fullText, false);
                        } else if (data.type === 'final') {
                            fullText = data.content;
                            onUpdate(fullText, true);
                        }
                    }
                }
            }

            return fullText;
        } catch (error: any) {
            console.error('TraneAI API Error:', error);
            const errorMsg = `Backend API error: ${error.message || 'Something went wrong'}`;
            onUpdate(errorMsg, true);
            return errorMsg;
        }
    }

    public static async transcribeAudio(audioBlob: Blob): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.wav');

            const response = await fetch('http://localhost:5000/api/voice/transcribe', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Transcription failed: ${error}`);
            }

            const data = await response.json();
            return data.text || '';
        } catch (error: any) {
            console.error('Transcription error:', error);
            throw error;
        }
    }

    public static async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
        try {
            const response = await fetch('http://localhost:5000/api/voice/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`TTS failed: ${error}`);
            }

            return await response.arrayBuffer();
        } catch (error: any) {
            console.error('TTS error:', error);
            throw error;
        }
    }
}
