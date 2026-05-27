import * as vscode from 'vscode';

export enum LogLevel {
    Verbose = 'Verbose',
    Info = 'Info',
    Warning = 'Warning',
    Error = 'Error'
}

export enum LogSource {
    Runtime = 'runtime',
    Workspace = 'workspace'
}

export interface LogEntry {
    id: string;
    timestamp: number;
    source: LogSource;
    level: LogLevel;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    count: number;
}

export class ConsoleService {
    private static _instance: ConsoleService;
    private _logs: LogEntry[] = [];
    private _onDidUpdateLogs = new vscode.EventEmitter<LogEntry[]>();
    public readonly onDidUpdateLogs = this._onDidUpdateLogs.event;

    private constructor() {
        this.setupWorkspaceDiagnostics();
        this.setupDebugCapture();
    }

    public static getInstance(): ConsoleService {
        if (!ConsoleService._instance) {
            ConsoleService._instance = new ConsoleService();
        }
        return ConsoleService._instance;
    }

    private setupWorkspaceDiagnostics() {
        vscode.languages.onDidChangeDiagnostics((e) => {
            this.refreshAllDiagnostics();
        });

        // Initial capture
        this.refreshAllDiagnostics();
    }

    private refreshAllDiagnostics() {
        const allDiagnostics = vscode.languages.getDiagnostics();
        
        // Remove all existing workspace logs
        this._logs = this._logs.filter(log => log.source !== LogSource.Workspace);

        allDiagnostics.forEach(([uri, diagnostics]) => {
            diagnostics.forEach(diag => {
                let level = LogLevel.Info;
                if (diag.severity === vscode.DiagnosticSeverity.Error) level = LogLevel.Error;
                if (diag.severity === vscode.DiagnosticSeverity.Warning) level = LogLevel.Warning;
                if (diag.severity === vscode.DiagnosticSeverity.Information) level = LogLevel.Info;
                if (diag.severity === vscode.DiagnosticSeverity.Hint) level = LogLevel.Verbose;

                this._logs.push({
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: Date.now(),
                    source: LogSource.Workspace,
                    level,
                    message: diag.message,
                    file: uri.fsPath,
                    line: diag.range.start.line + 1,
                    column: diag.range.start.character + 1,
                    count: 1
                });
            });
        });
        
        // Keep last 1000 logs (Workspace logs + Runtime logs)
        if (this._logs.length > 1000) {
            this._logs = this._logs.slice(-1000);
        }

        this._onDidUpdateLogs.fire(this._logs);
    }

    private setupDebugCapture() {
        vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
            if (e.event === 'output') {
                const { category, output, data } = e.body;
                let level = LogLevel.Info;
                if (category === 'stderr') level = LogLevel.Error;
                if (category === 'console' && output.toLowerCase().includes('error')) level = LogLevel.Error;
                if (category === 'console' && output.toLowerCase().includes('warn')) level = LogLevel.Warning;

                this.addLog({
                    source: LogSource.Runtime,
                    level,
                    message: output.trim(),
                    file: data?.source?.path,
                    line: data?.line,
                    column: data?.column
                });
            }
        });
    }

    public addLog(entry: Partial<LogEntry>) {
        if (!entry.message) return;

        // Deduplication logic
        const existing = this._logs.find(l => 
            l.message === entry.message && 
            l.source === (entry.source || LogSource.Runtime) && 
            l.level === (entry.level || LogLevel.Info) &&
            l.file === entry.file &&
            l.line === entry.line
        );

        if (existing) {
            existing.count++;
            existing.timestamp = Date.now();
        } else {
            this._logs.push({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                source: entry.source || LogSource.Runtime,
                level: entry.level || LogLevel.Info,
                message: entry.message,
                file: entry.file,
                line: entry.line,
                column: entry.column,
                count: 1
            });
        }

        // Keep last 1000 logs
        if (this._logs.length > 1000) {
            this._logs = this._logs.slice(-1000);
        }

        this._onDidUpdateLogs.fire(this._logs);
    }

    public getLogs() {
        return this._logs;
    }

    public clearLogs() {
        this._logs = [];
        this._onDidUpdateLogs.fire(this._logs);
    }
}
