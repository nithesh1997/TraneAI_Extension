/**
 * MessageHandler maps incoming webview commands to extension actions.
 * It interprets user events from the chat UI and invokes the appropriate
 * provider behavior, such as sending messages, file operations, and tools.
 */
import { ChatViewProvider } from '../ChatViewProvider';
import { ConsoleService, LogLevel, LogSource } from './ConsoleService';
import * as vscode_api from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function handleWebviewMessage(provider: ChatViewProvider, data: any, vscode: any) {
    switch (data.command) {
        case 'login':
            const prevEmail = provider.userEmail;
            provider.userEmail = data.email || '';
            provider.sessionManager.ensureTraneAIDir();
            if (prevEmail && prevEmail !== provider.userEmail) {
                provider.createNewSession();
            }
            provider.broadcastHistoryList();
            break;
        case 'logout':
            provider.saveCurrentSession(false);
            provider.userEmail = '';
            provider.createNewSession();
            provider.syncMessages();
            break;
        case 'restore':
            vscode.commands.executeCommand('trane-ai.restoreToSidebar');
            break;
        case 'sendMessage':
            if (!provider.currentSessionId) {
                provider.createNewSession();
            }

            // Read attached file contents and append to message
            let enrichedText = data.text;
            const fileAttachments = (data.attachments || []).filter((a: any) => a.type === 'file');
            for (const file of fileAttachments) {
                if (file.path) {
                    const workspaceRoot = provider.findWorkspaceAppRoot();
                    if (workspaceRoot) {
                        const fullPath = path.join(workspaceRoot, file.path);
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            enrichedText += `\n\nFile: ${file.path}\n\`\`\`\n${content}\n\`\`\``;
                        } catch {
                            enrichedText += `\n\n[File not found: ${file.path}]`;
                        }
                    }
                }
            }
            provider.addMessage('user', data.text, data.attachments);

            const hasConsoleAttachment = (data.attachments || []).some((a: any) => a.type === 'console');

            if (data.text.includes('@comprehensive-review')) {
                provider.automationWorkflows.runComprehensiveReview();
                return;
            }

            if (data.model === 'qa' && data.text.includes('@research') && !hasConsoleAttachment) {
                const ticketMatch = data.text.match(/@research\s+(?:Branch:\s*)?([A-Za-z0-9\-_./]+)/i);
                if (ticketMatch) {
                    provider.automationWorkflows.runQAResearchWorkflow(ticketMatch[1]);
                    return;
                }
                const imageAttachments = (data.attachments || []).filter((a: any) => a.type === 'image' && a.imageData);
                if (imageAttachments.length > 0) {
                    provider.automationWorkflows.extractTicketAndRunWorkflow(imageAttachments[0]);
                    return;
                }
            }

            provider.broadcastTyping(true);
            provider.abortController = new AbortController();
            provider.sendToBackend(enrichedText, data.model, data.attachments, provider.abortController.signal).then(() => {
                provider.broadcastTyping(false);
                provider.saveCurrentSession();
                provider.broadcastHistoryList();
            }).catch((error: any) => {
                provider.broadcastTyping(false);
                if (error.name !== 'AbortError') {
                    provider.addMessage('ai', `Error: ${error.message}`);
                    provider.saveCurrentSession();
                }
            });

            break;
        case 'quickAction':
            provider.actionHandler.handleQuickAction(data.action, data.text);
            break;
        case 'stopGeneration':
            provider.stopGeneration();
            break;
        case 'clearChat':
            provider.deleteSession(provider.currentSessionId);
            break;
        case 'copyMessage':
            vscode.env.clipboard.writeText(data.text);
            break;
        case 'filesSelected':
            break;
        case 'loadHistory':
            provider.broadcastHistoryList();
            break;
        case 'loadSession':
            provider.saveCurrentSession(false);
            provider.loadSessionById(data.sessionId);
            provider.broadcastHistoryList();
            break;
        case 'deleteSession':
            provider.deleteSession(data.sessionId);
            break;
        case 'newChat':
            provider.saveCurrentSession(false);
            provider.createNewSession();
            provider.syncMessages();
            provider.broadcastHistoryList();
            break;
        case 'openFolder':
            vscode.commands.executeCommand('vscode.openFolder');
            break;
        case 'cloneRepository':
            vscode.commands.executeCommand('git.clone');
            break;
        case 'executeTool':
            provider.actionHandler.handleToolExecution(data.toolName, data.params);
            break;
        case 'analyzeFile':
            provider.actionHandler.handleFileAnalysis(data.filePath);
            break;
        case 'applyEdit':
            provider.actionHandler.handleApplyEdit(data.filePath, data.oldText, data.newText);
            break;
        case 'revertEdit':
            provider.actionHandler.handleRevertEdit(data.filePath, data.oldText, data.newText);
            break;
        case 'requestEditConfirmation':
            provider.actionHandler.handleEditConfirmation(data.filePath, data.oldText, data.newText);
            break;
        case 'applyPendingEdits':
            provider.actionHandler.applyAllPendingEdits();
            break;
        case 'discardPendingEdits':
            provider.actionHandler.discardPendingEdits();
            break;
        case 'getTools':
            provider.actionHandler.sendToolsList();
            break;
        case 'showDiff':
            provider.actionHandler.handleShowDiff(data.filePath, data.oldText, data.newText);
            break;
        case 'applyMultiEdit':
            provider.actionHandler.handleApplyMultiEdit(data.edits);
            break;
        case 'openFile':
            provider.actionHandler.handleOpenFile(data.filePath);
            break;
        case 'fixLog':
            const activeEditor = vscode.window.activeTextEditor;
            const log = data.log;
            let contextText = `I'm seeing this issue in the ${log.source}:\n\n**${log.level}**: ${log.message}`;
            if (log.file) {
                contextText += `\nLocation: \`${log.file}\` (line ${log.line})`;
            }
            
            if (activeEditor) {
                const doc = activeEditor.document;
                const selection = activeEditor.selection;
                const fileName = doc.fileName.split(/[\\/]/).pop();
                contextText += `\n\nActive file: \`${fileName}\``;
                if (!selection.isEmpty) {
                    const selectedText = doc.getText(selection);
                    contextText += `\nRelevant code:\n\`\`\`\n${selectedText}\n\`\`\``;
                }
            }
            
            contextText += `\n\nPlease help me fix it.`;
            
            if (!provider.currentSessionId) {
                provider.createNewSession();
            }
            provider.addMessage('user', contextText);
            provider.broadcastTyping(true);
            provider.sendToBackend(contextText, data.model || 'auto', [], provider.abortController?.signal).then(() => {
                provider.broadcastTyping(false);
                provider.saveCurrentSession();
                provider.broadcastHistoryList();
            }).catch(() => {
                provider.broadcastTyping(false);
            });
            break;
        case 'executeCommand':
            provider.actionHandler.handleExecuteCommand(data.cmd);
            break;
        case 'getWorkspaceRoot':
            provider.syncMessages();
            break;
        case 'selectChoice':
            if (provider.pendingChoices.has('branchSelection')) {
                const resolve = provider.pendingChoices.get('branchSelection');
                if (resolve) {
                    resolve(data.choice);
                    provider.pendingChoices.delete('branchSelection');
                }
            }
            break;
        case 'openUrl':
            if (data.url) {
                vscode.commands.executeCommand('simpleBrowser.api.open', data.url).catch(() => {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(data.url));
                });
            }
            break;
        case 'clearLogs':
            ConsoleService.getInstance().clearLogs();
            break;
        case 'executeExpression':
            const expression = data.expression;
            if (!expression) break;
            
            // Try evaluating in debug session first
            const activeDebugSession = vscode.debug.activeDebugSession;
            if (activeDebugSession) {
                activeDebugSession.evaluate(expression).then(
                    (result: any) => {
                        ConsoleService.getInstance().addLog({
                            level: LogLevel.Info,
                            message: `Result: ${JSON.stringify(result)}`,
                            source: LogSource.Runtime
                        });
                    },
                    (error: any) => {
                        ConsoleService.getInstance().addLog({
                            level: LogLevel.Error,
                            message: `Evaluation Error: ${error.message}`,
                            source: LogSource.Runtime
                        });
                    }
                );
            } else {
                // Fallback to active terminal
                const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('TraneAI Console');
                terminal.show();
                terminal.sendText(expression);
            }
            break;
        case 'takeSnapshot':
            if (provider.activeBrowserUrl) {
                provider.broadcastTyping(true);
                fetch('http://localhost:5000/api/chat/screenshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: provider.activeBrowserUrl })
                })
                .then(res => res.json())
                .then(result => {
                    provider.broadcastTyping(false);
                    if (result.image) {
                        provider.postMessageToWebview({
                            type: 'snapshotResult',
                            image: result.image,
                            url: result.url
                        });
                    } else if (result.error) {
                        vscode.window.showErrorMessage(`Snapshot failed: ${result.error}`);
                    }
                })
                .catch(err => {
                    provider.broadcastTyping(false);
                    vscode.window.showErrorMessage(`Snapshot error: ${err.message}`);
                });
            }
            break;
    }
}
