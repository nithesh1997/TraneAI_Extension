/**
 * AutomationWorkflows orchestrates QA research automation for the TraneAI extension.
 *
 * This service extracts ticket and issue information from screenshot attachments,
 * analyzes the current workspace and git state, launches local app processes,
 * and updates the chat UI with workflow progress and status information.
 */
import * as vscode from 'vscode';
import { ProcessManager } from './ProcessManager';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync, ChildProcess } from 'child_process';
import { ChatViewProvider } from '../ChatViewProvider';

export class AutomationWorkflows {
    constructor(private provider: ChatViewProvider) {}

	public async extractTicketAndRunWorkflow(imageAttachment: any) {
		const extractingMsgId = `qa-extract-${Date.now()}`;
		this.provider.addMessage('ai', '🔬 **QA Research**\n\n- Extracting ticket information from screenshot...', [], extractingMsgId, false);

		try {
			const formData = new FormData();
			formData.append('message', 'Extract the main ticket/issue number from this screenshot. IMPORTANT: If there are multiple ticket IDs (e.g., in breadcrumbs like "DS-146 / DS-487"), ALWAYS pick the LAST one as it is the most specific. Ignore parent or story tickets. Also extract the ticket title, description, and any requirements or steps to reproduce. Return ONLY valid JSON in this exact format: { "ticketId": "...", "title": "...", "description": "...", "requirements": ["..."] }');
			const imageBuffer = Buffer.from(imageAttachment.imageData, 'base64');
			const blob = new Blob([imageBuffer], { type: imageAttachment.mimeType || 'image/jpeg' });
			formData.append('images', blob, imageAttachment.name || 'ticket.png');

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error('Backend vision request failed');
			}

			const responseData = await response.json();
			const text = responseData.message || '';

			let ticketId = '';
			let ticketContext: { title?: string; description?: string; requirements?: string[] } = {};

			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				try {
					const parsed = JSON.parse(jsonMatch[0]);
					ticketId = parsed.ticketId || '';
					ticketContext = {
						title: parsed.title,
						description: parsed.description,
						requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
					};
				} catch {}
			}

			if (!ticketId) {
				const fallbackMatches = text.match(/([A-Za-z]+-\d+)/g);
				if (fallbackMatches && fallbackMatches.length > 0) {
					ticketId = fallbackMatches[fallbackMatches.length - 1];
				}
			}

			if (!ticketId) {
				this.provider.updateMessageText(extractingMsgId, '🔬 **QA Research**\n\n- ❌ Could not detect ticket number from screenshot. Please type the ticket ID directly, e.g. `@research DS-399`.', false);
				return;
			}

			this.provider.updateMessageText(extractingMsgId, `🔬 **QA Research**\n\n- ✓ Detected ticket **${ticketId}** from screenshot`, false);
			this.runQAResearchWorkflow(ticketId, ticketContext);
		} catch (err: any) {
			this.provider.updateMessageText(extractingMsgId, `🔬 **QA Research**\n\n- ❌ Error extracting ticket: ${err.message}`, false);
		}
	}

public runQAResearchWorkflow(ticketId: string, ticketContext?: { title?: string; description?: string; requirements?: string[] }) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace folder open.');
		return;
	}

	const rootPath = this.provider.findWorkspaceAppRoot() || workspaceFolders[0].uri.fsPath;
	const writeEmitter = new vscode.EventEmitter<string>();
	
	const log = (msg: string) => writeEmitter.fire(msg.replace(/\n/g, '\r\n'));
	const statusMessageId = `qa-status-${ticketId}-${Date.now()}`;
	const statusLines: string[] = [];
	const pushStatus = (text: string) => {
		statusLines.push(`- ${text}`);
		this.provider.updateMessageText(statusMessageId, `🔬 **QA Research: ${ticketId}**\n\n${statusLines.join('\n')}`, false);
	};
	let workflowClosed = false;
	let detectedUrl: string | null = null;
	let fallbackTimeout: NodeJS.Timeout | undefined;
	let mainProcessPid: number | null = null;
	
	// Process management delegated to ProcessManager
	
	const cleanupProcesses = (reason: string) => {
		if (workflowClosed) {
			return;
		}
		workflowClosed = true;
		pushStatus(reason);
		this.provider.activeBrowserUrl = undefined;
		
		log(`\x1b[33m⏹️ Stopping workflow and killing all processes...\x1b[0m\r\n`);
		
		// Kill by PID if we have it
		if (mainProcessPid) {
			log(`\x1b[33m  Killing process tree for PID ${mainProcessPid}...\x1b[0m\r\n`);
			ProcessManager.killProcessTree(mainProcessPid, log);
		}
		
		// Also kill any process on port 3000 to be thorough
		log(`\x1b[33m  Checking for processes on port 3000...\x1b[0m\r\n`);
		ProcessManager.killProcessByPort(3000);
		
		// Clear timeout
		if (fallbackTimeout) {
			clearTimeout(fallbackTimeout);
			fallbackTimeout = undefined;
		}
		
		setTimeout(() => {
			log(`\x1b[32m✓ All processes terminated\x1b[0m\r\n`);
			pushStatus('All processes terminated successfully.');
		}, 1000);
	};
	
	
