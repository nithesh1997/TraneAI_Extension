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
    
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'recordingStatus') {
                if (message.status === 'started') {
                    setIsRecording(true);
                    setError(null);
                } else if (message.status === 'stopped') {
                    setIsRecording(false);
                } else if (message.status === 'error') {
                    setError(`Native Recording Error: ${message.error}`);
                    setIsRecording(false);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const toggleRecording = async () => {
        console.log('Voice button clicked. Current state:', isRecording);
        setError(null);

        if (isRecording) {
            console.log('Sending stopNativeRecording message...');
            vscode.postMessage({ command: 'stopNativeRecording' });
            // The actual state update happens in the message listener
        } else {
            console.log('Sending startNativeRecording message...');
            vscode.postMessage({ command: 'startNativeRecording' });
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
