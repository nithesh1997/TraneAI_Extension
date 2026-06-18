import * as vscode from 'vscode';

export interface FileReadResult {
	success: boolean;
	content?: string;
	language?: string;
	lineCount?: number;
	error?: string;
}

export interface FileWriteResult {
	success: boolean;
	path?: string;
	error?: string;
}

export interface FileEditResult {
	success: boolean;
	edits?: vscode.TextEdit[];
	uri?: vscode.Uri;
	error?: string;
}

export interface FileInfo {
	path: string;
	name: string;
	language: string;
	size: number;
	isDirectory: boolean;
}

export async function readFile(uri: vscode.Uri): Promise<FileReadResult> {
	try {
		const doc = await vscode.workspace.openTextDocument(uri);
		const content = doc.getText();
		const language = doc.languageId;
		const lineCount = doc.lineCount;
		
		return {
			success: true,
			content,
			language,
			lineCount
		};
	} catch (error: any) {
		return {
			success: false,
			error: error.message || 'Failed to read file'
		};
	}
}

export async function readFileByPath(filePath: string): Promise<FileReadResult> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		let uri: vscode.Uri;
		
		if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
			uri = vscode.Uri.file(filePath);
		} else if (workspaceFolders && workspaceFolders.length > 0) {
			uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
		} else {
			return { success: false, error: 'No workspace open' };
		}
		
		return readFile(uri);
	} catch (error: any) {
		return { success: false, error: error.message || 'Failed to read file' };
	}
}

export async function writeFile(uri: vscode.Uri, content: string): Promise<string> {
	// Return as a proposal instead of writing directly using VS Code API
	let oldContent = '(NEW FILE)';
	try {
		const doc = await vscode.workspace.openTextDocument(uri);
		oldContent = doc.getText();
	} catch (e) {
		// New file
	}
	return `[EDIT_PROPOSAL]\nfile: ${uri.fsPath}\nold: |\n${oldContent}\nnew: |\n${content}\nstatus: ready\nmessage: Proposal to overwrite file contents\n[END_EDIT]`;
}

export async function writeFileByPath(filePath: string, content: string): Promise<string> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		let uri: vscode.Uri;
		
		if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
			uri = vscode.Uri.file(filePath);
		} else if (workspaceFolders && workspaceFolders.length > 0) {
			uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
		} else {
			return 'Error: No workspace open';
		}
		
		return writeFile(uri, content);
	} catch (error: any) {
		return `Error: ${error.message || 'Failed to write file'}`;
	}
}

export async function editFile(
	uri: vscode.Uri,
	oldText: string,
	newText: string
): Promise<string> {
	// Return as a proposal instead of applying WorkspaceEdit directly
	return `[EDIT_PROPOSAL]\nfile: ${uri.fsPath}\nold: |\n${oldText}\nnew: |\n${newText}\nstatus: ready\nmessage: Targeted edit proposal\n[END_EDIT]`;
}

function fuzzyFindMatch(haystack: string, needle: string): { index: number, text: string } | null {
	const exactIdx = haystack.indexOf(needle);
	if (exactIdx !== -1) return { index: exactIdx, text: needle };

	const nNeedle = needle.replace(/["']/g, "'");
	const nHaystack = haystack.replace(/["']/g, "'");
	const qIdx = nHaystack.indexOf(nNeedle);
	if (qIdx !== -1) return { index: qIdx, text: haystack.substring(qIdx, qIdx + needle.length) };

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

			return {
				index: startIndex,
				text: haystack.substring(startIndex, endIndex + 1)
			};
		}
	}

	return null;
}

export async function editFileByPath(
	filePath: string,
	oldText: string,
	newText: string,
	options?: { exact?: boolean }
): Promise<string> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		let uri: vscode.Uri;
		
		if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
			uri = vscode.Uri.file(filePath);
		} else if (workspaceFolders && workspaceFolders.length > 0) {
			uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
		} else {
			return 'Error: No workspace open';
		}
		
		const doc = await vscode.workspace.openTextDocument(uri);
		const fullText = doc.getText();
		
		// Use whitespace-agnostic fuzzy matching
		const match = fuzzyFindMatch(fullText, oldText);
		if (!match) {
			return 'Error: Text not found in file. Try reading the file first to get the exact content.';
		}
		
		// Extract the actual matched text (preserves original whitespace)
		const actualOldText = match.text;
		
		return editFile(uri, actualOldText, newText);
	} catch (error: any) {
		return `Error: ${error.message || 'Failed to edit file'}`;
	}
}

export async function deleteFile(uri: vscode.Uri): Promise<{ success: boolean; error?: string }> {
	try {
		await vscode.workspace.fs.delete(uri);
		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'Failed to delete file' };
	}
}

export async function listFiles(dirPath: string, maxDepth: number = 2): Promise<{ success: boolean; files?: FileInfo[]; error?: string }> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return { success: false, error: 'No workspace open' };
		}
		
		let baseUri: vscode.Uri;
		if (dirPath === '.' || !dirPath) {
			baseUri = workspaceFolders[0].uri;
		} else if (dirPath.startsWith('/') || dirPath.match(/^[A-Za-z]:/)) {
			baseUri = vscode.Uri.file(dirPath);
		} else {
			baseUri = vscode.Uri.joinPath(workspaceFolders[0].uri, dirPath);
		}
		
		const files: FileInfo[] = [];
		
		await listFilesRecursive(baseUri, files, 0, maxDepth);
		
		return { success: true, files };
	} catch (error: any) {
		return { success: false, error: error.message || 'Failed to list files' };
	}
}

