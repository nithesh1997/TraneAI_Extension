/**
 * VoiceService handles audio recording and playback within the webview.
 * Uses browser MediaRecorder and AudioContext APIs.
 */
export class VoiceService {
    private mediaRecorder?: MediaRecorder;
    private audioChunks: Blob[] = [];

    /**
     * Starts recording audio from the microphone
     */
    async startRecording(): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    /**
     * Stops recording and returns the audio as a Blob
     */
    async stopRecording(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder) {
                reject(new Error('MediaRecorder not initialized'));
                return;
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
                
                // Stop all tracks to release microphone
                if (this.mediaRecorder?.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
                
                resolve(audioBlob);
            };

            this.mediaRecorder.onerror = (event) => {
                reject(new Error(`MediaRecorder error: ${(event as any).error?.name}`));
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * Plays audio from an ArrayBuffer
     */
    async playAudio(audioBuffer: ArrayBuffer): Promise<void> {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const buffer = await audioContext.decodeAudioData(audioBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Failed to play audio:', error);
            throw error;
        }
    }
}
