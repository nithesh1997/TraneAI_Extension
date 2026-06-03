/**
 * ChatViewProvider is the main VS Code webview provider for TraneAI chat.
 * It renders the chat UI, manages session state, handles webview messages,
 * and delegates AI/automation actions to the backend and helper services.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildWebviewHtml } from './webview/WebviewTemplate';
import { CheckpointManager } from './services/checkpointManager';
import { AutomationWorkflows } from './services/AutomationWorkflows';
import { SessionManager, SessionMessage, ChatSession, SessionSummary } from './services/SessionManager';
import { BackendService } from './services/BackendService';
import { ChatActionHandler, IChatProvider } from './services/ChatActionHandler';
import { handleWebviewMessage } from './services/MessageHandler';
import { ConsoleService, LogEntry } from './services/ConsoleService';
import { ContextCollector } from './services/ContextCollector';

export class ChatViewProvider implements vscode.WebviewViewProvider, IChatProvider {
	public static readonly viewType = 'traneai.chatView';
	private _view?: vscode.WebviewView;
	private _panel?: vscode.WebviewPanel;
	private _isFullScreenActive = false;
	private _messages: SessionMessage[] = [];
	private _activeBrowserUrl: string | undefined;
	private _streamInterval?: ReturnType<typeof setInterval>;
	public abortController?: AbortController;

	public currentSessionId: string = '';
	public userEmail: string = '';
	private _checkpointManager: CheckpointManager;
	public pendingChoices = new Map<string, (value: string) => void>();
    public automationWorkflows = new AutomationWorkflows(this);
	public sessionManager: SessionManager;
	public actionHandler: ChatActionHandler;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this._checkpointManager = new CheckpointManager(_extensionUri);
		this.sessionManager = new SessionManager();
		this.actionHandler = new ChatActionHandler(this);

		// Listen for console logs
		ConsoleService.getInstance().onDidUpdateLogs(logs => {
			this.postMessageToWebview({ type: 'consoleLogs', logs });
		});
	}

	public findWorkspaceAppRoot(): string | undefined {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return undefined;
		}

		// Try to find the folder containing package.json or other markers
		for (const folder of workspaceFolders) {
			const root = folder.uri.fsPath;
			if (fs.existsSync(path.join(root, 'package.json')) || 
				fs.existsSync(path.join(root, 'pom.xml')) ||
				fs.existsSync(path.join(root, 'requirements.txt')) ||
				fs.existsSync(path.join(root, 'go.mod'))) {
				return root;
			}
		}

		return workspaceFolders[0].uri.fsPath;
	}

	public get checkpointManager() {
		return this._checkpointManager;
	}

	public createNewSession(): void {
		this.currentSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
		this._messages = [];
	}

	public saveCurrentSession(forceUpdateTimestamp: boolean = true): void {
		this.sessionManager.saveSession(this.currentSessionId, this.userEmail, this._messages, forceUpdateTimestamp);
	}

	public loadSessionList(): SessionSummary[] {
		return this.sessionManager.loadSessionList(this.userEmail);
	}

	public loadSessionById(sessionId: string): void {
		const session = this.sessionManager.loadSessionById(sessionId, this.userEmail);
		if (session) {
			this.currentSessionId = session.id;
			this._messages = session.messages;
			this.syncMessages();
		}
	}

	public deleteSession(sessionId: string): void {
		this.sessionManager.deleteSession(sessionId);
		if (this.currentSessionId === sessionId) {
			this.createNewSession();
			this.syncMessages();
		}
		this.broadcastHistoryList();
	}

	public broadcastHistoryList(): void {
		const sessions = this.loadSessionList();
		const workspaceOpen = !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
		const msg = { type: 'historyList', sessions, currentSessionId: this.currentSessionId, workspaceOpen };
		this.postMessageToWebview(msg);
		this.syncMessages();
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// @ts-ignore
		webviewView.retainContextWhenHidden = true;

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, false, this._isFullScreenActive);

		webviewView.webview.onDidReceiveMessage(data => {
			this.handleMessage(data);
		});

		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			this.saveCurrentSession(false);
			this.createNewSession();
			this.syncMessages();
			this.broadcastHistoryList();
		});

		this.broadcastHistoryList();
		this.broadcastBrowserUrl();
		this.broadcastConsoleLogs();
	}

	public setFullScreen(value: boolean) {
		this._isFullScreenActive = value;
		this.postMessageToWebview({ type: 'setFullScreen', value });
		if (!value && this._panel) {
			this._panel.dispose();
		}
	}

	public refresh() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview, false, this._isFullScreenActive);
		}
		if (this._panel) {
			this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, true, false);
		}
	}

	public handleMessage(data: any) {
		handleWebviewMessage(this, data, vscode);
	}

	public broadcastTyping(isTyping: boolean) {
		const msg = { type: 'typing', value: isTyping };
		this.postMessageToWebview(msg);
	}

	public get activeBrowserUrl(): string | undefined {
		return this._activeBrowserUrl;
	}

	public set activeBrowserUrl(url: string | undefined) {
		this._activeBrowserUrl = url;
		this.broadcastBrowserUrl();
	}

	public broadcastBrowserUrl() {
		const msg = { type: 'browserUrl', value: this._activeBrowserUrl };
		this.postMessageToWebview(msg);
	}

	public broadcastConsoleLogs() {
		const logs = ConsoleService.getInstance().getLogs();
		this.postMessageToWebview({ type: 'consoleLogs', logs });
	}

	public postMessageToWebview(message: any) {
		if (this._view) { this._view.webview.postMessage(message); }
		if (this._panel) { this._panel.webview.postMessage(message); }
	}

	public addMessage(role: 'user' | 'ai', text: string, attachments: any[] = [], id: string = `msg-${Date.now()}`, isStreaming = false) {
		this._messages.push({
			role,
			text,
			timestamp: Date.now(),
			attachments,
			id,
			isStreaming
		});
		this.syncMessages();
	}

	public getMessageText(id: string): string {
		const msg = this._messages.find(m => m.id === id);
		return msg ? msg.text : '';
	}

	public updateMessageText(id: string, text: string, isStreaming = true) {
		const msg = this._messages.find(m => m.id === id);
		if (msg) {
			msg.text = text;
			msg.isStreaming = isStreaming;
			this.syncMessages();
		}
	}

	public syncMessages() {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceOpen = !!workspaceFolders && workspaceFolders.length > 0;
		const workspaceRoot = workspaceOpen ? workspaceFolders![0].uri.fsPath : undefined;
		const message = { 
			type: 'syncMessages', 
			messages: this._messages, 
			sessionId: this.currentSessionId,
			workspaceOpen, 
			workspaceRoot 
		};
		this.postMessageToWebview(message);
	}

	public renderFullScreen(): vscode.WebviewPanel {
		this._panel = vscode.window.createWebviewPanel(
			'traneai.chatFullScreen',
			'TraneAI Chat',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [this._extensionUri],
				retainContextWhenHidden: true
			}
		);

		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, true, false);

		this._panel.webview.onDidReceiveMessage(data => {
			this.handleMessage(data);
		});

		this._panel.onDidDispose(() => {
			this._panel = undefined;
		});

		this.syncMessages();

		return this._panel;
	}

	public stopGeneration() {
		if (this._streamInterval) {
			clearInterval(this._streamInterval);
			this._streamInterval = undefined;
			let streamingIndex = -1;
			for (let i = this._messages.length - 1; i >= 0; i--) {
				if (this._messages[i].isStreaming) { streamingIndex = i; break; }
			}
			if (streamingIndex !== -1) {
				this._messages[streamingIndex].isStreaming = false;
				this.syncMessages();
			}
		}
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.broadcastTyping(false);
	}

	public async sendToBackend(message: string, model?: string, attachments?: any[], signal?: AbortSignal): Promise<string> {
		const context = await ContextCollector.collectContext();
		const history = this._messages
			.slice(0, -1)
			.filter(m => !m.isStreaming && m.text)
			.map(m => ({
				role: m.role === 'ai' ? 'assistant' : 'user',
				content: m.text,
			}));
		
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;

		const aiMsgId = Date.now().toString();
		this.addMessage('ai', '', [], aiMsgId, true);

		return BackendService.sendChatMessage(
			message,
			history,
			workspaceRoot,
			model,
			attachments,
			signal,
			(text: string, isFinal: boolean) => {
				this.updateMessageText(aiMsgId, text, !isFinal);
			},
			context
		);
	}


	private _getHtmlForWebview(webview: vscode.Webview, isPanel: boolean, isRedirected: boolean) {
		const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'logo.svg'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'style.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'main.js'));

		// Add cache buster for development
		const cacheBuster = `?t=${Date.now()}`;

		return buildWebviewHtml({
			logoUri: logoUri.toString(),
			styleUri: styleUri.toString() + cacheBuster,
			scriptUri: scriptUri.toString() + cacheBuster,
			isPanel,
			isRedirected,
		});
	}
}
