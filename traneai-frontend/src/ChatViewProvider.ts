import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { buildWebviewHtml } from './webview/WebviewTemplate';

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

	constructor(private readonly _extensionUri: vscode.Uri) {}

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

		const sessionFile = path.join(this._getSessionsDir(), `${this._currentSessionId}.json`);
		let createdAt = Date.now();
		if (fs.existsSync(sessionFile)) {
			try {
				const existing: ChatSession = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
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
		fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
	}

	private _loadSessionList(): SessionSummary[] {
		this._ensureTraneAIDir();
		const sessionsDir = this._getSessionsDir();
		try {
			const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
			const summaries: SessionSummary[] = [];
			for (const file of files) {
				try {
					const session: ChatSession = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf-8'));
					if (!this._userEmail || session.email === this._userEmail) {
						summaries.push({
							id: session.id,
							title: session.title,
							updatedAt: session.updatedAt,
							messageCount: session.messages.length,
						});
					}
				} catch {}
			}
			return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
		} catch {
			return [];
		}
	}

	private _loadSessionById(sessionId: string): void {
		const sessionFile = path.join(this._getSessionsDir(), `${sessionId}.json`);
		if (!fs.existsSync(sessionFile)) {
			return;
		}
		try {
			const session: ChatSession = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
			if (this._userEmail && session.email && session.email !== this._userEmail) {
				return;
			}
			this._currentSessionId = session.id;
			this._messages = session.messages;
			this._syncMessages();
		} catch {}
	}

	private _deleteSession(sessionId: string): void {
		const sessionFile = path.join(this._getSessionsDir(), `${sessionId}.json`);
		if (fs.existsSync(sessionFile)) {
			fs.unlinkSync(sessionFile);
		}
		if (this._currentSessionId === sessionId) {
			this._createNewSession();
			this._syncMessages();
		}
		this._broadcastHistoryList();
	}

	private _broadcastHistoryList(): void {
		const sessions = this._loadSessionList();
		const msg = { type: 'historyList', sessions, currentSessionId: this._currentSessionId };
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

				this._broadcastTyping(true);
				this._abortController = new AbortController();
				this._sendToBackend(data.text, data.attachments, this._abortController.signal).then((aiReply: string) => {
					this._broadcastTyping(false);
					const streamId = `ai-${Date.now()}`;
					this._addMessage('ai', '', undefined, streamId, true);
					let pos = 0;
					this._streamInterval = setInterval(() => {
					  if (pos >= aiReply.length) {
						clearInterval(this._streamInterval);
						this._streamInterval = undefined;
						const index = this._messages.findIndex((m: any) => m.id === streamId);
						if (index !== -1) {
						  this._messages[index].isStreaming = false;
						  this._syncMessages();
						  this._saveCurrentSession();
						  this._broadcastHistoryList();
						}
						return;
					  }
					  pos = Math.min(pos + 8, aiReply.length);
					  const newText = aiReply.slice(0, pos);
					  const index = this._messages.findIndex((m: any) => m.id === streamId);
					  if (index !== -1) {
						this._messages[index] = { ...this._messages[index]!, text: newText } as any;
						this._syncMessages();
					  }
					}, 10);
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
		}
	}

	private _broadcastTyping(isTyping: boolean) {
		const msg = { type: 'typing', value: isTyping };
		if (this._view) { this._view.webview.postMessage(msg); }
		if (this._panel) { this._panel.webview.postMessage(msg); }
	}

	private _addMessage(role: string, text: string, attachments?: any[], id: string = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, isStreaming = false) {
		this._messages.push({ role, text, timestamp: Date.now(), attachments, id, isStreaming });
		this._syncMessages();
	}

	private _syncMessages() {
		const message = { type: 'syncMessages', messages: this._messages };
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
				localResourceRoots: [this._extensionUri]
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

	private async _sendToBackend(message: string, attachments?: any[], signal?: AbortSignal): Promise<string> {
		try {
			const formData = new FormData();
			formData.append('message', message);

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

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
				signal,
			});

			if (!response.ok) {
				throw new Error(`API failed with status ${response.status}`);
			}

			const data = await response.json();

			return data.message || 'No response from AI.';
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

	private _runComprehensiveReview() {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const writeEmitter = new vscode.EventEmitter<string>();
		
		const pty: vscode.Pseudoterminal = {
			onDidWrite: writeEmitter.event,
			open: () => {
				writeEmitter.fire('\x1b[34m--- TraneAI Comprehensive Review ---\x1b[0m\r\n');
				writeEmitter.fire('\x1b[33mStep 1: Installing dependencies (npm i)...\x1b[0m\r\n');
				
				const installProcess = exec('npm i', { cwd: rootPath });
				
				installProcess.stdout?.on('data', (data) => {
					writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
				});
				
				installProcess.stderr?.on('data', (data) => {
					writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
				});
				
				installProcess.on('exit', (code) => {
					if (code !== 0) {
						writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm install failed with code ${code}\x1b[0m\r\n`);
						return;
					}
					
					writeEmitter.fire('\r\n\x1b[33mStep 2: Starting application (npm start)...\x1b[0m\r\n');
					
					const startProcess = exec('npm start', { cwd: rootPath });
					let hasOpenedUrl = false;
					
					startProcess.stdout?.on('data', (data) => {
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
								
								// Small delay to ensure server is ready
								setTimeout(() => {
									vscode.commands.executeCommand('trane-ai.openUrl', url);
								}, 1500);
							}
						}
					});
					
					startProcess.stderr?.on('data', (data) => {
						writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
					});
					
					startProcess.on('error', (err) => {
						writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm start failed: ${err.message}\x1b[0m\r\n`);
					});
				});
			},
			close: () => {}
		};

		const terminal = vscode.window.createTerminal({ name: 'TraneAI Review', pty });
		terminal.show();
	}
}
