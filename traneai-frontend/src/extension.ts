import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { ConsoleService } from './services/ConsoleService';

export function activate(context: vscode.ExtensionContext) {
	// Initialize Console Service
	ConsoleService.getInstance();
	let chatPanel: vscode.WebviewPanel | undefined;

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
		vscode.commands.registerCommand('trane-ai.openUrl', (url: string) => {
			const config = vscode.workspace.getConfiguration('trane-ai');
			const openIn = config.get<string>('openIn') || 'vscode';
			
			if (openIn === 'vscode') {
				vscode.commands.executeCommand('simpleBrowser.show', vscode.Uri.parse(url));
			} else {
				vscode.env.openExternal(vscode.Uri.parse(url));
			}
		})
	);

	const disposable = vscode.commands.registerCommand('trane-ai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from TraneAI!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
