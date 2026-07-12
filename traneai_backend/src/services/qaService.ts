import { EventEmitter } from 'events';
import { exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Indexer } from './rag/indexer.js';

class QAOrchestrator extends EventEmitter {
    private activeProcesses: Map<string, ChildProcess> = new Map();

    public async startWorkflow(sessionId: string, workspaceId: string, rootPath: string, ticketId: string) {
        this.emitLog(sessionId, `[QA Workflow Started] Session: ${sessionId}, Ticket: ${ticketId}\n`);
        
        try {
            // 1. RAG Context Lookup
            this.emitLog(sessionId, `Step 1/5: Analyzing project structure...\n`);
            const indexer = new Indexer(workspaceId);
            await indexer.initialize();
            
            const results = await indexer.search('package.json scripts start dev build requirements testing guide how to run', 3);
            let contextHint = '';
            if (results && results.length > 0) {
                contextHint = results.map(r => r.text).join('\n');
                this.emitLog(sessionId, `Step 1/5 complete: Project context retrieved from ${results.length} documents.\n`);
            } else {
                this.emitLog(sessionId, `Step 1/5 complete: No specific project context found. Falling back to defaults.\n`);
            }

            // 2. Git status
            this.emitLog(sessionId, `Step 2/5: Checking git status...\n`);
            try {
                await this.runCommand(sessionId, 'git status --short', rootPath);
                this.emitLog(sessionId, `Step 2/5 complete: Git status checked.\n`);
            } catch (e) {
                // Ignore git errors if not a repo
                this.emitLog(sessionId, `Step 2/5 complete: Not a git repository or error checking status.\n`);
            }

            // 3. Checkout branch
            if (ticketId && ticketId.trim() !== '') {
                this.emitLog(sessionId, `Step 3/5: Searching for branch matching ${ticketId}...\n`);
                try {
                    await this.runCommand(sessionId, `git fetch`, rootPath);
                    await this.runCommand(sessionId, `git checkout ${ticketId}`, rootPath);
                    this.emitLog(sessionId, `Step 3/5 complete: Checked out branch ${ticketId}.\n`);
                } catch (err) {
                    this.emitLog(sessionId, `Step 3/5 complete: Could not checkout ${ticketId}. Continuing on current branch.\n`);
                }
            } else {
                this.emitLog(sessionId, `Step 3/5 complete: No ticket branch specified. Continuing on current branch.\n`);
            }

            // 4. Install dependencies
            this.emitLog(sessionId, `Step 4/5: Checking whether dependencies are already installed...\n`);
            const useYarn = fs.existsSync(path.join(rootPath, 'yarn.lock'));
            const installCmd = useYarn ? 'yarn install' : 'npm install';
            try {
                await this.runCommand(sessionId, installCmd, rootPath);
                this.emitLog(sessionId, `Step 4/5 complete: Dependencies checked/installed.\n`);
            } catch (err) {
                this.emitLog(sessionId, `Step 4/5 complete: Dependency installation exited with non-zero code.\n`);
            }

            // 5. Start Application
            this.emitLog(sessionId, `Step 5/5: Starting the application...\n`);
            
            // Intelligently decide start command from RAG or fallback
            let startCmd = 'npm start';
            try {
                const pkgPath = path.join(rootPath, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    if (pkg.scripts && pkg.scripts.dev) {
                        startCmd = 'npm run dev';
                    }
                }
            } catch (e) {}

            // Prevent apps from opening external browser automatically
            if (process.platform === 'win32') {
                startCmd = `set BROWSER=none && ${startCmd}`;
            } else {
                startCmd = `BROWSER=none ${startCmd}`;
            }

            this.emitLog(sessionId, `Step 5/5 in progress: Running ${startCmd}\n`);
            this.runLongCommand(sessionId, startCmd, rootPath);
            
        } catch (error: any) {
            this.emitLog(sessionId, `[Error] QA Workflow failed: ${error.message}\n`);
        }
    }

    private emitLog(sessionId: string, message: string) {
        this.emit(`log-${sessionId}`, message);
    }

    private runCommand(sessionId: string, cmd: string, cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const env = { ...process.env };
            delete env.PORT;
            const proc = exec(cmd, { cwd, env });
            
            proc.stdout?.on('data', (data) => {
                this.emitLog(sessionId, data.toString());
            });
            
            proc.stderr?.on('data', (data) => {
                this.emitLog(sessionId, data.toString());
            });
            
            proc.on('exit', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Command exited with code ${code}`));
            });
        });
    }

    private runLongCommand(sessionId: string, cmd: string, cwd: string) {
        const env = { ...process.env };
        delete env.PORT;
        const proc = exec(cmd, { cwd, env });
        this.activeProcesses.set(sessionId, proc);

        proc.stdout?.on('data', (data) => {
            this.emitLog(sessionId, data.toString());
        });
        
        proc.stderr?.on('data', (data) => {
            this.emitLog(sessionId, data.toString());
        });
        
        proc.on('exit', (code) => {
            this.emitLog(sessionId, `[Process] Exited with code ${code}\n`);
            this.activeProcesses.delete(sessionId);
        });
    }

    public stopWorkflow(sessionId: string) {
        const proc = this.activeProcesses.get(sessionId);
        if (proc && proc.pid) {
            this.emitLog(sessionId, `[System] Stopping process...\n`);
            try {
                if (process.platform === 'win32') {
                    exec(`taskkill /PID ${proc.pid} /T /F`);
                } else {
                    proc.kill();
                }
            } catch (e) {
                proc.kill();
            }
            this.activeProcesses.delete(sessionId);
        }
    }
}

export const qaOrchestrator = new QAOrchestrator();
