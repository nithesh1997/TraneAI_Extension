import * as vscode from 'vscode';
import * as path from 'path';

export interface WorkspaceContext {
    currentFile?: string;
    currentFileContent?: string;
    selectedCode?: string;
    selectionRange?: { start: number; end: number };
    activeEditorLanguage?: string;
    openTabs: string[];
    workspaceFiles: string[];
    projectType: 'react' | 'angular' | 'vue' | 'node' | 'python' | 'java' | 'unknown';
    diagnostics: { file: string; message: string; severity: string }[];
    gitBranch?: string;
}

export class ContextCollector {
    public static async collectContext(): Promise<WorkspaceContext> {
        const activeEditor = vscode.window.activeTextEditor;
        
        const context: WorkspaceContext = {
            openTabs: this.getOpenTabs(),
            workspaceFiles: await this.getWorkspaceFiles(),
            projectType: await this.detectProjectType(),
            diagnostics: this.getCurrentDiagnostics(),
            gitBranch: await this.getGitBranch()
        };

        if (activeEditor) {
            context.currentFile = activeEditor.document.uri.fsPath;
            context.currentFileContent = activeEditor.document.getText();
            context.activeEditorLanguage = activeEditor.document.languageId;
            
            const selection = activeEditor.selection;
            if (!selection.isEmpty) {
                context.selectedCode = activeEditor.document.getText(selection);
                context.selectionRange = {
                    start: activeEditor.document.offsetAt(selection.start),
                    end: activeEditor.document.offsetAt(selection.end)
                };
            }
        }

        return context;
    }

    private static getOpenTabs(): string[] {
        const tabs: string[] = [];
        try {
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        tabs.push(tab.input.uri.fsPath);
                    }
                }
            }
        } catch (e) {
            console.error('Error getting open tabs:', e);
        }
        return tabs;
    }

    private static async getWorkspaceFiles(): Promise<string[]> {
        try {
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
            return files.map(f => f.fsPath);
        } catch (e) {
            console.error('Error getting workspace files:', e);
            return [];
        }
    }

    private static async detectProjectType(): Promise<'react' | 'angular' | 'vue' | 'node' | 'python' | 'java' | 'unknown'> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return 'unknown';

        const rootPath = workspaceFolders[0].uri.fsPath;
        
        try {
            const packageJsonUri = vscode.Uri.file(path.join(rootPath, 'package.json'));
            const packageJsonData = await vscode.workspace.fs.readFile(packageJsonUri);
            const packageJson = JSON.parse(Buffer.from(packageJsonData).toString());
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            if (deps['react']) return 'react';
            if (deps['@angular/core']) return 'angular';
            if (deps['vue']) return 'vue';
            return 'node';
        } catch (e) {
            // Not a JS/TS project or package.json missing
        }

        try {
            const files = await vscode.workspace.findFiles('{requirements.txt,setup.py,pom.xml,build.gradle}', '**/node_modules/**', 1);
            if (files.length > 0) {
                const fileName = path.basename(files[0].fsPath);
                if (fileName === 'requirements.txt' || fileName === 'setup.py') return 'python';
                if (fileName === 'pom.xml' || fileName === 'build.gradle') return 'java';
            }
        } catch (e) {
            console.error('Error detecting project type:', e);
        }

        return 'unknown';
    }

    private static getCurrentDiagnostics(): { file: string; message: string; severity: string }[] {
        try {
            const diagnostics = vscode.languages.getDiagnostics();
            const result: { file: string; message: string; severity: string }[] = [];

            for (const [uri, diagList] of diagnostics) {
                for (const diag of diagList) {
                    if (diag.severity === vscode.DiagnosticSeverity.Error || diag.severity === vscode.DiagnosticSeverity.Warning) {
                        result.push({
                            file: uri.fsPath,
                            message: diag.message,
                            severity: vscode.DiagnosticSeverity[diag.severity]
                        });
                    }
                }
            }
            return result.slice(0, 20);
        } catch (e) {
            console.error('Error getting diagnostics:', e);
            return [];
        }
    }

    private static async getGitBranch(): Promise<string | undefined> {
        try {
            const extension = vscode.extensions.getExtension('vscode.git');
            if (extension) {
                const gitExtension = extension.isActive ? extension.exports : await extension.activate();
                const api = gitExtension.getAPI(1);
                if (api.repositories && api.repositories.length > 0) {
                    const repo = api.repositories[0];
                    return repo.state.HEAD?.name;
                }
            }
        } catch (e) {
            // Git extension not found or failed to activate
        }
        return undefined;
    }
}