async function listFilesRecursive(
	dirUri: vscode.Uri,
	files: FileInfo[],
	currentDepth: number,
	maxDepth: number
): Promise<void> {
	if (currentDepth > maxDepth) return;
	
	try {
		const entries = await vscode.workspace.fs.readDirectory(dirUri);
		
		for (const [name, type] of entries) {
			if (name === 'node_modules' || name === '.git' || name.startsWith('.')) {
				continue;
			}
			
			const uri = vscode.Uri.joinPath(dirUri, name);
			const isDir = type === vscode.FileType.Directory;
			
			files.push({
				path: uri.fsPath,
				name,
				language: isDir ? '' : getLanguageFromExtension(name),
				size: 0,
				isDirectory: isDir
			});
			
			if (isDir && currentDepth < maxDepth) {
				await listFilesRecursive(uri, files, currentDepth + 1, maxDepth);
			}
		}
	} catch (error) {
		console.error('Error reading directory:', error);
	}
}

function getLanguageFromExtension(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase() || '';
	const languageMap: Record<string, string> = {
		'ts': 'typescript',
		'tsx': 'typescriptreact',
		'js': 'javascript',
		'jsx': 'javascriptreact',
		'py': 'python',
		'java': 'java',
		'cs': 'csharp',
		'cpp': 'cpp',
		'c': 'c',
		'go': 'go',
		'rs': 'rust',
		'swift': 'swift',
		'kt': 'kotlin',
		'scala': 'scala',
		'rb': 'ruby',
		'php': 'php',
		'html': 'html',
		'css': 'css',
		'scss': 'scss',
		'json': 'json',
		'xml': 'xml',
		'yaml': 'yaml',
		'yml': 'yaml',
		'md': 'markdown',
		'sql': 'sql',
		'sh': 'shell',
		'bash': 'shell'
	};
	
	return languageMap[ext] || 'plaintext';
}

export async function createFileFromPatch(patchContent: string): Promise<{ success: boolean; results: Array<{ file: string; success: boolean; error?: string }> }> {
	const results: Array<{ file: string; success: boolean; error?: string }> = [];
	
	const fileOperationRegex = /^\*\*\* (Add File|Update File|Delete File): (.+)$/gm;
	let match;
	let operations: Array<{ type: string; path: string; hunks: string[] }> = [];
	
	const lines = patchContent.split('\n');
	let currentOperation: { type: string; path: string; hunks: string[] } | null = null;
	let currentHunk: string[] = [];
	
	for (const line of lines) {
		if (line.startsWith('*** Add File:') || line.startsWith('*** Update File:') || line.startsWith('*** Delete File:')) {
			if (currentOperation) {
				currentOperation.hunks = currentHunk;
				operations.push(currentOperation);
			}
			
			const type = line.match(/\*\*\* (Add File|Update File|Delete File):/)?.[1] || '';
			const path = line.split(':').slice(1).join(':').trim();
			
			currentOperation = { type, path, hunks: [] };
			currentHunk = [];
		} else if (currentOperation && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line.startsWith('@@'))) {
			currentHunk.push(line);
		}
	}
	
	if (currentOperation) {
		currentOperation.hunks = currentHunk;
		operations.push(currentOperation);
	}
	
	for (const op of operations) {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				results.push({ file: op.path, success: false, error: 'No workspace open' });
				continue;
			}
			
			let uri: vscode.Uri;
			if (op.path.startsWith('/') || op.path.match(/^[A-Za-z]:/)) {
				uri = vscode.Uri.file(op.path);
			} else {
				uri = vscode.Uri.joinPath(workspaceFolders[0].uri, op.path);
			}
			
			switch (op.type) {
				case 'Add File': {
					const content = op.hunks.filter(l => l.startsWith('+')).map(l => l.substring(1)).join('\n');
					const proposal = await writeFile(uri, content);
					results.push({ file: op.path, success: proposal.includes('[EDIT_PROPOSAL]') });
					break;
				}
				case 'Update File': {
					const doc = await vscode.workspace.openTextDocument(uri);
					let content = doc.getText();
					
					let inHunk = false;
					let oldLines: string[] = [];
					let newLines: string[] = [];
					
					for (const hunkLine of op.hunks) {
						if (hunkLine.startsWith('@@')) {
							inHunk = true;
							oldLines = [];
							newLines = [];
						} else if (inHunk) {
							if (hunkLine.startsWith('-') && !hunkLine.startsWith('--')) {
								oldLines.push(hunkLine.substring(1));
							} else if (hunkLine.startsWith('+')) {
								newLines.push(hunkLine.substring(1));
							} else if (hunkLine.startsWith(' ') || hunkLine.startsWith('***')) {
								oldLines.push(hunkLine.substring(1));
								newLines.push(hunkLine.substring(1));
							}
						}
					}
					
					const oldText = oldLines.join('\n');
					const newText = newLines.join('\n');
					
					if (content.includes(oldText)) {
						const proposal = await editFile(uri, oldText, newText);
						results.push({ file: op.path, success: proposal.includes('[EDIT_PROPOSAL]') });
					} else {
						results.push({ file: op.path, success: false, error: 'Could not find target text' });
					}
					break;
				}
				case 'Delete File': {
					const deleteResult = await deleteFile(uri);
					results.push({ file: op.path, success: deleteResult.success, error: deleteResult.error });
					break;
				}
			}
		} catch (error: any) {
			results.push({ file: op.path, success: false, error: error.message });
		}
	}
	
	return { success: true, results };
}