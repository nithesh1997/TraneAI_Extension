import * as vscode from 'vscode';

export class ContextBuilder {
    public static getActiveEditorContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        return {
            fileName: editor.document.fileName,
            languageId: editor.document.languageId,
            selection: editor.document.getText(editor.selection),
            cursorPosition: editor.selection.active,
            visibleRange: editor.visibleRanges[0]
        };
    }

    public static getWorkspaceContext() {
        return {
            name: vscode.workspace.name,
            folders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath)
        };
    }

    public static getFullContext() {
        return {
            editor: this.getActiveEditorContext(),
            workspace: this.getWorkspaceContext(),
            timestamp: new Date().toISOString()
        };
    }
}
