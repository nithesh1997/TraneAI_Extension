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
            
            // Resolve all URIs first
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

            // Build a single atomic WorkspaceEdit for ALL changes
            const atomicEdit = new vscode.WorkspaceEdit();
            const documentsToSave: Set<string> = new Set();
            let allResolved = true;
            let resolveErrors: string[] = [];

            for (const { uri, proposals } of editsByUri.values()) {
                let doc: vscode.TextDocument | undefined;
                let currentContent = '';
                let isNewFile = false;
                const consumedRanges: {start: number, end: number}[] = [];

                try {
                    doc = await vscode.workspace.openTextDocument(uri);
                    currentContent = doc.getText();
                } catch (e) {
                    isNewFile = true;
                }

                for (const prop of proposals) {
                    if (prop.oldContent.trim() === '') {
                        // File creation or complete overwrite
                        if (isNewFile) {
                            atomicEdit.createFile(uri, { ignoreIfExists: true });
                            atomicEdit.insert(uri, new vscode.Position(0, 0), prop.newContent);
                        } else {
                            const range = new vscode.Range(
                                new vscode.Position(0, 0),
                                doc!.positionAt(currentContent.length)
                            );
                            atomicEdit.replace(uri, range, prop.newContent);
                        }
                        documentsToSave.add(uri.toString());
                    } else {
                        if (isNewFile) {
                            resolveErrors.push(`File ${prop.filePath} does not exist but edit expects old content.`);
                            allResolved = false;
                            continue;
                        }

                        // Use robust matching to find the old text location
                        const match = this.fuzzyFindMatch(currentContent, prop.oldContent, consumedRanges);
                        if (!match) {
                            resolveErrors.push(`Could not find text in ${prop.filePath}. Try reading the file first.`);
                            allResolved = false;
                            continue;
                        }

                        const range = new vscode.Range(
                            doc!.positionAt(match.index), 
                            doc!.positionAt(match.index + match.text.length)
                        );
                        consumedRanges.push({ start: match.index, end: match.index + match.text.length });
                        atomicEdit.replace(uri, range, prop.newContent);
                        documentsToSave.add(uri.toString());
                    }
                }
            }

            if (!allResolved) {
                // Rollback: revert the checkpoint we created
                await this.provider.checkpointManager.revertCheckpoint(checkpointId);
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', `❌ Failed to resolve all edits:\n${resolveErrors.join('\n')}\n\nChanges rolled back.`);
                return;
            }

            // Apply ALL edits in a single atomic operation
            const applied = await vscode.workspace.applyEdit(atomicEdit);
            
            if (!applied) {
                // Rollback on failure
                await this.provider.checkpointManager.revertCheckpoint(checkpointId);
                this.provider.broadcastTyping(false);
                this.provider.addMessage('ai', '❌ VS Code rejected the edit. Changes rolled back.');
                return;
            }

            // Save all modified documents
            for (const uriStr of documentsToSave) {
                try {
                    const saveUri = vscode.Uri.parse(uriStr);
                    const doc = await vscode.workspace.openTextDocument(saveUri);
                    await doc.save();
                } catch { /* best-effort save */ }
            }

            this.provider.broadcastTyping(false);
            const fileCount = editsByUri.size;
            this.provider.addMessage('ai', `✅ Successfully applied ${edits.length} change(s) across ${fileCount} file(s). [Checkpoint: ${checkpointId}]`);
        } catch (error: any) {
            this.provider.broadcastTyping(false);
            this.provider.addMessage('ai', `❌ Error: ${error.message}`);
        }
    }

    /** Fuzzy find needle in haystack (whitespace-agnostic fallback) */
    private fuzzyFindMatch(haystack: string, needle: string, consumedRanges: {start: number, end: number}[] = []): { index: number, text: string } | null {
        const isOverlap = (start: number, end: number) => {
            return consumedRanges.some(r => Math.max(start, r.start) < Math.min(end, r.end));
        };

        let exactSearchIdx = 0;
        while (true) {
            const exactIdx = haystack.indexOf(needle, exactSearchIdx);
            if (exactIdx !== -1) {
                if (!isOverlap(exactIdx, exactIdx + needle.length)) {
                    return { index: exactIdx, text: needle };
                }
                exactSearchIdx = exactIdx + 1;
            } else {
                break;
            }
        }

        const nNeedle = needle.replace(/["']/g, "'");
        const nHaystack = haystack.replace(/["']/g, "'");
        let qSearchIdx = 0;
        while (true) {
            const qIdx = nHaystack.indexOf(nNeedle, qSearchIdx);
            if (qIdx !== -1) {
                if (!isOverlap(qIdx, qIdx + needle.length)) {
                    return { index: qIdx, text: haystack.substring(qIdx, qIdx + needle.length) };
                }
                qSearchIdx = qIdx + 1;
            } else {
                break;
            }
        }

        interface Char { char: string; index: number; }
        const hChars: Char[] = [];
        for (let i = 0; i < haystack.length; i++) {
            if (!/\s/.test(haystack[i])) {
                hChars.push({ char: haystack[i] === '"' ? "'" : haystack[i], index: i });
            }
        }

        const nChars: string[] = [];
        for (let i = 0; i < needle.length; i++) {
            if (!/\s/.test(needle[i])) {
                nChars.push(needle[i] === '"' ? "'" : needle[i]);
            }
        }

        if (nChars.length === 0) return null;

        for (let i = 0; i <= hChars.length - nChars.length; i++) {
            let match = true;
            for (let j = 0; j < nChars.length; j++) {
                if (hChars[i + j].char !== nChars[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                let startIndex = hChars[i].index;
                let endIndex = hChars[i + nChars.length - 1].index;

                const leadingWsMatch = needle.match(/^(\s+)/);
                if (leadingWsMatch) {
                    let hWsStart = startIndex;
                    while (hWsStart > 0 && /\s/.test(haystack[hWsStart - 1])) {
                        if (haystack[hWsStart - 1] === '\n' && !leadingWsMatch[1].includes('\n')) break;
                        hWsStart--;
                    }
                    startIndex = hWsStart;
                }

                const trailingWsMatch = needle.match(/(\s+)$/);
                if (trailingWsMatch) {
                    let hWsEnd = endIndex;
                    while (hWsEnd < haystack.length - 1 && /\s/.test(haystack[hWsEnd + 1])) {
                        if (haystack[hWsEnd + 1] === '\n' && !trailingWsMatch[1].includes('\n')) break;
                        hWsEnd++;
                    }
                    endIndex = hWsEnd;
                }

                if (!isOverlap(startIndex, endIndex + 1)) {
                    return {
                        index: startIndex,
                        text: haystack.substring(startIndex, endIndex + 1)
                    };
                }
            }
        }

        return null;
    }
    // Removing the rest of the old fuzzyFindIndex

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
