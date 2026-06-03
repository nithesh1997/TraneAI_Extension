import React, { useState, useRef } from 'react';
import { VoiceService } from '../utils/VoiceService';

interface VoiceControlsProps {
    onTranscription: (text: string) => void;
    isTyping: boolean;
}

declare const vscode: any;

export const VoiceControls: React.FC<VoiceControlsProps> = ({ onTranscription, isTyping }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const voiceServiceRef = useRef(new VoiceService());

    const toggleRecording = async () => {
        console.log('Voice button clicked. Current state:', isRecording);
        setError(null);

        if (isRecording) {
            try {
                console.log('Stopping recording...');
                const blob = await voiceServiceRef.current.stopRecording();
                console.log('Recording stopped. Blob size:', blob.size);
                setIsRecording(false);
                
                // Send to extension host for transcription
                const reader = new FileReader();
                reader.onload = () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    console.log('Sending audio data to extension host...');
                    vscode.postMessage({ command: 'voiceInput', audioData: arrayBuffer });
                };
                reader.readAsArrayBuffer(blob);
            } catch (err: any) {
                console.error('Failed to stop recording:', err);
                setError(err.message);
                setIsRecording(false);
            }
        } else {
            try {
                console.log('Starting recording...');
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('MediaDevices API not available in this environment');
                }
                await voiceServiceRef.current.startRecording();
                console.log('Recording started successfully');
                setIsRecording(true);
            } catch (err: any) {
                console.error('Recording failed:', err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setError('Permission Denied: Please allow VS Code to access your microphone in System Settings.');
                } else {
                    setError(err.message);
                }
            }
        }
    };

    return (
        <div className="voice-control-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {error && <span style={{ color: 'var(--danger)', fontSize: '10px' }} title={error}>⚠️</span>}
            <button 
                className={`voice-btn ${isRecording ? 'recording' : ''}`} 
                onClick={toggleRecording}
                disabled={isTyping}
                title={isRecording ? "Stop Recording" : (error ? `Error: ${error}` : "Voice Input")}
            >
            {isRecording ? (
                <div className="recording-indicator">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                    <div className="recording-dot"></div>
                </div>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
            )}
            </button>
        </div>
    );
};
