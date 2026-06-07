import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

/**
 * VoiceRecorder handles native audio recording in the Extension Host Using 'arecord'.
 * This bypasses Webview sandbox restrictions and eliminates buggy library dependencies.
 */
export class VoiceRecorder {
    private static instance: VoiceRecorder;
    private process: ChildProcess | undefined;
    private outputFilePath: string | undefined;

    private constructor() {}

    public static getInstance(): VoiceRecorder {
        if (!VoiceRecorder.instance) {
            VoiceRecorder.instance = new VoiceRecorder();
        }
        return VoiceRecorder.instance;
    }

    /**
     * Starts recording audio to a temporary file using arecord
     */
    public start(tempDir: string): string {
        if (this.process) {
            this.stop();
        }

        const fileName = `voice_${Date.now()}.wav`;
        this.outputFilePath = path.join(tempDir, fileName);
        
        try {
            // arecord -f S16_LE -r 16000 -c 1 -t wav filePath
            this.process = spawn('arecord', [
                '-f', 'S16_LE',
                '-r', '16000',
                '-c', '1',
                '-t', 'wav',
                this.outputFilePath
            ]);

            this.process.on('error', (err) => {
                console.error('arecord process error:', err);
                vscode.window.showErrorMessage(`Microphone error: ${err.message}. Ensure 'arecord' is installed.`);
            });

            console.log(`Native recording started with arecord: ${this.outputFilePath}`);
            return this.outputFilePath;
        } catch (error) {
            console.error('Failed to spawn arecord:', error);
            throw error;
        }
    }

    /**
     * Stops the current recording and returns the file path and audio data
     */
    public stop(): Promise<{ filePath: string; data: Buffer }> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.outputFilePath) {
                reject(new Error('No active recording process found'));
                return;
            }

            const filePath = this.outputFilePath;
            
            this.process.on('close', (code) => {
                console.log(`arecord process closed with code ${code}`);
                try {
                    if (fs.existsSync(filePath)) {
                        const data = fs.readFileSync(filePath);
                        resolve({ filePath, data });
                    } else {
                        reject(new Error('Recording file not found after arecord stopped'));
                    }
                } catch (error) {
                    reject(error);
                }
            });

            // Gracefully stop
            this.process.kill('SIGINT');
            this.process = undefined;
            this.outputFilePath = undefined;
        });
    }

    public cleanup(filePath: string) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error(`Failed to cleanup temp file ${filePath}:`, error);
        }
    }
}