const openUrlInBrowser = (url: string) => {
    if (!url || workflowClosed) return;
    
    if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = undefined;
    }
    
    log(`\r\n\x1b[32m  ✓ Opening URL in VS Code browser: ${url}\x1b[0m\r\n`);
    pushStatus(`App detected at **${url}**. Opening in VS Code browser now.`);
    this.provider.activeBrowserUrl = url;
    
    setTimeout(() => {
        if (!workflowClosed) {
            // ONLY try VS Code browser methods - no external browser fallback
            Promise.resolve(vscode.commands.executeCommand('simpleBrowser.api.open', url)).catch((err: any) => {
                log(`\x1b[33m  ⚠ Simple browser failed, trying VS Code open command...\x1b[0m\r\n`);
                Promise.resolve(vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url))).catch((err2: any) => {
                    log(`\x1b[31m  ✗ Could not open in VS Code browser: ${err2.message}\x1b[0m\r\n`);
                    pushStatus(`⚠ Could not open browser automatically. Please open ${url} manually in VS Code.`);
                });
            });
        }
    }, 500);
};

	const pty: vscode.Pseudoterminal = {
		onDidWrite: writeEmitter.event,
		handleInput: (data: string) => {
			if (data === '\x03') { // Ctrl+C
				log(`\r\n\x1b[31m^C\x1b[0m\r\n`);
				cleanupProcesses('Workflow stopped by user (Ctrl+C).');
			}
		},
		open: async () => {
			log(`\x1b[34m╔══════════════════════════════════════════╗\x1b[0m\r\n`);
			log(`\x1b[34m║  TraneAI QA Research: ${ticketId.padEnd(19)}║\x1b[0m\r\n`);
			log(`\x1b[34m╚══════════════════════════════════════════╝\x1b[0m\r\n\r\n`);
			log(`\x1b[33m⚠️  Press Ctrl+C to stop the workflow and kill all processes ⚠️\x1b[0m\r\n\r\n`);

			pushStatus('Step 1/5: Analyzing project structure...');
			log(`\x1b[33m[Step 1/5] Analyzing project structure...\x1b[0m\r\n`);

			let packageJson: any = {};
			const packageJsonPath = path.join(rootPath, 'package.json');
			try {
				packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
				log(`\x1b[32m  ✓ Project : ${packageJson.name || 'Unknown'} (v${packageJson.version || '?'})\x1b[0m\r\n`);
				pushStatus(`Step 1/5 complete: Project **${packageJson.name || 'Unknown'}** detected.`);
			} catch {
				log(`\x1b[33m  ⚠ Could not read package.json\x1b[0m\r\n`);
				pushStatus('Step 1/5 warning: Could not read `package.json`. Continuing with defaults.');
			}

			pushStatus('Step 2/5: Checking git status...');
			log(`\r\n\x1b[33m[Step 2/5] Checking git status...\x1b[0m\r\n`);

			const runExec = (cmd: string): Promise<{ stdout: string, stderr: string, code: number | null }> => {
				return new Promise((resolve) => {
					let stdout = '';
					let stderr = '';
					const proc = exec(cmd, { cwd: rootPath });
					proc.stdout?.on('data', (d) => {
						const text = d.toString();
						stdout += text;
						if (cmd === 'git status --short') log(`  ${text}`);
					});
					proc.stderr?.on('data', (d) => {
						const text = d.toString();
						stderr += text;
						if (cmd === 'git status --short') log(`\x1b[31m  ${text}\x1b[0m`);
					});
					proc.on('exit', (code) => resolve({ stdout, stderr, code }));
				});
			};

			const { stdout: gitStatusOutput } = await runExec('git status --short');
			if (workflowClosed) return;
			
			const changedCount = gitStatusOutput.split('\n').map(line => line.trim()).filter(Boolean).length;
			pushStatus(changedCount > 0
				? `Step 2/5 complete: Git status found **${changedCount}** changed entries.`
				: 'Step 2/5 complete: Working tree is clean.');

			pushStatus(`Step 3/5: Searching for branch matching **${ticketId}**...`);
			log(`\r\n\x1b[33m[Step 3/5] Searching for branch: ${ticketId}...\x1b[0m\r\n`);

			log(`\x1b[33m  → Pulling updated branches (git fetch)...\x1b[0m\r\n`);
			await runExec('git fetch');
			if (workflowClosed) return;

			const { stdout: branchOutput } = await runExec('git branch -a');
			if (workflowClosed) return;
			
			const allBranches = branchOutput
				.split('\n')
				.map(b => b.trim().replace(/^\*\s*/, ''))
				.filter(Boolean);

			let matchingBranch = allBranches.find(b => b === ticketId) || 
								   allBranches.find(b => b.toLowerCase().includes(ticketId.toLowerCase()));

			if (!matchingBranch) {
				log(`\x1b[33m  ⚠ No branch matching "${ticketId}" found\x1b[0m\r\n`);
				pushStatus(`Step 3/5: No branch matching **${ticketId}** found. Asking user for branch name...`);
				
				// Generate selection field in webview
				const choicesJson = JSON.stringify(allBranches.slice(0, 100)); // Limit to first 100 branches
				this.provider.addMessage('ai', `I couldn't find a branch for **${ticketId}**. Please select one from the list below or continue with the current branch.\n\n[CHOICE]\nchoices: ${choicesJson}\nplaceholder: Select a branch for ${ticketId}\ncommand: selectChoice\n[/CHOICE]`);

				// Wait for user to select from webview
				const userBranch = await new Promise<string>((resolve) => {
					this.provider.pendingChoices.set('branchSelection', resolve);
				});

				if (userBranch) {
					matchingBranch = userBranch;
				}
			}

const startApplication = () => {
    pushStatus('Step 5/5: Starting the application...');
    log(`\r\n\x1b[33m[Step 5/5] Starting the application...\x1b[0m\r\n`);

    const scripts = packageJson.scripts || {};
    let startCmd = scripts['dev']
	? 'npm run dev'
	: scripts['start']
	? 'npm start'
	: scripts['serve']
	? 'npm run serve'
	: 'npm start';

	// Prevent apps from opening external browser
	if (process.platform === 'win32') {
	startCmd = `set BROWSER=none && ${startCmd}`;
	} else {
	startCmd = `BROWSER=none ${startCmd}`;
	}

    log(`\x1b[32m  → Running: ${startCmd}\x1b[0m\r\n`);
    pushStatus(`Step 5/5 in progress: Running \`${startCmd}\`.`);

    // Function to detect the correct port from package.json or common configs
    const getAppPort = (): number | null => {
        // Check package.json for port configuration
        let port = null;
        
        // Check for port in scripts
        const startScript = scripts.dev || scripts.start || scripts.serve || '';
        const portMatches = [
            ...startScript.matchAll(/--port\s+(\d+)/g),
            ...startScript.matchAll(/-p\s+(\d+)/g),
            ...startScript.matchAll(/PORT=(\d+)/g),
            ...startScript.matchAll(/port:(\d+)/g)
        ];
        
        if (portMatches.length > 0) {
            port = parseInt(portMatches[0][1]);
            log(`\x1b[32m  → Detected port ${port} from package.json scripts\x1b[0m\r\n`);
            return port;
        }
        
        // Check for common frameworks default ports
        const hasVite = fs.existsSync(path.join(rootPath, 'vite.config.js')) || 
                       fs.existsSync(path.join(rootPath, 'vite.config.ts'));
        if (hasVite) {
            log(`\x1b[32m  → Detected Vite project (default port: 5173)\x1b[0m\r\n`);
            return 5173;
        }
        
        const hasNextJs = fs.existsSync(path.join(rootPath, 'next.config.js'));
        if (hasNextJs) {
            log(`\x1b[32m  → Detected Next.js project (default port: 3000)\x1b[0m\r\n`);
            return 3000;
        }
        
        const hasAngular = fs.existsSync(path.join(rootPath, 'angular.json'));
        if (hasAngular) {
            log(`\x1b[32m  → Detected Angular project (default port: 4200)\x1b[0m\r\n`);
            return 4200;
        }
        
        const hasReact = fs.existsSync(path.join(rootPath, 'webpack.config.js')) ||
                        packageJson.dependencies?.react;
        if (hasReact) {
            log(`\x1b[32m  → Detected React project (default port: 3000)\x1b[0m\r\n`);
            return 3000;
        }
        
        // Default to 3000 for most Node.js apps
        log(`\x1b[32m  → Using default port 3000\x1b[0m\r\n`);
        return 3000;
    };

    // Function to wait for the specific port to be ready
    const waitForPort = (port: number, timeout: number = 30000): Promise<string> => {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const net = require('net');
                const socket = new net.Socket();
                
                socket.setTimeout(1000);
                
                socket.on('connect', () => {
                    clearInterval(checkInterval);
                    socket.destroy();
                    log(`\x1b[32m  ✓ Port ${port} is now listening\x1b[0m\r\n`);
                    resolve(`http://localhost:${port}`);
                });
                
                socket.on('timeout', () => {
                    socket.destroy();
                });
                
                socket.on('error', () => {
                    socket.destroy();
                });
                
                socket.connect(port, 'localhost');
                
                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error(`Timeout waiting for port ${port} after ${timeout/1000} seconds`));
                }
            }, 1000);
        });
    };

    // Start the app in external terminal (Windows) or integrated (Linux/macOS)
    if (process.platform === 'win32') {
        log(`\x1b[33m  → Opening in external terminal window (Windows)...\x1b[0m\r\n`);
        const externalCmd = `start cmd /k "cd /d "${rootPath}" && ${startCmd}"`;
        exec(externalCmd);
        log(`\x1b[32m  ✓ External terminal launched\x1b[0m\r\n`);
        
        // Get the expected port
        const expectedPort = getAppPort();
        if (expectedPort) {
            pushStatus(`Waiting for app to start on port ${expectedPort}...`);
            log(`\x1b[33m  → Waiting for app to be ready on port ${expectedPort}...\x1b[0m\r\n`);
            
            // Wait for the port to be ready
            waitForPort(expectedPort, 30000)
                .then(url => {
                    if (!workflowClosed) {
                        detectedUrl = url;
                        log(`\x1b[32m  ✓ App is ready at ${url}\x1b[0m\r\n`);
                        pushStatus(`App detected at **${url}**. Opening in VS Code browser.`);
                        setTimeout(() => {
                            if (!workflowClosed) {
                                openUrlInBrowser(url);
                            }
                        }, 1000);
                    }
                })
                .catch(err => {
                    if (!workflowClosed) {
                        log(`\x1b[33m  ⚠ Could not detect app: ${err.message}\x1b[0m\r\n`);
                        pushStatus(`⚠ Could not detect app on port ${expectedPort}. You may need to open the browser manually to ${expectedPort}.`);
                    }
                });
        } else {
            pushStatus(`⚠ Could not determine app port. You may need to open the browser manually.`);
        }
        
        this.explainCommits(ticketId, rootPath);
        return;
    } else {
        // Linux/macOS: Use integrated terminal with tracking
        log(`\x1b[33m  → Starting with integrated terminal tracking...\x1b[0m\r\n`);
        const startProc = exec(startCmd, { cwd: rootPath });
        
        if (startProc.pid) {
            mainProcessPid = startProc.pid;
            log(`\x1b[32m  → Main process PID: ${mainProcessPid}\x1b[0m\r\n`);
        }
        
        let hasOpenedUrl = false;
        let outputBuffer = '';
        
        const detectAndOpenUrl = (output: string) => {
            if (hasOpenedUrl || workflowClosed) return;
            
            outputBuffer += output;
            const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
            
            // Look for port patterns specifically
            const portMatch = clean.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[:\s]+(\d{4,5})/i);
            let url = null;
            
            if (portMatch) {
                const port = portMatch[1];
                url = `http://localhost:${port}`;
            } else {
                // Fallback to standard port patterns
                const urlMatch = clean.match(
                    /(?:https?:\/\/)?(localhost|127\.0\.0\.1)(:\d{4,5})(?:\/[^\s]*)?/i
                );
                if (urlMatch) {
                    url = urlMatch[0].startsWith('http') ? urlMatch[0] : `http://${urlMatch[0]}`;
                }
            }
            
            if (url && !detectedUrl) {
                detectedUrl = url;
                
                if (!fallbackTimeout) {
                    fallbackTimeout = setTimeout(() => {
                        if (detectedUrl && !hasOpenedUrl && !workflowClosed) {
                            hasOpenedUrl = true;
                            openUrlInBrowser(detectedUrl);
                        }
                    }, 5000);
                }

                const isReady = clean.toLowerCase().includes('compiled successfully') || 
                               clean.toLowerCase().includes('ready in') ||
                               clean.toLowerCase().includes('started successfully') ||
                               clean.toLowerCase().includes('listening on') ||
                               clean.toLowerCase().includes('webpack compiled') ||
                               clean.toLowerCase().includes('server running');
                
                if (isReady && detectedUrl && !hasOpenedUrl) {
                    hasOpenedUrl = true;
                    openUrlInBrowser(detectedUrl);
                }
            }
        };
        
        startProc.stdout?.on('data', (d) => {
            const text = d.toString();
            log(text);
            detectAndOpenUrl(text);
        });
        
        startProc.stderr?.on('data', (d) => {
            const text = d.toString();
            log(text);
            detectAndOpenUrl(text);
        });
        
        startProc.on('error', (err) => {
            log(`\r\n\x1b[31m  ✗ Start failed: ${err.message}\x1b[0m\r\n`);
            pushStatus(`Step 5/5 failed: ${err.message}`);
        });
        
        this.explainCommits(ticketId, rootPath);
        return;
    }
};

			const checkDependenciesAndContinue = () => {
				pushStatus('Step 4/5: Checking whether dependencies are already installed...');
				log(`\r\n\x1b[33m[Step 4/5] Checking dependencies...\x1b[0m\r\n`);

				const nodeModulesPath = path.join(rootPath, 'node_modules');
				const hasNodeModules = fs.existsSync(nodeModulesPath);
				const requiredDeps = [
					...Object.keys(packageJson.dependencies || {}),
					...Object.keys(packageJson.devDependencies || {})
				];
				const missingDeps = hasNodeModules
					? requiredDeps.filter(dep => !fs.existsSync(path.join(nodeModulesPath, ...dep.split('/'))))
					: requiredDeps;

				if (missingDeps.length === 0) {
					log(`\x1b[32m  ✓ Dependencies already installed — skipping install\x1b[0m\r\n`);
					pushStatus('Step 4/5 complete: Dependencies already installed. Skipping install.');
					startApplication();
					return;
				}

				const useYarn = fs.existsSync(path.join(rootPath, 'yarn.lock'));
				const installCmd = useYarn ? 'yarn install' : 'npm install';
				log(`\x1b[33m  ⚠ Missing dependencies detected (${missingDeps.length})\x1b[0m\r\n`);
				log(`\x1b[32m  → Running: ${installCmd}\x1b[0m\r\n`);
				pushStatus(`Step 4/5 in progress: Found **${missingDeps.length}** missing dependencies. Running \`${installCmd}\`.`);

				const installProc = exec(installCmd, { cwd: rootPath });
				installProc.stdout?.on('data', (d) => log(d.toString()));
				installProc.stderr?.on('data', (d) => log(d.toString()));

				installProc.on('exit', (code) => {
					if (workflowClosed) return;
					if (code !== 0) {
						log(`\r\n\x1b[31m  ✗ Installation failed (exit code ${code})\x1b[0m\r\n`);
						pushStatus(`Step 4/5 failed: Dependency installation failed (exit code ${code}).`);
						return;
					}
					log(`\r\n\x1b[32m  ✓ Dependencies installed successfully\x1b[0m\r\n`);
					pushStatus('Step 4/5 complete: Missing dependencies were installed successfully.');
					startApplication();
				});
			};

			if (matchingBranch) {
				const cleanBranch = matchingBranch.replace(/^remotes\/origin\//, '');
				log(`\x1b[32m  ✓ Found branch: ${cleanBranch}\x1b[0m\r\n`);
				log(`\x1b[32m  → Checking out: ${cleanBranch}...\x1b[0m\r\n`);
				pushStatus(`Step 3/5: Found branch **${cleanBranch}**. Checking out...`);

				const gitCheckout = exec(`git checkout ${cleanBranch}`, { cwd: rootPath });
				gitCheckout.stdout?.on('data', (d) => log(d.toString()));
				gitCheckout.stderr?.on('data', (d) => log(d.toString()));

				gitCheckout.on('exit', (code) => {
					if (workflowClosed) return;
					if (code === 0) {
						log(`\x1b[32m  ✓ Checked out ${cleanBranch}\x1b[0m\r\n`);
						pushStatus(`Step 3/5 complete: Checked out branch **${cleanBranch}**.`);
						vscode.commands.executeCommand('git.refresh');
					} else {
						log(`\x1b[33m  ⚠ Checkout had issues, continuing on current branch...\x1b[0m\r\n`);
						pushStatus('Step 3/5 warning: Checkout had issues. Continuing on current branch.');
					}
					checkDependenciesAndContinue();
				});
			} else {
				log(`\x1b[33m  ⚠ No branch selected — continuing on current branch\x1b[0m\r\n`);
				pushStatus(`Step 3/5 warning: No branch selected. Continuing on current branch.`);
				checkDependenciesAndContinue();
			}
		},
		close: () => {
			cleanupProcesses('Workflow stopped: Terminal was closed.');
		}
	};

	this.provider.addMessage('ai', `🔬 **QA Research: ${ticketId}**\n\n- Workflow initialized\n- Status updates will appear here as a running list`, [], statusMessageId, false);

	const terminal = vscode.window.createTerminal({ name: `TraneAI QA: ${ticketId}`, pty });
	terminal.show();
}

