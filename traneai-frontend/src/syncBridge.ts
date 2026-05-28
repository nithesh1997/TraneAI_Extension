import * as vscode from 'vscode';
import { SyncMessage, MessageType } from './types';

export class SyncBridge {
    private static instance: SyncBridge;
    private _onMessage = new vscode.EventEmitter<SyncMessage>();
    public readonly onMessage = this._onMessage.event;
    private webviewPanel: vscode.WebviewPanel | vscode.WebviewView | undefined;

    private constructor() {}

    public static getInstance(): SyncBridge {
        if (!SyncBridge.instance) {
            SyncBridge.instance = new SyncBridge();
        }
        return SyncBridge.instance;
    }

    public setWebview(webview: vscode.WebviewPanel | vscode.WebviewView) {
        this.webviewPanel = webview;
    }

    public postMessage(message: SyncMessage) {
        // Internal extension dispatch
        this._onMessage.fire(message);

        // Webview dispatch
        if (this.webviewPanel) {
            this.webviewPanel.webview.postMessage(message);
        }
    }

    public send(type: MessageType, payload: any) {
        const message: SyncMessage = {
            type,
            payload,
            timestamp: Date.now()
        };
        this.postMessage(message);
    }
}
