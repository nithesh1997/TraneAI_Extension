import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { ConsoleService } from './services/ConsoleService';
import { SyncBridge } from './syncBridge';
import { BrowserPanel } from './browser/browserPanel';
import { MessageType } from './types';
import { AIService } from './ai/aiService';

export function activate(context: vscode.ExtensionContext) {
	// Initialize Console Service
	ConsoleService.getInstance();

	// Initialize Sync Bridge
	const syncBridge = SyncBridge.getInstance();
	
	// Initialize AI Service
	AIService.getInstance();
	
	let chatPanel: vscode.WebviewPanel | undefined;

	// Watchers (Layer 5)
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => {
			syncBridge.send(MessageType.FILE_CHANGED, {
				uri: e.document.uri.toString(),
				content: e.document.getText()
			});
		}),
		vscode.window.onDidChangeTextEditorSelection(e => {
			syncBridge.send(MessageType.CURSOR_MOVED, {
				uri: e.textEditor.document.uri.toString(),
				line: e.selections[0].active.line,
				character: e.selections[0].active.character,
				selection: e.textEditor.document.getText(e.selections[0])
			});
		})
	);

	// Register Browser Panel Command
	context.subscriptions.push(
		vscode.commands.registerCommand('trane-ai.openBrowser', async () => {
			const uri = vscode.Uri.parse('http://localhost:3000');
			const externalUri = await vscode.env.asExternalUri(uri);
			BrowserPanel.createOrShow(context.extensionUri, externalUri.toString());
		})
	);

	// Auto-reload logic for development
	if (context.extensionMode === vscode.ExtensionMode.Development) {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(context.extensionUri, 'dist/extension.js')
		);
		watcher.onDidChange(() => {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		});
		context.subscriptions.push(watcher);
	}

	// Register Chat View Provider
	const provider = new ChatViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
	);

	// Auto-reload logic for webview in development
	if (context.extensionMode === vscode.ExtensionMode.Development) {
		const webviewWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(context.extensionUri, 'resources/webview/{main.js,style.css}')
		);

		let debounceTimer: NodeJS.Timeout | undefined;
		const triggerRefresh = () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			debounceTimer = setTimeout(() => {
				provider.refresh();
			}, 100);
		};

		webviewWatcher.onDidChange(triggerRefresh);
		webviewWatcher.onDidCreate(triggerRefresh);
		webviewWatcher.onDidDelete(triggerRefresh);
		
		context.subscriptions.push(webviewWatcher);
	}

	// Register Full Screen Command
	context.subscriptions.push(
		vscode.commands.registerCommand('trane-ai.openChatFullScreen', () => {
			if (chatPanel) {
				chatPanel.reveal();
			} else {
				chatPanel = provider.renderFullScreen();
				vscode.commands.executeCommand('setContext', 'traneai.isFullScreen', true);
				provider.setFullScreen(true);
				
				if (chatPanel) {
					chatPanel.onDidDispose(() => {
						chatPanel = undefined;
						vscode.commands.executeCommand('setContext', 'traneai.isFullScreen', false);
						vscode.commands.executeCommand('setContext', 'activeWebviewPanelId', undefined);
						provider.setFullScreen(false);
					});
				}
				vscode.commands.executeCommand('setContext', 'activeWebviewPanelId', 'traneai.chatFullScreen');
			}
		})
	);

	// Register Restore to Sidebar Command
	context.subscriptions.push(
		vscode.commands.registerCommand('trane-ai.restoreToSidebar', () => {
			if (chatPanel) {
				chatPanel.dispose();
				chatPanel = undefined;
				vscode.commands.executeCommand('setContext', 'traneai.isFullScreen', false);
				vscode.commands.executeCommand('setContext', 'activeWebviewPanelId', undefined);
				provider.setFullScreen(false);
			}
			// Focus sidebar
			vscode.commands.executeCommand('traneai.chatView.focus');
		})
	);

	// Register New Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('trane-ai.newChat', () => {
			vscode.window.showInformationMessage('New Chat');
		}),
		vscode.commands.registerCommand('trane-ai.showHistory', () => {
			vscode.window.showInformationMessage('Show History');
		}),
		vscode.commands.registerCommand('trane-ai.openSettings', () => {
			vscode.window.showInformationMessage('Open Settings');
		}),
		vscode.commands.registerCommand('trane-ai.moreActions', () => {
			vscode.window.showInformationMessage('More Actions');
		}),
		vscode.commands.registerCommand('trane-ai.closeChat', () => {
			vscode.commands.executeCommand('workbench.action.closeSidebarPane');
		}),
		vscode.commands.registerCommand('trane-ai.openUrl', async (url: string) => {
			const config = vscode.workspace.getConfiguration('trane-ai');
			const openIn = config.get<string>('openIn') || 'vscode';
			
			const uri = vscode.Uri.parse(url);
			const externalUri = await vscode.env.asExternalUri(uri);
			const finalUrl = externalUri.toString();

			if (openIn === 'vscode') {
				// If browser panel is open, navigate it
				if (BrowserPanel.currentPanel) {
					syncBridge.send(MessageType.NAVIGATE, { url: finalUrl });
				} else {
					vscode.commands.executeCommand('simpleBrowser.show', finalUrl);
				}
			} else {
				vscode.env.openExternal(externalUri);
			}
		})
	);

	const disposable = vscode.commands.registerCommand('trane-ai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from TraneAI!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
