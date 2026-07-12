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

public async runQAResearchWorkflow(ticketId: string, ticketContext?: { title?: string; description?: string; requirements?: string[] }) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace folder open.');
		return;
	}

	const rootPath = this.provider.findWorkspaceAppRoot() || workspaceFolders[0].uri.fsPath;
	const writeEmitter = new vscode.EventEmitter<string>();
	
	const statusMessageId = `qa-status-${ticketId}-${Date.now()}`;
	let uiSteps: string[] = [];
	const pushStatus = (text: string) => {
		uiSteps.push(text);
		this.provider.updateMessageText(statusMessageId, `🔬 **QA Research: ${ticketId}**\n\n${uiSteps.map(s => '- ' + s).join('\n')}`, false);
	};

	let workflowClosed = false;
	let sessionId: string | null = null;
	let streamController: AbortController | null = null;

	let hasOpenedUrl = false;
	let detectedUrl: string | null = null;
	let fallbackTimeout: NodeJS.Timeout | undefined;
	let outputBuffer = '';

	const openUrlInBrowser = (url: string) => {
		if (!url || workflowClosed) return;
		
		if (fallbackTimeout) {
			clearTimeout(fallbackTimeout);
			fallbackTimeout = undefined;
		}
		
		writeEmitter.fire(`\r\n\x1b[32m  ✓ Opening URL in VS Code browser: ${url}\x1b[0m\r\n`);
		pushStatus(`App detected at ${url}. Opening in VS Code browser now.`);
		
		const openInVSCodeBrowser = () => {
			this.provider.activeBrowserUrl = url; // Show snapshot button
			Promise.resolve(vscode.commands.executeCommand('simpleBrowser.api.open', url)).catch(() => {
				vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
			});
		};
		
		setTimeout(openInVSCodeBrowser, 500);
	};

	const detectAndOpenUrl = (output: string) => {
		if (hasOpenedUrl || workflowClosed) return;
		
		outputBuffer += output;
		const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
		
		const urlMatch = clean.match(
			/(?:https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)(\/[^\s]*)?/i
		);
		
		if (urlMatch && !detectedUrl) {
			let url = urlMatch[0].replace(/[.,!?;:]+$/, '');
			if (!/^https?:\/\//i.test(url)) {
				url = `http://${url}`;
			}
			
			if (url.includes('0.0.0.0')) {
				const portMatch = url.match(/:(\d+)/);
				if (portMatch) {
					url = `http://localhost:${portMatch[1]}`;
				}
			}
			
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
						   clean.toLowerCase().includes('webpack compiled');
			
			if (isReady && detectedUrl && !hasOpenedUrl) {
				hasOpenedUrl = true;
				openUrlInBrowser(detectedUrl);
			}
		}
	};

	const cleanupProcesses = async (reason: string) => {
		if (workflowClosed) return;
		workflowClosed = true;
		pushStatus(reason);
		
		if (streamController) {
			streamController.abort();
		}

		if (sessionId) {
			try {
				await fetch('http://localhost:5000/api/qa/stop-workflow', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ sessionId })
				});
			} catch (e) {}
		}
	};

	const pty: vscode.Pseudoterminal = {
		onDidWrite: writeEmitter.event,
		handleInput: (data: string) => {
			if (data === '\x03') { // Ctrl+C
				writeEmitter.fire(`\r\n\x1b[31m^C\x1b[0m\r\n`);
				cleanupProcesses('Workflow stopped by user (Ctrl+C).');
			}
		},
		open: async () => {
			writeEmitter.fire(`\x1b[34m╔══════════════════════════════════════════╗\x1b[0m\r\n`);
			writeEmitter.fire(`\x1b[34m║  TraneAI QA Research (RAG-Backed)        ║\x1b[0m\r\n`);
			writeEmitter.fire(`\x1b[34m╚══════════════════════════════════════════╝\x1b[0m\r\n\r\n`);
			writeEmitter.fire(`\x1b[33m⚠️  Press Ctrl+C to stop the workflow ⚠️\x1b[0m\r\n\r\n`);

			try {
				const response = await fetch('http://localhost:5000/api/qa/start-workflow', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						workspaceId: 'default', // Using default or actual if available
						rootPath,
						ticketId
					})
				});

				if (!response.ok) {
					throw new Error('Failed to start workflow on backend');
				}

				const data = await response.json();
				sessionId = data.sessionId;

				streamController = new AbortController();
				
				// Read SSE stream
				const streamRes = await fetch(`http://localhost:5000/api/qa/stream/${sessionId}`, {
					signal: streamController.signal
				});
				
				if (!streamRes.body) return;
				
				const reader = streamRes.body.getReader();
				const decoder = new TextDecoder('utf-8');

				const processStream = async () => {
				    try {
				        while (!workflowClosed) {
				            const { done, value } = await reader.read();
				            if (done) break;

				            const str = decoder.decode(value, { stream: true });
				            const lines = str.split('\n');
				            for (const line of lines) {
				                if (line.startsWith('data: ')) {
				                    try {
				                        const parsed = JSON.parse(line.replace('data: ', '').trim());
				                        if (parsed.message) {
				                            writeEmitter.fire(parsed.message.replace(/\n/g, '\r\n'));
				                            // Check if it's a step to update UI message
				                            if (parsed.message.includes('Step ')) {
				                                pushStatus(parsed.message.trim());
				                            }
				                            detectAndOpenUrl(parsed.message);
				                        }
				                    } catch (e) {}
				                }
				            }
				        }
				    } catch (err) {
				        // Handle or ignore stream read errors
				    }
				};

				processStream();

			} catch (err: any) {
				if (err.name !== 'AbortError') {
					writeEmitter.fire(`\r\n\x1b[31m✗ Could not start backend workflow: ${err.message}\x1b[0m\r\n`);
				}
			}
		},
		close: () => {
			cleanupProcesses('Workflow stopped: Terminal was closed.');
		}
	};

	this.provider.addMessage('ai', `🔬 **QA Research: ${ticketId}**\n\n- Workflow initialized...`, [], statusMessageId, false);
	const terminal = vscode.window.createTerminal({ name: `TraneAI QA: ${ticketId}`, pty });
	terminal.show();

	// Trigger related QA tasks
	this.explainCommits(ticketId, rootPath);
	// We call this right away, and can optionally re-run if URL is detected later, but old flow likely ran it here
	this.explainTicketRequirements(ticketId, ticketContext);
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
						/(?:https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)(\/[^\s]*)?/i
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
