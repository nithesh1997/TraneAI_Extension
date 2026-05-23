/**
 * ChatActionHandler processes user actions from the chat UI.
 * It routes quick actions, code analysis, edit proposals, tool executions,
 * and other command-based interactions through the chat provider.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as fileTools from './fileTools';
import * as codeAnalysis from './codeAnalysis';
import * as editConfirmation from './editConfirmation';
import { CheckpointManager } from './checkpointManager';
import { EditProposal } from '../webview/components/Message';
import { generateExplanation, generateReview, generateTests } from '../utils/codeGenerators';

export interface IChatProvider {
    addMessage(role: 'user' | 'ai', text: string, attachments?: any[], id?: string, isStreaming?: boolean): void;
    broadcastTyping(isTyping: boolean): void;
    get checkpointManager(): CheckpointManager;
}

export class ChatActionHandler {
    constructor(private provider: IChatProvider) {}

    public async handleQuickAction(action: string, text: string) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            this.provider.addMessage('user', text);
            this.provider.broadcastTyping(true);
            setTimeout(() => {
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', 'No file is currently open. Please open a file in the editor and try again.');
            }, 800);
            return;
        }

        const document = editor.document;
        const fileName = document.fileName.split(/[\\/]/).pop() ?? 'file';
        const language = document.languageId;
        const fileContent = document.getText();
        const lineCount = document.lineCount;

        this.provider.addMessage('user', text);
        this.provider.broadcastTyping(true);

        setTimeout(() => {
            this.provider.broadcastTyping(false);
            let response = '';
            if (action === 'explain') {
                response = generateExplanation(fileName, language, fileContent, lineCount);
            } else if (action === 'review') {
                response = generateReview(fileName, language, fileContent, lineCount);
            } else if (action === 'tests') {
                response = generateTests(fileName, language, fileContent, lineCount);
            }
            this.provider.addMessage('ai', response);
        }, 1500);
    }

    public async handleToolExecution(toolName: string, params: Record<string, any>) {
        this.provider.broadcastTyping(true);
        this.provider.addMessage('user', `Executing ${toolName}...`);
        
        try {
            const result = await fileTools.executeTool(toolName, params);
            this.provider.broadcastTyping(false);
            
            if (result.success) {
                this.provider.addMessage('ai', result.message);
            } else {
                this.provider.addMessage('ai', `❌ ${result.message}`);
            }
        } catch (error: any) {
            this.provider.broadcastTyping(false);
            this.provider.addMessage('ai', `Error: ${error.message}`);
        }
    }

    public async handleFileAnalysis(filePath: string) {
        this.provider.broadcastTyping(true);
        this.provider.addMessage('user', `Analyzing ${filePath}...`);
        
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', 'No workspace open');
                return;
            }
            
            let uri: vscode.Uri;
            if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
                uri = vscode.Uri.file(filePath);
            } else {
                uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            }
            
            const result = await codeAnalysis.analyzeFileWithLSP(uri);
            this.provider.broadcastTyping(false);
            
            if (result.success && result.analysis) {
                const md = codeAnalysis.generateAnalysisMarkdown(result.analysis);
                this.provider.addMessage('ai', md);
            } else {
                this.provider.addMessage('ai', `Error: ${result.error}`);
            }
        } catch (error: any) {
            this.provider.broadcastTyping(false);
            this.provider.addMessage('ai', `Error: ${error.message}`);
        }
    }

    public async handleApplyEdit(filePath: string, oldText: string, newText: string) {
        this.handleApplyMultiEdit([{ filePath, oldContent: oldText, newContent: newText }]);
    }

    public async handleApplyMultiEdit(edits: EditProposal[]) {
        this.provider.broadcastTyping(true);
        
        try {
            const filePaths = edits.map(e => e.filePath);
            const checkpointId = await this.provider.checkpointManager.createCheckpoint(filePaths);
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', '❌ No workspace open.');
                return;
            }
            
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

            this.provider.broadcastTyping(false);
            
            if (errors.length > 0 && totalApplied === 0) {
                this.provider.addMessage('ai', `❌ Failed to apply edits:\n${errors.join('\n')}`);
            } else if (errors.length > 0) {
                this.provider.addMessage('ai', `⚠️ Partially applied ${totalApplied} change(s), but encountered some issues:\n${errors.join('\n')}\n\n[Checkpoint: ${checkpointId}]`);
            } else {
                this.provider.addMessage('ai', `✅ Successfully applied all ${totalApplied} change(s). [Checkpoint: ${checkpointId}]`);
            }
        } catch (error: any) {
            this.provider.broadcastTyping(false);
            this.provider.addMessage('ai', `❌ Error: ${error.message}`);
        }
    }

    public async handleRevertEdit(filePath: string, oldText: string, newText: string) {
        this.provider.addMessage('user', `Reverting changes in ${filePath}...`);
        this.provider.broadcastTyping(true);
        
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', 'No workspace open');
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
            
            let startIndex = content.indexOf(newText);
            
            if (startIndex === -1) {
                const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
                const normalizedContent = normalize(content);
                const normalizedNewText = normalize(newText);
                
                const normalizedIndex = normalizedContent.indexOf(normalizedNewText);
                if (normalizedIndex !== -1) {
                    const firstLine = normalizedNewText.split('\n')[0].trim();
                    if (firstLine) {
                        startIndex = content.indexOf(firstLine);
                    }
                }
            }
            
            if (startIndex === -1) {
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', 'Could not find the applied changes to revert. The file contents may have changed significantly.');
                return;
            }
            
            const startPos = doc.positionAt(startIndex);
            const endPos = doc.positionAt(startIndex + newText.length);
            
            const edit = vscode.TextEdit.replace(
                new vscode.Range(startPos, endPos),
                oldText
            );
            
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(uri, [edit]);
            const applied = await vscode.workspace.applyEdit(workspaceEdit);
            
            this.provider.broadcastTyping(false);
            
            if (applied) {
                await doc.save();
                this.provider.addMessage('ai', `🔄 Reverted changes in ${filePath}`);
            } else {
                this.provider.addMessage('ai', 'Failed to revert changes');
            }
        } catch (error: any) {
            this.provider.broadcastTyping(false);
            this.provider.addMessage('ai', `Error: ${error.message}`);
        }
    }

    public async handleEditConfirmation(filePath: string, oldText: string, newText: string) {
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

    public async applyAllPendingEdits() {
        const count = await editConfirmation.applyAllPendingEdits();
        this.provider.addMessage('ai', `Applied ${count} pending edits`);
    }

    public async discardPendingEdits() {
        await editConfirmation.discardAllEdits();
        this.provider.addMessage('ai', 'Discarded all pending edits');
    }

    public sendToolsList() {
        const tools = fileTools.getToolsForAI();
        this.provider.addMessage('ai', `**Available File Operations:**\n\n${tools}\n\nUse these tools by sending a message like: "Read file src/index.ts" or "Create file src/test.ts with content..."`);
    }

    public async handleShowDiff(filePath: string, oldText: string, newText: string) {
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

            const doc = await vscode.workspace.openTextDocument(uri);
            const currentContent = doc.getText();

            let beforeContent = currentContent;
            let afterContent = currentContent;

            if (currentContent.includes(oldText)) {
                afterContent = currentContent.replace(oldText, newText);
            } else if (currentContent.includes(newText)) {
                beforeContent = currentContent.replace(newText, oldText);
            } else {
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

    public async handleOpenFile(filePath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) return;

            let targetUri: vscode.Uri | undefined;

            if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
                targetUri = vscode.Uri.file(filePath);
            } else {
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

    public handleExecuteCommand(command: string) {
        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('TraneAI');
        terminal.show();
        terminal.sendText(command);
    }
}