// Add this import at the top of the file

	public async explainCommits(ticketId: string, rootPath: string) {
		const commitMsgId = `qa-commits-${ticketId}-${Date.now()}`;
		this.provider.addMessage('ai', `📝 **Changes for ${ticketId}**\n\n- Analyzing commits...`, [], commitMsgId, true);

		try {
			// Find commits matching the ticketId in the message
			const gitLog = execSync(`git log --grep="${ticketId}" -n 5 --pretty=format:"%h %s"`, { cwd: rootPath, encoding: 'utf8' });
			
			if (!gitLog.trim()) {
				// If no commits match the grep, try to get the latest 5 commits on the current branch
				const currentBranchCommits = execSync(`git log -n 5 --pretty=format:"%h %s"`, { cwd: rootPath, encoding: 'utf8' });
				
				if (!currentBranchCommits.trim()) {
					this.provider.updateMessageText(commitMsgId, `📝 **Changes for ${ticketId}**\n\n- No recent commits found.`, false);
					return;
				}

				this.provider.addMessage('ai', `📝 **Recent Commits on Branch**\n\n${currentBranchCommits.split('\n').map(c => `- ${c}`).join('\n')}`, [], commitMsgId, false);
				
				// Get diff for these commits to explain
				const diff = execSync(`git show -n 5 --stat`, { cwd: rootPath, encoding: 'utf8' });
				await this.generateCommitExplanation(commitMsgId, ticketId, currentBranchCommits, diff);
			} else {
				this.provider.updateMessageText(commitMsgId, `📝 **Commits for ${ticketId}**\n\n${gitLog.split('\n').map(c => `- ${c}`).join('\n')}`, false);
				
				// Get diff for these specific commits
				const commitHashes = gitLog.split('\n').map(line => line.split(' ')[0]);
				let combinedDiff = '';
				for (const hash of commitHashes) {
					combinedDiff += `\n--- Commit ${hash} ---\n`;
					combinedDiff += execSync(`git show ${hash} --stat`, { cwd: rootPath, encoding: 'utf8' });
				}
				
				await this.generateCommitExplanation(commitMsgId, ticketId, gitLog, combinedDiff);
			}
		} catch (err: any) {
			this.provider.updateMessageText(commitMsgId, `📝 **Changes for ${ticketId}**\n\n- ❌ Could not analyze commits: ${err.message}`, false);
		}
	}

	public async generateCommitExplanation(msgId: string, ticketId: string, commitList: string, diffContent: string) {
		try {
			const prompt = `You are a technical lead explaining code changes to a QA engineer.
The following commits and changes were found for ticket ${ticketId}:

COMMITS:
${commitList}

CHANGES (Summary):
${diffContent.substring(0, 5000)} ${diffContent.length > 5000 ? '... (truncated)' : ''}

Please provide a clear, non-technical explanation of what has changed in the application.
Focus on:
1. What was the goal of these changes?
2. What specific features or UI elements were updated?
3. What should the QA person look out for when testing?

Format the response in a way that is easy to read for someone who might not be a developer. Use bullet points and bold text for emphasis.`;

			const formData = new FormData();
			formData.append('message', prompt);

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error('Failed to generate explanation');
			}

			const data = await response.json();
			const explanation = data.message || 'Could not generate explanation.';
			
			const currentText = this.provider.getMessageText(msgId);
			this.provider.updateMessageText(msgId, `${currentText}\n\n**Summary of Changes:**\n${explanation}`, false);
		} catch (err: any) {
			const currentText = this.provider.getMessageText(msgId);
			this.provider.updateMessageText(msgId, `${currentText}\n\n- ⚠️ Could not generate summary: ${err.message}`, false);
		}
	}

	public async explainTicketRequirements(ticketId: string, ticketContext?: { title?: string; description?: string; requirements?: string[] }, appUrl?: string) {
		const reqMsgId = `qa-req-${ticketId}-${Date.now()}`;
		this.provider.addMessage('ai', `🧪 **Testing Guide: ${ticketId}**\n\n- Analyzing ticket requirements...`, [], reqMsgId, true);

		try {
			const contextParts: string[] = [];
			if (ticketContext?.title) {
				contextParts.push(`Title: ${ticketContext.title}`);
			}
			if (ticketContext?.description) {
				contextParts.push(`Description: ${ticketContext.description}`);
			}
			if (ticketContext?.requirements && ticketContext.requirements.length > 0) {
				contextParts.push(`Requirements:\n${ticketContext.requirements.map(r => `- ${r}`).join('\n')}`);
			}

			const contextSection = contextParts.length > 0
				? contextParts.join('\n\n')
				: `Ticket ID: ${ticketId}`;

			const prompt = `You are a QA engineer analyzing a bug/feature ticket.

${contextSection}

${appUrl ? `The application is running at: ${appUrl}` : ''}

Based on the above ticket information, provide a concise QA testing guide that includes:
1. **Ticket Summary** – Briefly describe what the issue or feature is about.
2. **What to Test** – A clear list of test scenarios (happy path and edge cases).
3. **Steps to Reproduce** (for bugs) or **Acceptance Criteria** (for features).
4. **Areas to Verify** – Which parts of the app to check.

Be specific and actionable. Format your response clearly using markdown.`;

			const formData = new FormData();
			formData.append('message', prompt);

			const response = await fetch('http://localhost:5000/api/chat/message', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error('Failed to generate testing guide');
			}

			const data = await response.json();
			const guide = data.message || 'Could not generate testing guide.';
			this.provider.updateMessageText(reqMsgId, `🧪 **Testing Guide: ${ticketId}**\n\n${guide}`, false);
		} catch (err: any) {
			this.provider.updateMessageText(reqMsgId, `🧪 **Testing Guide: ${ticketId}**\n\n- ❌ Could not generate testing guide: ${err.message}`, false);
		}
	}

	public runComprehensiveReview() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace folder open.');
		return;
	}

	const rootPath = this.provider.findWorkspaceAppRoot() || workspaceFolders[0].uri.fsPath;
	const writeEmitter = new vscode.EventEmitter<string>();
	const reviewProcesses = new Set<ChildProcess>();
	let reviewClosed = false;
	let detectedUrl: string | null = null;
	let fallbackTimeout: NodeJS.Timeout | undefined;

	const openUrlInBrowser = (url: string) => {
	if (!url || reviewClosed) return;
	
	if (fallbackTimeout) {
		clearTimeout(fallbackTimeout);
		fallbackTimeout = undefined;
	}
	
	writeEmitter.fire(`\r\n\x1b[32m  ✓ Opening URL in VS Code browser: ${url}\x1b[0m\r\n`);
	
	// Use VS Code's preview HTML to force open in VS Code only
	const openInVSCodeBrowser = () => {
		// Method 1: Use simple browser API
		Promise.resolve(vscode.commands.executeCommand('simpleBrowser.api.open', url)).catch(() => {
			// Method 2: Fallback to opening in VS Code's built-in preview
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
		});
	};
	
	// Small delay to ensure terminal output is visible
	setTimeout(openInVSCodeBrowser, 500);
};

	const killReviewProcesses = () => {
		if (reviewClosed) return;
		reviewClosed = true;
		for (const proc of reviewProcesses) {
			const pid = proc.pid;
			if (!pid) continue;
			if (process.platform === 'win32') {
				exec(`taskkill /PID ${pid} /T /F`);
			} else {
				try { proc.kill('SIGTERM'); } catch {}
			}
		}
		reviewProcesses.clear();
	};

	const pty: vscode.Pseudoterminal = {
		onDidWrite: writeEmitter.event,
		handleInput: (data: string) => {
			if (data === '\x03') {
				writeEmitter.fire('\r\n\x1b[31m^C\x1b[0m\r\n');
				killReviewProcesses();
			}
		},
		open: () => {
			writeEmitter.fire('\x1b[34m--- TraneAI Comprehensive Review ---\x1b[0m\r\n');
			writeEmitter.fire('\x1b[33mStep 1: Installing dependencies (npm i)...\x1b[0m\r\n');
			
			const installProcess = exec('npm i', { cwd: rootPath });
			reviewProcesses.add(installProcess);
			installProcess.on('exit', () => reviewProcesses.delete(installProcess));
			
			installProcess.stdout?.on('data', (data) => {
				writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
			});
			
			installProcess.stderr?.on('data', (data) => {
				writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
			});
			
			installProcess.on('exit', (code) => {
				if (reviewClosed) return;
				if (code !== 0) {
					writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm install failed with code ${code}\x1b[0m\r\n`);
					return;
				}
				
				writeEmitter.fire('\r\n\x1b[33mStep 2: Starting application (npm start)...\x1b[0m\r\n');
				
				const startProcess = exec('npm start', { cwd: rootPath });
				reviewProcesses.add(startProcess);
				startProcess.on('exit', () => reviewProcesses.delete(startProcess));
				let hasOpenedUrl = false;
				let outputBuffer = '';
				
				const detectAndOpenUrl = (output: string) => {
					if (hasOpenedUrl || reviewClosed) return;
					
					outputBuffer += output;
					const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
					
					// Detect local URLs
					const urlMatch = clean.match(
						/(?:https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+)(:\d+)(\/[^\s]*)?/i
					);
					
					if (urlMatch && !detectedUrl) {
						let url = urlMatch[0].replace(/[.,!?;:]+$/, '');
						if (!/^https?:\/\//i.test(url)) {
							url = `http://${url}`;
						}
						
						// Convert 0.0.0.0 to localhost for better compatibility
						if (url.includes('0.0.0.0')) {
							const portMatch = url.match(/:(\d+)/);
							if (portMatch) {
								url = `http://localhost:${portMatch[1]}`;
							}
						}
						
						detectedUrl = url;
						
						// Set fallback timeout
						if (!fallbackTimeout) {
							fallbackTimeout = setTimeout(() => {
								if (detectedUrl && !hasOpenedUrl && !reviewClosed) {
									hasOpenedUrl = true;
									openUrlInBrowser(detectedUrl);
								}
							}, 5000);
						}
						
						// Check if app is ready
						const isReady = clean.toLowerCase().includes('compiled successfully') || 
									   clean.toLowerCase().includes('ready in') ||
									   clean.toLowerCase().includes('started successfully') ||
									   clean.toLowerCase().includes('listening on') ||
									   clean.toLowerCase().includes('webpack compiled');
						
						if (isReady && detectedUrl && !hasOpenedUrl) {
							hasOpenedUrl = true;
							openUrlInBrowser(detectedUrl);
						}
					}
				};
				
				startProcess.stdout?.on('data', (data) => {
					if (reviewClosed) return;
					const output = data.toString();
					writeEmitter.fire(output.replace(/\n/g, '\r\n'));
					detectAndOpenUrl(output);
				});
				
				startProcess.stderr?.on('data', (data) => {
					if (reviewClosed) return;
					const output = data.toString();
					writeEmitter.fire(output.replace(/\n/g, '\r\n'));
					detectAndOpenUrl(output);
				});
				
				startProcess.on('error', (err) => {
					writeEmitter.fire(`\r\n\x1b[31m[ERROR] npm start failed: ${err.message}\x1b[0m\r\n`);
				});
			});
		},
		close: () => {
			killReviewProcesses();
		}
	};

	const terminal = vscode.window.createTerminal({ name: 'TraneAI Review', pty });
	terminal.show();
}
}
