import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { exec, ChildProcess } from 'child_process';
import { buildWebviewHtml } from './webview/WebviewTemplate';
import * as fileTools from './services/fileTools';
import * as codeAnalysis from './services/codeAnalysis';
import * as editConfirmation from './services/editConfirmation';
import { CheckpointManager } from './services/checkpointManager';
import { EditProposal } from './webview/components/Message';

interface SessionMessage {
	role: string;
	text: string;
	timestamp: number;
	attachments?: any[];
	id?: string;
	isStreaming?: boolean;
}

interface ChatSession {
	id: string;
	title: string;
	email: string;
	createdAt: number;
	updatedAt: number;
	messages: SessionMessage[];
}

interface SessionSummary {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'traneai.chatView';
	private _view?: vscode.WebviewView;
	private _panel?: vscode.WebviewPanel;
	private _isFullScreenActive = false;
	private _messages: SessionMessage[] = [];
	private _streamInterval?: ReturnType<typeof setInterval>;
	private _abortController?: AbortController;

	private _currentSessionId: string = '';
	private _userEmail: string = '';
	private _checkpointManager: CheckpointManager;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this._checkpointManager = new CheckpointManager(_extensionUri);
	}

	private _getTraneAIDir(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			return path.join(workspaceFolders[0].uri.fsPath, '.traneAI');
		}
		return path.join(os.homedir(), '.traneAI');
	}

	private _getSessionsDir(): string {
		return path.join(this._getTraneAIDir(), 'sessions');
	}

	private _ensureTraneAIDir(): void {
		const traneAIDir = this._getTraneAIDir();
		const sessionsDir = this._getSessionsDir();
		if (!fs.existsSync(traneAIDir)) {
			fs.mkdirSync(traneAIDir, { recursive: true });
		}
		const gitignorePath = path.join(traneAIDir, '.gitignore');
		if (!fs.existsSync(gitignorePath)) {
			fs.writeFileSync(gitignorePath, '*\n');
		}
		if (!fs.existsSync(sessionsDir)) {
			fs.mkdirSync(sessionsDir, { recursive: true });
		}
		this._migrateSessions();
	}

	private _migrateSessions(): void {
		const sessionsDir = this._getSessionsDir();
		if (!fs.existsSync(sessionsDir)) return;
		
		try {
			const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
			for (const file of files) {
				const jsonPath = path.join(sessionsDir, file);
				const tranePath = path.join(sessionsDir, file.replace('.json', '.trane'));
				
				try {
					if (!fs.existsSync(tranePath)) {
						const content = fs.readFileSync(jsonPath, 'utf-8');
						const encrypted = this._compressAndEncrypt(content);
						fs.writeFileSync(tranePath, encrypted);
					}
					fs.unlinkSync(jsonPath);
				} catch (e) {
					console.error(`Failed to migrate ${file}:`, e);
				}
			}
		} catch (e) {
			console.error('Failed to read sessions directory for migration:', e);
		}
	}

	private _createNewSession(): void {
		this._currentSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
		this._messages = [];
	}

	private _saveCurrentSession(): void {
		if (!this._currentSessionId || this._messages.length === 0) {
			return;
		}
		this._ensureTraneAIDir();
		const firstUserMsg = this._messages.find(m => m.role === 'user');
		const title = firstUserMsg
			? firstUserMsg.text.replace(/\s+/g, ' ').trim().slice(0, 50) + (firstUserMsg.text.length > 50 ? '…' : '')
			: 'New Chat';

		const sessionsDir = this._getSessionsDir();
		const sessionFile = path.join(sessionsDir, `${this._currentSessionId}.trane`);
		const oldSessionFile = path.join(sessionsDir, `${this._currentSessionId}.json`);
		
		let createdAt = Date.now();
		if (fs.existsSync(sessionFile)) {
			try {
				const content = this._decryptAndDecompress(fs.readFileSync(sessionFile));
				const existing: ChatSession = JSON.parse(content);
				createdAt = existing.createdAt;
			} catch {}
		} else if (fs.existsSync(oldSessionFile)) {
			try {
				const existing: ChatSession = JSON.parse(fs.readFileSync(oldSessionFile, 'utf-8'));
				createdAt = existing.createdAt;
			} catch {}
		}

		const session: ChatSession = {
			id: this._currentSessionId,
			title,
			email: this._userEmail,
			createdAt,
			updatedAt: Date.now(),
			messages: this._messages.map(m => ({ ...m, isStreaming: false })),
		};
		
		try {
			const data = JSON.stringify(session);
			const encrypted = this._compressAndEncrypt(data);
			fs.writeFileSync(sessionFile, encrypted);
			
			// If we successfully saved the new format, remove the old one
			if (fs.existsSync(oldSessionFile)) {
				fs.unlinkSync(oldSessionFile);
			}
		} catch (e) {
			console.error('Failed to save session:', e);
		}
	}

	private _loadSessionList(): SessionSummary[] {
		this._ensureTraneAIDir();
		const sessionsDir = this._getSessionsDir();
		try {
			const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') || f.endsWith('.trane'));
			const summariesMap: Map<string, SessionSummary> = new Map();
			
			for (const file of files) {
				try {
					const filePath = path.join(sessionsDir, file);
					let session: ChatSession;
					
					if (file.endsWith('.trane')) {
						const content = this._decryptAndDecompress(fs.readFileSync(filePath));
						if (!content) continue;
						session = JSON.parse(content);
					} else {
						session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
					}

					if (!this._userEmail || session.email === this._userEmail) {
						if (!summariesMap.has(session.id) || summariesMap.get(session.id)!.updatedAt < session.updatedAt) {
							summariesMap.set(session.id, {
								id: session.id,
								title: session.title,
								updatedAt: session.updatedAt,
								messageCount: session.messages.length,
							});
						}
					}
				} catch {}
			}
			return Array.from(summariesMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
		} catch {
			return [];
		}
	}

	private _loadSessionById(sessionId: string): void {
		const sessionsDir = this._getSessionsDir();
		const sessionFile = path.join(sessionsDir, `${sessionId}.trane`);
		const oldSessionFile = path.join(sessionsDir, `${sessionId}.json`);
		
		let session: ChatSession | undefined;
		
		if (fs.existsSync(sessionFile)) {
			try {
				const content = this._decryptAndDecompress(fs.readFileSync(sessionFile));
				if (content) {
					session = JSON.parse(content);
				}
			} catch {}
		} else if (fs.existsSync(oldSessionFile)) {
			try {
				session = JSON.parse(fs.readFileSync(oldSessionFile, 'utf-8'));
			} catch {}
		}

		if (!session) {
			return;
		}

		if (this._userEmail && session.email && session.email !== this._userEmail) {
			return;
		}
		this._currentSessionId = session.id;
		this._messages = session.messages;
		this._syncMessages();
	}

	private _deleteSession(sessionId: string): void {
		const sessionFile = path.join(this._getSessionsDir(), `${sessionId}.json`);
		const compressedFile = path.join(this._getSessionsDir(), `${sessionId}.trane`);
		
		if (fs.existsSync(sessionFile)) {
			fs.unlinkSync(sessionFile);
		}
		if (fs.existsSync(compressedFile)) {
			fs.unlinkSync(compressedFile);
		}
		
		if (this._currentSessionId === sessionId) {
			this._createNewSession();
			this._syncMessages();
		}
		this._broadcastHistoryList();
	}

	private _getEncryptionKey(): Buffer {
		const secret = vscode.env.machineId || 'traneai-default-secret';
		return crypto.scryptSync(secret, 'traneai-salt', 32);
	}

	private _compressAndEncrypt(data: string): Buffer {
		const compressed = zlib.deflateSync(data);
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv('aes-256-cbc', this._getEncryptionKey(), iv);
		const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
		return Buffer.concat([iv, encrypted]);
	}

	private _decryptAndDecompress(buffer: Buffer): string {
		try {
			const iv = buffer.subarray(0, 16);
			const encryptedData = buffer.subarray(16);
			const decipher = crypto.createDecipheriv('aes-256-cbc', this._getEncryptionKey(), iv);
			const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
			return zlib.inflateSync(decrypted).toString('utf-8');
		} catch (e) {
			console.error('Failed to decrypt/decompress session:', e);
			return '';
		}
	}

	private _broadcastHistoryList(): void {
		const sessions = this._loadSessionList();
		const workspaceOpen = !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
		const msg = { type: 'historyList', sessions, currentSessionId: this._currentSessionId, workspaceOpen };
		if (this._view) { this._view.webview.postMessage(msg); }
		if (this._panel) { this._panel.webview.postMessage(msg); }
		this._syncMessages();
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
			this._handleMessage(data);
		});

		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			this._saveCurrentSession();
			this._createNewSession();
			this._syncMessages();
			this._broadcastHistoryList();
		});

		this._broadcastHistoryList();
	}

	public setFullScreen(value: boolean) {
		this._isFullScreenActive = value;
		if (this._view) {
			this._view.webview.postMessage({ type: 'setFullScreen', value });
		}
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

	private _handleMessage(data: any) {
		switch (data.command) {
			case 'login':
				const prevEmail = this._userEmail;
				this._userEmail = data.email || '';
				this._ensureTraneAIDir();
				if (prevEmail && prevEmail !== this._userEmail) {
					this._createNewSession();
				}
				this._broadcastHistoryList();
				break;
			case 'logout':
				this._saveCurrentSession();
				this._userEmail = '';
				this._createNewSession();
				this._syncMessages();
				break;
			case 'restore':
				vscode.commands.executeCommand('trane-ai.restoreToSidebar');
				break;
			case 'sendMessage':
				if (!this._currentSessionId) {
					this._createNewSession();
				}
				this._addMessage('user', data.text, data.attachments);

				if (data.text.includes('@comprehensive-review')) {
					this._runComprehensiveReview();
					return;
				}

				if (data.model === 'qa' && data.text.includes('@research')) {
					const ticketMatch = data.text.match(/@research\s+([A-Za-z]+-\d+)/i);
					if (ticketMatch) {
						this._runQAResearchWorkflow(ticketMatch[1]);
						return;
					}
					const imageAttachments = (data.attachments || []).filter((a: any) => a.type === 'image' && a.imageData);
					if (imageAttachments.length > 0) {
						this._extractTicketAndRunWorkflow(imageAttachments[0]);
						return;
					}
				}

				this._broadcastTyping(true);
				this._abortController = new AbortController();
				this._sendToBackend(data.text, data.model, data.attachments, this._abortController.signal).then(() => {
					this._broadcastTyping(false);
					this._saveCurrentSession();
					this._broadcastHistoryList();
				}).catch((error: any) => {
					this._broadcastTyping(false);
					if (error.name !== 'AbortError') {
						this._addMessage('ai', `Error: ${error.message}`);
						this._saveCurrentSession();
					}
				});

				break;
			case 'quickAction':
				this._handleQuickAction(data.action, data.text);
				break;
			case 'stopGeneration':
				this._stopGeneration();
				break;
			case 'clearChat':
				this._deleteSession(this._currentSessionId);
				break;
			case 'copyMessage':
				vscode.env.clipboard.writeText(data.text);
				break;
			case 'filesSelected':
				break;
			case 'loadHistory':
				this._broadcastHistoryList();
				break;
			case 'loadSession':
				this._saveCurrentSession();
				this._loadSessionById(data.sessionId);
				this._broadcastHistoryList();
				break;
			case 'deleteSession':
				this._deleteSession(data.sessionId);
				break;
			case 'newChat':
				this._saveCurrentSession();
				this._createNewSession();
				this._syncMessages();
				this._broadcastHistoryList();
				break;
			case 'openFolder':
				vscode.commands.executeCommand('vscode.openFolder');
				break;
			case 'cloneRepository':
				vscode.commands.executeCommand('git.clone');
				break;
			case 'executeTool':
				this._handleToolExecution(data.toolName, data.params);
				break;
			case 'analyzeFile':
				this._handleFileAnalysis(data.filePath);
				break;
			case 'applyEdit':
				this._handleApplyEdit(data.filePath, data.oldText, data.newText);
				break;
			case 'revertEdit':
				this._handleRevertEdit(data.filePath, data.oldText, data.newText);
				break;
			case 'requestEditConfirmation':
				this._handleEditConfirmation(data.filePath, data.oldText, data.newText);
				break;
			case 'applyPendingEdits':
				this._applyAllPendingEdits();
				break;
			case 'discardPendingEdits':
				this._discardPendingEdits();
				break;
			case 'getTools':
				this._sendToolsList();
				break;
			case 'showDiff':
				this._handleShowDiff(data.filePath, data.oldText, data.newText);
				break;
			case 'applyMultiEdit':
				this._handleApplyMultiEdit(data.edits);
				break;
			case 'openFile':
				this._handleOpenFile(data.path);
				break;
			case 'executeCommand':
				this._handleExecuteCommand(data.cmd);
				break;
			case 'getWorkspaceRoot':
				this._syncMessages();
				break;
		}
	}

	private _broadcastTyping(isTyping: boolean) {
		const msg = { type: 'typing', value: isTyping };
		if (this._view) { this._view.webview.postMessage(msg); }
		if (this._panel) { this._panel.webview.postMessage(msg); }
	}

	private _addMessage(role: 'user' | 'ai', text: string, attachments: any[] = [], id: string = `msg-${Date.now()}`, isStreaming = false) {
		this._messages.push({
			role,
			text,
			timestamp: Date.now(),
			attachments,
			id,
			isStreaming
		});
		this._syncMessages();
	}

	private _updateMessageText(id: string, text: string, isStreaming = true) {
		const msg = this._messages.find(m => m.id === id);
		if (msg) {
			msg.text = text;
			msg.isStreaming = isStreaming;
			this._syncMessages();
		}
	}

	private _syncMessages() {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceOpen = !!workspaceFolders && workspaceFolders.length > 0;
		const workspaceRoot = workspaceOpen ? workspaceFolders![0].uri.fsPath : undefined;
		const message = { type: 'syncMessages', messages: this._messages, workspaceOpen, workspaceRoot };
		if (this._view) { this._view.webview.postMessage(message); }
		if (this._panel) { this._panel.webview.postMessage(message); }
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
			this._handleMessage(data);
		});

		this._panel.onDidDispose(() => {
			this._panel = undefined;
		});

		this._syncMessages();

		return this._panel;
	}

	private async _handleQuickAction(action: string, text: string) {
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			this._addMessage('user', text);
			this._broadcastTyping(true);
			setTimeout(() => {
				this._broadcastTyping(false);
				this._addMessage('ai', 'No file is currently open. Please open a file in the editor and try again.');
			}, 800);
			return;
		}

		const document = editor.document;
		const fileName = document.fileName.split(/[\\/]/).pop() ?? 'file';
		const language = document.languageId;
		const fileContent = document.getText();
		const lineCount = document.lineCount;

		this._addMessage('user', text);
		this._broadcastTyping(true);

		setTimeout(() => {
			this._broadcastTyping(false);
			let response = '';
			if (action === 'explain') {
				response = this._generateExplanation(fileName, language, fileContent, lineCount);
			} else if (action === 'review') {
				response = this._generateReview(fileName, language, fileContent, lineCount);
			} else if (action === 'tests') {
				response = this._generateTests(fileName, language, fileContent, lineCount);
			}
			this._addMessage('ai', response);
		}, 1500);
	}

	private async _handleToolExecution(toolName: string, params: Record<string, any>) {
		this._broadcastTyping(true);
		this._addMessage('user', `Executing ${toolName}...`);
		
		try {
			const result = await fileTools.executeTool(toolName, params);
			this._broadcastTyping(false);
			
			if (result.success) {
				this._addMessage('ai', result.message);
			} else {
				this._addMessage('ai', `❌ ${result.message}`);
			}
		} catch (error: any) {
			this._broadcastTyping(false);
			this._addMessage('ai', `Error: ${error.message}`);
		}
	}

	private async _handleFileAnalysis(filePath: string) {
		this._broadcastTyping(true);
		this._addMessage('user', `Analyzing ${filePath}...`);
		
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._broadcastTyping(false);
				this._addMessage('ai', 'No workspace open');
				return;
			}
			
			let uri: vscode.Uri;
			if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
				uri = vscode.Uri.file(filePath);
			} else {
				uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
			}
			
			const result = await codeAnalysis.analyzeFileWithLSP(uri);
			this._broadcastTyping(false);
			
			if (result.success && result.analysis) {
				const md = codeAnalysis.generateAnalysisMarkdown(result.analysis);
				this._addMessage('ai', md);
			} else {
				this._addMessage('ai', `Error: ${result.error}`);
			}
		} catch (error: any) {
			this._broadcastTyping(false);
			this._addMessage('ai', `Error: ${error.message}`);
		}
	}

	private async _handleApplyEdit(filePath: string, oldText: string, newText: string) {
		this._handleApplyMultiEdit([{ filePath, oldContent: oldText, newContent: newText }]);
	}

	private async _handleApplyMultiEdit(edits: EditProposal[]) {
		this._broadcastTyping(true);
		
		try {
			const filePaths = edits.map(e => e.filePath);
			const checkpointId = await this._checkpointManager.createCheckpoint(filePaths);
			
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._broadcastTyping(false);
				this._addMessage('ai', '❌ No workspace open.');
				return;
			}
			
			// Group edits by URI to apply them sequentially per file
			const editsByUri = new Map<string, { uri: vscode.Uri; proposals: EditProposal[] }>();
			
			for (const edit of edits) {
				let uri: vscode.Uri | null = null;
				if (edit.filePath.startsWith('/') || edit.filePath.match(/^[A-Za-z]:/)) {
					if (fs.existsSync(edit.filePath)) uri = vscode.Uri.file(edit.filePath);
				}
				if (!uri) {
					for (const folder of workspaceFolders) {
						const potentialPath = path.join(folder.uri.fsPath, edit.filePath);
						if (fs.existsSync(potentialPath)) { uri = vscode.Uri.file(potentialPath); break; }
					}
				}
				if (!uri) uri = vscode.Uri.joinPath(workspaceFolders[0].uri, edit.filePath);
				
				const uriStr = uri.toString();
				if (!editsByUri.has(uriStr)) {
					editsByUri.set(uriStr, { uri, proposals: [] });
				}
				editsByUri.get(uriStr)!.proposals.push(edit);
			}

			let totalApplied = 0;
			let errors: string[] = [];

			for (const { uri, proposals } of editsByUri.values()) {
				try {
					let fileAppliedCount = 0;
					
					// Apply each proposal one by one, refreshing the document each time
					// to handle potential overlaps or shifting offsets.
					for (const prop of proposals) {
						const doc = await vscode.workspace.openTextDocument(uri);
						const currentContent = doc.getText();
						
						const startIndex = currentContent.indexOf(prop.oldContent);
						if (startIndex === -1) {
							errors.push(`Could not find exact text in ${prop.filePath}. It might have been changed by a previous edit.`);
							continue;
						}
						
						const workspaceEdit = new vscode.WorkspaceEdit();
						const range = new vscode.Range(
							doc.positionAt(startIndex), 
							doc.positionAt(startIndex + prop.oldContent.length)
						);
						workspaceEdit.replace(uri, range, prop.newContent);
						
						const success = await vscode.workspace.applyEdit(workspaceEdit);
						if (success) {
							fileAppliedCount++;
							totalApplied++;
						} else {
							errors.push(`VS Code rejected an edit for ${prop.filePath}.`);
						}
					}

					if (fileAppliedCount > 0) {
						const finalDoc = await vscode.workspace.openTextDocument(uri);
						await finalDoc.save();
					}
				} catch (err: any) {
					errors.push(`Failed to process ${uri.fsPath}: ${err.message}`);
				}
			}

			this._broadcastTyping(false);
			
			if (errors.length > 0 && totalApplied === 0) {
				this._addMessage('ai', `❌ Failed to apply edits:\n${errors.join('\n')}`);
			} else if (errors.length > 0) {
				this._addMessage('ai', `⚠️ Partially applied ${totalApplied} change(s), but encountered some issues:\n${errors.join('\n')}\n\n[Checkpoint: ${checkpointId}]`);
			} else {
				this._addMessage('ai', `✅ Successfully applied all ${totalApplied} change(s). [Checkpoint: ${checkpointId}]`);
			}
		} catch (error: any) {
			this._broadcastTyping(false);
			this._addMessage('ai', `❌ Error: ${error.message}`);
		}
	}

	private async _handleRevertEdit(filePath: string, oldText: string, newText: string) {
		this._addMessage('user', `Reverting changes in ${filePath}...`);
		this._broadcastTyping(true);
		
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._broadcastTyping(false);
				this._addMessage('ai', 'No workspace open');
				return;
			}
			
			let uri: vscode.Uri;
			if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
				uri = vscode.Uri.file(filePath);
			} else {
				uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
			}
			
			const doc = await vscode.workspace.openTextDocument(uri);
			const content = doc.getText();
			
			// Try exact match first
			let startIndex = content.indexOf(newText);
			
			// If not found, try normalized match (ignoring line ending differences and trailing/leading whitespace)
			if (startIndex === -1) {
				const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
				const normalizedContent = normalize(content);
				const normalizedNewText = normalize(newText);
				
				const normalizedIndex = normalizedContent.indexOf(normalizedNewText);
				if (normalizedIndex !== -1) {
					// We found it in normalized space. Now we need to find the equivalent index in the original doc.
					// This is a bit tricky, but since we only normalized line endings and trim, 
					// we can try to find a substring that matches.
					// For most cases, a slightly fuzzy search or just searching for the first line is enough.
					const firstLine = normalizedNewText.split('\n')[0].trim();
					if (firstLine) {
						startIndex = content.indexOf(firstLine);
					}
				}
			}
			
			if (startIndex === -1) {
				this._broadcastTyping(false);
				this._addMessage('ai', 'Could not find the applied changes to revert. The file contents may have changed significantly.');
				return;
			}
			
			const endIndex = startIndex + newText.trim().length; 
			// Use a safer range if needed, but the above is usually close enough for a single line/block replace.
			const startPos = doc.positionAt(startIndex);
			// Re-calculate endPos based on actual text in doc to be safe
			const endPos = doc.positionAt(startIndex + newText.length);
			
			const edit = vscode.TextEdit.replace(
				new vscode.Range(startPos, endPos),
				oldText
			);
			
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.set(uri, [edit]);
			const applied = await vscode.workspace.applyEdit(workspaceEdit);
			
			this._broadcastTyping(false);
			
			if (applied) {
				await doc.save();
				this._addMessage('ai', `🔄 Reverted changes in ${filePath}`);
			} else {
				this._addMessage('ai', 'Failed to revert changes');
			}
		} catch (error: any) {
			this._broadcastTyping(false);
			this._addMessage('ai', `Error: ${error.message}`);
		}
	}

	private async _handleEditConfirmation(filePath: string, oldText: string, newText: string) {
		const editId = `edit-${Date.now()}`;
		const result = await editConfirmation.requestConfirmation(
			editId,
			filePath,
			oldText,
			newText
		);
		
		if (result.confirmed) {
			await editConfirmation.applyEdit(editId);
			if (result.applyAll) {
				await editConfirmation.applyAllPendingEdits();
			}
		}
	}

	private async _applyAllPendingEdits() {
		const count = await editConfirmation.applyAllPendingEdits();
		this._addMessage('ai', `Applied ${count} pending edits`);
	}

	private async _discardPendingEdits() {
		await editConfirmation.discardAllEdits();
		this._addMessage('ai', 'Discarded all pending edits');
	}

	private _sendToolsList() {
		const tools = fileTools.getToolsForAI();
		this._addMessage('ai', `**Available File Operations:**\n\n${tools}\n\nUse these tools by sending a message like: "Read file src/index.ts" or "Create file src/test.ts with content..."`);
	}

	private _extractSymbols(content: string, language: string): { functions: string[], classes: string[], imports: string[] } {
		const functions: string[] = [];
		const classes: string[] = [];
		const imports: string[] = [];

		if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
			const fnMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[\w<>, |[\]]*?)?\s*\{)/gm);
			for (const m of fnMatches) {
				const name = m[1] || m[2] || m[3];
				if (name && name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch' && !functions.includes(name)) {
					functions.push(name);
				}
			}
			const classMatches = content.matchAll(/class\s+(\w+)/gm);
			for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
			const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/gm);
			for (const m of importMatches) { if (!imports.includes(m[1])) { imports.push(m[1]); } }
		} else if (language === 'python') {
			const fnMatches = content.matchAll(/def\s+(\w+)\s*\(/gm);
			for (const m of fnMatches) { if (!functions.includes(m[1])) { functions.push(m[1]); } }
			const classMatches = content.matchAll(/class\s+(\w+)/gm);
			for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
			const importMatches = content.matchAll(/(?:import|from)\s+([\w.]+)/gm);
			for (const m of importMatches) { if (!imports.includes(m[1])) { imports.push(m[1]); } }
		} else if (['java', 'csharp', 'cpp', 'c'].includes(language)) {
			const fnMatches = content.matchAll(/(?:public|private|protected|static|void|int|string|bool|double|float|async)[\s\w<>[\],]*?\s+(\w+)\s*\(/gm);
			for (const m of fnMatches) {
				const name = m[1];
				if (name && name !== 'if' && name !== 'for' && name !== 'while' && !functions.includes(name)) {
					functions.push(name);
				}
			}
			const classMatches = content.matchAll(/class\s+(\w+)/gm);
			for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
		}

		return { functions: functions.slice(0, 10), classes: classes.slice(0, 5), imports: imports.slice(0, 8) };
	}

	private _generateExplanation(fileName: string, language: string, content: string, lineCount: number): string {
		const { functions, classes, imports } = this._extractSymbols(content, language);
		const langLabel = language === 'typescriptreact' ? 'TypeScript (React)' : language === 'javascriptreact' ? 'JavaScript (React)' : language.charAt(0).toUpperCase() + language.slice(1);

		let response = `**File:** \`${fileName}\`\n**Language:** ${langLabel}\n**Lines:** ${lineCount}\n\n`;

		if (classes.length > 0) {
			response += `**Classes:**\n${classes.map(c => `- \`${c}\``).join('\n')}\n\n`;
		}
		if (functions.length > 0) {
			response += `**Functions / Methods:**\n${functions.map(f => `- \`${f}\``).join('\n')}\n\n`;
		}
		if (imports.length > 0) {
			response += `**Dependencies:**\n${imports.map(i => `- \`${i}\``).join('\n')}\n\n`;
		}

		if (content.trim().length === 0) {
			response += '_The file appears to be empty._';
		} else if (functions.length === 0 && classes.length === 0) {
			response += '_No top-level functions or classes detected. The file may contain configuration, styles, or data definitions._';
		} else {
			response += `This file defines **${classes.length} class${classes.length !== 1 ? 'es' : ''}** and **${functions.length} function${functions.length !== 1 ? 's' : ''}**. Review the symbols above to understand its responsibilities.`;
		}

		return response;
	}

	private _stopGeneration() {
		if (this._streamInterval) {
			clearInterval(this._streamInterval);
			this._streamInterval = undefined;
			let streamingIndex = -1;
			for (let i = this._messages.length - 1; i >= 0; i--) {
				if (this._messages[i].isStreaming) { streamingIndex = i; break; }
			}
			if (streamingIndex !== -1) {
				this._messages[streamingIndex].isStreaming = false;
				this._syncMessages();
			}
		}
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = undefined;
		}
		this._broadcastTyping(false);
	}

	private async _sendToBackend(message: string, model?: string, attachments?: any[], signal?: AbortSignal): Promise<string> {
		try {
			const formData = new FormData();
			formData.append('message', message);
			if (model) {
				formData.append('model', model);
			}

			const history = this._messages
				.slice(0, -1)
				.filter(m => !m.isStreaming && m.text)
				.map(m => ({
					role: m.role === 'ai' ? 'assistant' : 'user',
					content: m.text,
				}));
			formData.append('history', JSON.stringify(history));
			
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				formData.append('workspaceRoot', workspaceFolders[0].uri.fsPath);
			}

			const imageAttachments = attachments?.filter((a: any) => a.type === 'image' && a.imageData) ?? [];
			for (const imageAttachment of imageAttachments) {
				const imageBuffer = Buffer.from(imageAttachment.imageData, 'base64');
				const blob = new Blob([imageBuffer], { type: imageAttachment.mimeType || 'image/jpeg' });
				formData.append('images', blob, imageAttachment.name);
			}

			// Add a temporary placeholder message for typing/thinking
			const aiMsgId = Date.now().toString();
			this._addMessage('ai', '', [], aiMsgId, true);

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
				this._updateMessageText(aiMsgId, reply, false);
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
							this._updateMessageText(aiMsgId, fullText);
						} else if (data.type === 'final') {
							// For the final response, we remove the steps and just show the final content?
							// Actually, Zencoder shows BOTH. The steps stay at the top.
							// So we just update the whole text.
							fullText = data.content;
							this._updateMessageText(aiMsgId, fullText, false);
						}
					}
				}
			}

			return fullText;
		} catch (error: any) {
			console.error('TraneAI API Error:', error);
			return `Backend API error: ${error.message || 'Something went wrong'}`;
		}
	}
	private _generateReview(fileName: string, language: string, content: string, lineCount: number): string {
		const issues: string[] = [];
		const suggestions: string[] = [];

		if (content.includes('console.log') || content.includes('console.error') || content.includes('print(')) {
			issues.push('Debug logging statements detected — consider removing before production.');
		}
		if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
			issues.push('Unresolved `TODO` / `FIXME` / `HACK` comments found in the code.');
		}
		if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) {
			issues.push('Possible hardcoded credentials or secrets detected — use environment variables instead.');
		}
		if (content.includes('any') && ['typescript', 'typescriptreact'].includes(language)) {
			issues.push('Usage of `any` type found — prefer explicit types for better type safety.');
		}
		if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(content)) {
			issues.push('Empty or comment-only `catch` blocks detected — ensure errors are handled or logged.');
		}

		const { functions } = this._extractSymbols(content, language);
		if (lineCount > 300) {
			suggestions.push(`File is **${lineCount} lines** — consider splitting into smaller, focused modules.`);
		}
		if (functions.length > 15) {
			suggestions.push(`**${functions.length} functions** detected — consider grouping related logic into classes or separate files.`);
		}
		if (!content.includes('test') && !content.includes('spec') && !content.includes('describe')) {
			suggestions.push('No test coverage detected in this file — consider adding unit tests.');
		}

		let response = `**Code Review — \`${fileName}\`**\n\n`;

		if (issues.length > 0) {
			response += `**Issues Found:**\n${issues.map(i => `- ⚠️ ${i}`).join('\n')}\n\n`;
		} else {
			response += `**Issues Found:** ✅ No obvious issues detected.\n\n`;
		}

		if (suggestions.length > 0) {
			response += `**Suggestions:**\n${suggestions.map(s => `- 💡 ${s}`).join('\n')}\n\n`;
		}

		response += `**Summary:** ${lineCount} lines of ${language} code reviewed. ${issues.length} issue${issues.length !== 1 ? 's' : ''} and ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found.`;

		return response;
	}

	private _generateTests(fileName: string, language: string, content: string, lineCount: number): string {
		const { functions, classes } = this._extractSymbols(content, language);
		const baseName = fileName.replace(/\.[^.]+$/, '');

		let testCode = '';
		let framework = '';

		if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
			framework = 'Jest';
			const ext = language.startsWith('typescript') ? 'ts' : 'js';
			const imports = classes.length > 0
				? `import { ${[...classes, ...functions].slice(0, 5).join(', ')} } from './${baseName}';`
				: `import { ${functions.slice(0, 5).join(', ')} } from './${baseName}';`;

			const testBlocks = functions.slice(0, 5).map(fn => `  describe('${fn}', () => {\n    it('should work correctly', () => {\n      // TODO: implement test\n      expect(${fn}).toBeDefined();\n    });\n  });`).join('\n\n');

			testCode = `// ${baseName}.test.${ext}\n${imports}\n\ndescribe('${baseName}', () => {\n${testBlocks || '  it(\'should be defined\', () => {\n    // TODO: implement test\n  });'}\n});`;
		} else if (language === 'python') {
			framework = 'pytest';
			const importLine = `from ${baseName} import ${functions.slice(0, 5).join(', ') || '*'}`;
			const testFns = functions.slice(0, 5).map(fn => `def test_${fn}():\n    # TODO: implement test\n    assert ${fn} is not None`).join('\n\n');
			testCode = `# test_${baseName}.py\n${importLine}\n\n${testFns || 'def test_placeholder():\n    # TODO: implement test\n    pass'}`;
		} else if (language === 'java') {
			framework = 'JUnit 5';
			const className = classes[0] ?? baseName;
			const testMethods = functions.slice(0, 5).map(fn => `  @Test\n  void test${fn.charAt(0).toUpperCase() + fn.slice(1)}() {\n    // TODO: implement test\n  }`).join('\n\n');
			testCode = `// ${className}Test.java\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${className}Test {\n${testMethods || '  @Test\n  void testPlaceholder() {\n    // TODO: implement test\n  }'}\n}`;
		} else {
			return `**Generate Unit Tests — \`${fileName}\`**\n\nUnit test generation for **${language}** is not yet supported. Detected **${functions.length} function${functions.length !== 1 ? 's' : ''}**:\n${functions.map(f => `- \`${f}\``).join('\n') || '_No functions detected._'}`;
		}

		let response = `**Generated Unit Tests — \`${fileName}\`** (${framework})\n\n`;
		response += `Detected **${functions.length} function${functions.length !== 1 ? 's' : ''}** and **${classes.length} class${classes.length !== 1 ? 'es' : ''}**.\n\n`;
		response += `\`\`\`${language}\n${testCode}\n\`\`\`\n\n`;
		response += `_Tests generated as stubs — fill in the assertions and edge cases based on your implementation._`;

		return response;
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

	private async _extractTicketAndRunWorkflow(imageAttachment: any) {
		const extractingMsgId = `qa-extract-${Date.now()}`;
		this._addMessage('ai', '🔬 **QA Research**\n\n- Extracting ticket information from screenshot...', [], extractingMsgId, false);

		try {
			const formData = new FormData();
			formData.append('message', 'Extract the ticket/issue number (e.g. DS-399, JIRA-123, DS-170) from this screenshot. Also extract the ticket title, description, and any requirements or steps to reproduce. Return ONLY valid JSON in this exact format: { "ticketId": "...", "title": "...", "description": "...", "requirements": ["..."] }');
			const imageBuffer = Buffer.from(imageAttachment.imageData, 'base64');
			const blob = new Blob([imageBuffer], { type: imageAttachment.mimeType || 'image/jpeg' });
			formData.append('images', blob, imageAttachment.name || 'ticket.png');

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error('Backend vision request failed');
			}

			const responseData = await response.json();
			const text = responseData.message || '';

			let ticketId = '';
			let ticketContext: { title?: string; description?: string; requirements?: string[] } = {};

			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				try {
					const parsed = JSON.parse(jsonMatch[0]);
					ticketId = parsed.ticketId || '';
					ticketContext = {
						title: parsed.title,
						description: parsed.description,
						requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
					};
				} catch {}
			}

			if (!ticketId) {
				const fallbackMatch = text.match(/([A-Za-z]+-\d+)/);
				if (fallbackMatch) {
					ticketId = fallbackMatch[1];
				}
			}

			if (!ticketId) {
				this._updateMessageText(extractingMsgId, '🔬 **QA Research**\n\n- ❌ Could not detect ticket number from screenshot. Please type the ticket ID directly, e.g. `@research DS-399`.', false);
				return;
			}

			this._updateMessageText(extractingMsgId, `🔬 **QA Research**\n\n- ✓ Detected ticket **${ticketId}** from screenshot`, false);
			this._runQAResearchWorkflow(ticketId, ticketContext);
		} catch (err: any) {
			this._updateMessageText(extractingMsgId, `🔬 **QA Research**\n\n- ❌ Error extracting ticket: ${err.message}`, false);
		}
	}

	private _runQAResearchWorkflow(ticketId: string, ticketContext?: { title?: string; description?: string; requirements?: string[] }) {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const writeEmitter = new vscode.EventEmitter<string>();
		
		const log = (msg: string) => writeEmitter.fire(msg.replace(/\n/g, '\r\n'));
		const statusMessageId = `qa-status-${ticketId}-${Date.now()}`;
		const statusLines: string[] = [];
		const pushStatus = (text: string) => {
			statusLines.push(`- ${text}`);
			this._updateMessageText(statusMessageId, `🔬 **QA Research: ${ticketId}**\n\n${statusLines.join('\n')}`, false);
		};
		const managedProcesses = new Set<ChildProcess>();
		let workflowClosed = false;
		const registerProcess = (proc: ChildProcess) => {
			managedProcesses.add(proc);
			proc.on('exit', () => managedProcesses.delete(proc));
			proc.on('error', () => managedProcesses.delete(proc));
			return proc;
		};
		const cleanupProcesses = (reason: string) => {
			if (workflowClosed) {
				return;
			}
			workflowClosed = true;
			pushStatus(reason);
			for (const proc of managedProcesses) {
				const pid = proc.pid;
				if (!pid) {
					continue;
				}
				if (process.platform === 'win32') {
					exec(`taskkill /PID ${pid} /T /F`);
				} else {
					try {
						proc.kill('SIGTERM');
					} catch {
					}
				}
			}
			managedProcesses.clear();
			process.removeListener('exit', onExtensionHostExit);
		};
		const onExtensionHostExit = () => cleanupProcesses('Workflow stopped: Extension host is shutting down.');
		process.once('exit', onExtensionHostExit);

		const pty: vscode.Pseudoterminal = {
			onDidWrite: writeEmitter.event,
			handleInput: (data: string) => {
				if (data === '\x03') {
					log(`\r\n\x1b[31m^C\x1b[0m\r\n`);
					cleanupProcesses('Workflow stopped by user (Ctrl+C).');
				}
			},
			open: () => {
				log(`\x1b[34m╔══════════════════════════════════════════╗\x1b[0m\r\n`);
				log(`\x1b[34m║  TraneAI QA Research: ${ticketId.padEnd(19)}║\x1b[0m\r\n`);
				log(`\x1b[34m╚══════════════════════════════════════════╝\x1b[0m\r\n\r\n`);

				pushStatus('Step 1/5: Analyzing project structure...');
				log(`\x1b[33m[Step 1/5] Analyzing project structure...\x1b[0m\r\n`);

				let packageJson: any = {};
				const packageJsonPath = path.join(rootPath, 'package.json');
				try {
					packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
					log(`\x1b[32m  ✓ Project : ${packageJson.name || 'Unknown'} (v${packageJson.version || '?'})\x1b[0m\r\n`);
					const scriptNames = Object.keys(packageJson.scripts || {});
					if (scriptNames.length > 0) {
						log(`\x1b[32m  ✓ Scripts : ${scriptNames.join(', ')}\x1b[0m\r\n`);
					}
					pushStatus(`Step 1/5 complete: Project **${packageJson.name || 'Unknown'}** detected.`);
				} catch {
					log(`\x1b[33m  ⚠ Could not read package.json\x1b[0m\r\n`);
					pushStatus('Step 1/5 warning: Could not read `package.json`. Continuing with defaults.');
				}

				pushStatus('Step 2/5: Checking git status...');
				log(`\r\n\x1b[33m[Step 2/5] Checking git status...\x1b[0m\r\n`);

				const gitStatus = registerProcess(exec('git status --short', { cwd: rootPath }));
				let gitStatusOutput = '';
				gitStatus.stdout?.on('data', (d) => {
					const text = d.toString();
					gitStatusOutput += text;
					log(`  ${text}`);
				});
				gitStatus.stderr?.on('data', (d) => log(`\x1b[31m  ${d.toString()}\x1b[0m`));

				gitStatus.on('exit', () => {
					if (workflowClosed) {
						return;
					}
					const changedCount = gitStatusOutput.split('\n').map(line => line.trim()).filter(Boolean).length;
					pushStatus(changedCount > 0
						? `Step 2/5 complete: Git status found **${changedCount}** changed entries.`
						: 'Step 2/5 complete: Working tree is clean.');

					pushStatus(`Step 3/5: Searching for branch matching **${ticketId}**...`);
					log(`\r\n\x1b[33m[Step 3/5] Searching for branch: ${ticketId}...\x1b[0m\r\n`);

					const gitBranch = registerProcess(exec('git branch -a', { cwd: rootPath }));
					let branchOutput = '';
					gitBranch.stdout?.on('data', (d) => { branchOutput += d.toString(); });
					gitBranch.stderr?.on('data', (d) => log(`\x1b[31m  ${d.toString()}\x1b[0m`));

					gitBranch.on('exit', () => {
						if (workflowClosed) {
							return;
						}
						const allBranches = branchOutput
							.split('\n')
							.map(b => b.trim().replace(/^\*\s*/, ''))
							.filter(Boolean);

						const matchingBranch = allBranches.find(b =>
							b.toLowerCase().includes(ticketId.toLowerCase())
						);

						const startApplication = () => {
							pushStatus('Step 5/5: Starting the application...');
							log(`\r\n\x1b[33m[Step 5/5] Starting the application...\x1b[0m\r\n`);

							const scripts = packageJson.scripts || {};
							const startCmd = scripts['dev']
								? 'npm run dev'
								: scripts['start']
								? 'npm start'
								: scripts['serve']
								? 'npm run serve'
								: 'npm start';

							log(`\x1b[32m  → Running: ${startCmd}\x1b[0m\r\n`);
							pushStatus(`Step 5/5 in progress: Running \`${startCmd}\`.`);

							const startProc = registerProcess(exec(startCmd, { cwd: rootPath }));
							let hasOpenedUrl = false;

							const detectAndOpenUrl = (output: string) => {
								if (hasOpenedUrl || workflowClosed) return;
								const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
								const urlMatch = clean.match(
									/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+)(:\d+)?(\/[^\s]*)?/i
								);
								if (urlMatch) {
									const url = urlMatch[0].replace(/[.,!?;:]+$/, '');
									hasOpenedUrl = true;
									log(`\r\n\x1b[32m  ✓ Application running at: ${url}\x1b[0m\r\n`);
									log(`\x1b[32m  → Opening in VS Code browser...\x1b[0m\r\n`);
									pushStatus(`Step 5/5 complete: App is running at **${url}**. Opening VS Code browser now.`);
									setTimeout(() => {
										vscode.commands.executeCommand('trane-ai.openUrl', url);
									}, 1500);
									this._explainTicketRequirements(ticketId, ticketContext, url);
								}
							};

							startProc.stdout?.on('data', (d) => {
								log(d.toString());
								detectAndOpenUrl(d.toString());
							});
							startProc.stderr?.on('data', (d) => {
								log(d.toString());
								detectAndOpenUrl(d.toString());
							});
							startProc.on('error', (err) => {
								log(`\r\n\x1b[31m  ✗ Start failed: ${err.message}\x1b[0m\r\n`);
								pushStatus(`Step 5/5 failed: ${err.message}`);
							});
						};

						const checkDependenciesAndContinue = () => {
							pushStatus('Step 4/5: Checking whether dependencies are already installed...');
							log(`\r\n\x1b[33m[Step 4/5] Checking dependencies...\x1b[0m\r\n`);

							const nodeModulesPath = path.join(rootPath, 'node_modules');
							const hasNodeModules = fs.existsSync(nodeModulesPath);
							const requiredDeps = [
								...Object.keys(packageJson.dependencies || {}),
								...Object.keys(packageJson.devDependencies || {})
							];
							const missingDeps = hasNodeModules
								? requiredDeps.filter(dep => !fs.existsSync(path.join(nodeModulesPath, ...dep.split('/'))))
								: requiredDeps;

							if (missingDeps.length === 0) {
								log(`\x1b[32m  ✓ Dependencies already installed — skipping install\x1b[0m\r\n`);
								pushStatus('Step 4/5 complete: Dependencies already installed. Skipping install.');
								startApplication();
								return;
							}

							const useYarn = fs.existsSync(path.join(rootPath, 'yarn.lock'));
							const installCmd = useYarn ? 'yarn install' : 'npm install';
							log(`\x1b[33m  ⚠ Missing dependencies detected (${missingDeps.length})\x1b[0m\r\n`);
							log(`\x1b[32m  → Running: ${installCmd}\x1b[0m\r\n`);
							pushStatus(`Step 4/5 in progress: Found **${missingDeps.length}** missing dependencies. Running \`${installCmd}\`.`);

							const installProc = registerProcess(exec(installCmd, { cwd: rootPath }));
							installProc.stdout?.on('data', (d) => log(d.toString()));
							installProc.stderr?.on('data', (d) => log(d.toString()));

							installProc.on('exit', (code) => {
								if (workflowClosed) {
									return;
								}
								if (code !== 0) {
									log(`\r\n\x1b[31m  ✗ Installation failed (exit code ${code})\x1b[0m\r\n`);
									pushStatus(`Step 4/5 failed: Dependency installation failed (exit code ${code}).`);
									return;
								}
								log(`\r\n\x1b[32m  ✓ Dependencies installed successfully\x1b[0m\r\n`);
								pushStatus('Step 4/5 complete: Missing dependencies were installed successfully.');
								startApplication();
							});
						};

						if (matchingBranch) {
							const cleanBranch = matchingBranch.replace(/^remotes\/origin\//, '');
							log(`\x1b[32m  ✓ Found branch: ${cleanBranch}\x1b[0m\r\n`);
							log(`\x1b[32m  → Checking out: ${cleanBranch}...\x1b[0m\r\n`);
							pushStatus(`Step 3/5: Found branch **${cleanBranch}**. Checking out...`);

							const gitCheckout = registerProcess(exec(`git checkout ${cleanBranch}`, { cwd: rootPath }));
							gitCheckout.stdout?.on('data', (d) => log(d.toString()));
							gitCheckout.stderr?.on('data', (d) => log(d.toString()));

							gitCheckout.on('exit', (code) => {
								if (workflowClosed) {
									return;
								}
								if (code === 0) {
									log(`\x1b[32m  ✓ Checked out ${cleanBranch}\x1b[0m\r\n`);
									pushStatus(`Step 3/5 complete: Checked out branch **${cleanBranch}**.`);
								} else {
									log(`\x1b[33m  ⚠ Checkout had issues, continuing on current branch...\x1b[0m\r\n`);
									pushStatus('Step 3/5 warning: Checkout had issues. Continuing on current branch.');
								}
								checkDependenciesAndContinue();
							});
						} else {
							log(`\x1b[33m  ⚠ No branch matching "${ticketId}" found — continuing on current branch\x1b[0m\r\n`);
							pushStatus(`Step 3/5 warning: No branch matching **${ticketId}** found. Continuing on current branch.`);
							checkDependenciesAndContinue();
						}
					});
				});
			},
			close: () => {
				cleanupProcesses('Workflow stopped: Terminal was closed. Background processes were terminated.');
			}
		};

		this._addMessage('ai', `🔬 **QA Research: ${ticketId}**\n\n- Workflow initialized\n- Status updates will appear here as a running list`, [], statusMessageId, false);

		const terminal = vscode.window.createTerminal({ name: `TraneAI QA: ${ticketId}`, pty });
		terminal.show();
	}

	private async _explainTicketRequirements(ticketId: string, ticketContext?: { title?: string; description?: string; requirements?: string[] }, appUrl?: string) {
		const reqMsgId = `qa-req-${ticketId}-${Date.now()}`;
		this._addMessage('ai', `🧪 **Testing Guide: ${ticketId}**\n\n- Analyzing ticket requirements...`, [], reqMsgId, true);

		try {
			const contextParts: string[] = [];
			if (ticketContext?.title) {
				contextParts.push(`Title: ${ticketContext.title}`);
			}
			if (ticketContext?.description) {
				contextParts.push(`Description: ${ticketContext.description}`);
			}
			if (ticketContext?.requirements && ticketContext.requirements.length > 0) {
				contextParts.push(`Requirements:\n${ticketContext.requirements.map(r => `- ${r}`).join('\n')}`);
			}

			const contextSection = contextParts.length > 0
				? contextParts.join('\n\n')
				: `Ticket ID: ${ticketId}`;

			const prompt = `You are a QA engineer analyzing a bug/feature ticket.

${contextSection}

${appUrl ? `The application is running at: ${appUrl}` : ''}

Based on the above ticket information, provide a concise QA testing guide that includes:
1. **Ticket Summary** – Briefly describe what the issue or feature is about.
2. **What to Test** – A clear list of test scenarios (happy path and edge cases).
3. **Steps to Reproduce** (for bugs) or **Acceptance Criteria** (for features).
4. **Areas to Verify** – Which parts of the app to check.

Be specific and actionable. Format your response clearly using markdown.`;

			const formData = new FormData();
			formData.append('message', prompt);

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error('Failed to generate testing guide');
			}

			const data = await response.json();
			const guide = data.message || 'Could not generate testing guide.';
			this._updateMessageText(reqMsgId, `🧪 **Testing Guide: ${ticketId}**\n\n${guide}`, false);
		} catch (err: any) {
			this._updateMessageText(reqMsgId, `🧪 **Testing Guide: ${ticketId}**\n\n- ❌ Could not generate testing guide: ${err.message}`, false);
		}
	}

	private _runComprehensiveReview() {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const writeEmitter = new vscode.EventEmitter<string>();
		const reviewProcesses = new Set<ChildProcess>();
		let reviewClosed = false;

		const killReviewProcesses = () => {
			if (reviewClosed) return;
			reviewClosed = true;
			for (const proc of reviewProcesses) {
				const pid = proc.pid;
				if (!pid) continue;
				if (process.platform === 'win32') {
					exec(`taskkill /PID ${pid} /T /F`);
				} else {
					try { proc.kill('SIGTERM'); } catch {}
				}
			}
			reviewProcesses.clear();
		};

		const pty: vscode.Pseudoterminal = {
			onDidWrite: writeEmitter.event,
			handleInput: (data: string) => {
				if (data === '\x03') {
					writeEmitter.fire('\r\n\x1b[31m^C\x1b[0m\r\n');
					killReviewProcesses();
				}
			},
			open: () => {
				writeEmitter.fire('\x1b[34m--- TraneAI Comprehensive Review ---\x1b[0m\r\n');
				writeEmitter.fire('\x1b[33mStep 1: Installing dependencies (npm i)...\x1b[0m\r\n');
				
				const installProcess = exec('npm i', { cwd: rootPath });
				reviewProcesses.add(installProcess);
				installProcess.on('exit', () => reviewProcesses.delete(installProcess));
				
				installProcess.stdout?.on('data', (data) => {
					writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
				});
				
				installProcess.stderr?.on('data', (data) => {
					writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
				});
				
				installProcess.on('exit', (code) => {
					if (reviewClosed) return;
					if (code !== 0) {
						writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm install failed with code ${code}\x1b[0m\r\n`);
						return;
					}
					
					writeEmitter.fire('\r\n\x1b[33mStep 2: Starting application (npm start)...\x1b[0m\r\n');
					
					const startProcess = exec('npm start', { cwd: rootPath });
					reviewProcesses.add(startProcess);
					startProcess.on('exit', () => reviewProcesses.delete(startProcess));
					let hasOpenedUrl = false;
					
					startProcess.stdout?.on('data', (data) => {
						if (reviewClosed) return;
						const output = data.toString();
						writeEmitter.fire(output.replace(/\n/g, '\r\n'));
						
						if (!hasOpenedUrl) {
							const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
							const urlMatch = cleanOutput.match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+)(:\d+)?(\/[^\s]*)?/i);
							if (urlMatch) {
								const url = urlMatch[0].replace(/[.,!?;:]+$/, '');
								hasOpenedUrl = true;
								writeEmitter.fire(`\r\n\x1b[32m[INFO] Found hosting URL: ${url}\x1b[0m\r\n`);
								writeEmitter.fire('\x1b[32m[INFO] Opening browser with URL...\x1b[0m\r\n');
								
								setTimeout(() => {
									vscode.commands.executeCommand('trane-ai.openUrl', url);
								}, 1500);
							}
						}
					});
					
					startProcess.stderr?.on('data', (data) => {
						if (reviewClosed) return;
						writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
					});
					
					startProcess.on('error', (err) => {
						writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm start failed: ${err.message}\x1b[0m\r\n`);
					});
				});
			},
			close: () => {
				killReviewProcesses();
			}
		};

		const terminal = vscode.window.createTerminal({ name: 'TraneAI Review', pty });
		terminal.show();
	}
	private async _handleShowDiff(filePath: string, oldText: string, newText: string) {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				vscode.window.showErrorMessage('No workspace open');
				return;
			}

			let uri: vscode.Uri | null = null;
			if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
				if (fs.existsSync(filePath)) {
					uri = vscode.Uri.file(filePath);
				}
			}
			
			if (!uri) {
				for (const folder of workspaceFolders) {
					const potentialPath = path.join(folder.uri.fsPath, filePath);
					if (fs.existsSync(potentialPath)) {
						uri = vscode.Uri.file(potentialPath);
						break;
					}
				}
			}
			
			if (!uri) {
				uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
			}

			// Read current content as a base, but we will show the specific oldText -> newText diff
			const doc = await vscode.workspace.openTextDocument(uri);
			const currentContent = doc.getText();

			// To show the REAL proposed diff accurately even after apply, we construct the 'before' and 'after'
			// states based on the proposal.
			let beforeContent = currentContent;
			let afterContent = currentContent;

			if (currentContent.includes(oldText)) {
				// Base case: file still has old text
				afterContent = currentContent.replace(oldText, newText);
			} else if (currentContent.includes(newText)) {
				// Already applied case: file has new text
				beforeContent = currentContent.replace(newText, oldText);
			} else {
				// Fallback: just show the snippet diff if we can't find either in context
				beforeContent = oldText;
				afterContent = newText;
			}

			const tempDir = path.join(os.tmpdir(), 'traneai-diffs');
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}
			
			const baseName = path.basename(filePath);
			const tempOldPath = path.join(tempDir, `old-${baseName}`);
			const tempNewPath = path.join(tempDir, `new-${baseName}`);
			
			fs.writeFileSync(tempOldPath, beforeContent);
			fs.writeFileSync(tempNewPath, afterContent);

			await vscode.commands.executeCommand(
				'vscode.diff',
				vscode.Uri.file(tempOldPath),
				vscode.Uri.file(tempNewPath),
				`TraneAI: ${baseName} (Diff Preview)`
			);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
		}
	}
	private async _handleOpenFile(filePath: string) {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) return;

			let targetUri: vscode.Uri | undefined;

			// Try absolute path first
			if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
				targetUri = vscode.Uri.file(filePath);
			} else {
				// Search in workspace folders
				for (const folder of workspaceFolders) {
					const fullPath = path.join(folder.uri.fsPath, filePath);
					if (fs.existsSync(fullPath)) {
						targetUri = vscode.Uri.file(fullPath);
						break;
					}
				}
			}

			if (targetUri) {
				const doc = await vscode.workspace.openTextDocument(targetUri);
				await vscode.window.showTextDocument(doc, { preview: true });
			} else {
				vscode.window.showErrorMessage(`Could not find file: ${filePath}`);
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
		}
	}
	private _handleExecuteCommand(command: string) {
		const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('TraneAI');
		terminal.show();
		terminal.sendText(command);
	}
}
