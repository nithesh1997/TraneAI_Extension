import * as vscode from 'vscode';
import { getBrowserHtml } from './panelHtml';
import { SyncBridge } from '../syncBridge';
import { MessageType } from '../types';

export class BrowserPanel {
    public static currentPanel: BrowserPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, initialUrl: string = 'http://localhost:3000') {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update(initialUrl);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                const syncBridge = SyncBridge.getInstance();
                syncBridge.postMessage(message);
            },
            null,
            this._disposables
        );

        // Listen for internal navigation messages
        SyncBridge.getInstance().onMessage(message => {
            if (message.type === MessageType.NAVIGATE) {
                this._panel.webview.postMessage(message);
            }
        });

        SyncBridge.getInstance().setWebview(this._panel);
    }

    public static createOrShow(extensionUri: vscode.Uri, initialUrl: string = 'http://localhost:3000') {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (BrowserPanel.currentPanel) {
            BrowserPanel.currentPanel._panel.reveal(column);
            if (initialUrl !== 'http://localhost:3000') {
                BrowserPanel.currentPanel._update(initialUrl);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'traneaiBrowser',
            'TraneAI Browser',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
            }
        );

        BrowserPanel.currentPanel = new BrowserPanel(panel, extensionUri, initialUrl);
    }

    private _update(initialUrl: string = 'http://localhost:3000') {
        this._panel.webview.html = getBrowserHtml(this._panel.webview, this._extensionUri, initialUrl);
    }

    public dispose() {
        BrowserPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
