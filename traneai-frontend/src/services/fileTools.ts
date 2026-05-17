import * as vscode from 'vscode';
import * as fileOps from './fileOperations';

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
}

export interface ToolParameter {
	name: string;
	type: string;
	description: string;
	required: boolean;
}

export interface ToolResult {
	success: boolean;
	message: string;
	data?: any;
}

export const FILE_TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: 'read_file',
		description: 'Read the contents of a file from the workspace. Returns the file content with language detection.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Relative or absolute path to the file',
				required: true
			}
		]
	},
	{
		name: 'read_multiple_files',
		description: 'Read multiple files at once for comparison or analysis.',
		parameters: [
			{
				name: 'paths',
				type: 'array',
				description: 'Array of file paths to read',
				required: true
			}
		]
	},
	{
		name: 'create_file',
		description: 'Create a new file with the specified content.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path where to create the file (relative to workspace or absolute)',
				required: true
			},
			{
				name: 'content',
				type: 'string',
				description: 'Initial content for the file',
				required: true
			}
		]
	},
	{
		name: 'edit_file',
		description: 'Edit a file by replacing specific text with new content.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file to edit',
				required: true
			},
			{
				name: 'old_text',
				type: 'string',
				description: 'The text to replace (will match first occurrence)',
				required: true
			},
			{
				name: 'new_text',
				type: 'string',
				description: 'The new text to insert',
				required: true
			},
			{
				name: 'exact_match',
				type: 'boolean',
				description: 'Whether to match exact text (true) or fuzzy match (false)',
				required: false
			}
		]
	},
	{
		name: 'apply_patch',
		description: 'Apply a patch to multiple files using the patch format (similar to Copilot). Supports Add, Update, and Delete operations.',
		parameters: [
			{
				name: 'patch',
				type: 'string',
				description: 'Patch content in the format: *** Begin Patch *** Add File: <path> +<content> *** Update File: <path> @@ <context> -<old> +<new> *** Delete File: <path> *** End Patch',
				required: true
			}
		]
	},
	{
		name: 'delete_file',
		description: 'Delete a file from the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file to delete',
				required: true
			}
		]
	},
	{
		name: 'list_files',
		description: 'List files in a directory (supports up to 2 levels deep).',
		parameters: [
			{
				name: 'directory',
				type: 'string',
				description: 'Directory to list (relative to workspace root or "." for root)',
				required: false
			},
			{
				name: 'max_depth',
				type: 'number',
				description: 'Maximum depth to traverse (default: 2)',
				required: false
			}
		]
	},
	{
		name: 'search_files',
		description: 'Search for text patterns in files.',
		parameters: [
			{
				name: 'pattern',
				type: 'string',
				description: 'Regular expression pattern to search for',
				required: true
			},
			{
				name: 'file_pattern',
				type: 'string',
				description: 'Glob pattern for files to search (e.g., "**/*.ts")',
				required: false
			}
		]
	},
	{
		name: 'get_file_info',
		description: 'Get information about a file including symbols, imports, and structure.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file',
				required: true
			}
		]
	}
];

export async function executeTool(
	toolName: string,
	params: Record<string, any>
): Promise<ToolResult> {
	try {
		switch (toolName) {
			case 'read_file': {
				const result = await fileOps.readFileByPath(params.path);
				if (result.success) {
					return {
						success: true,
						message: `File: ${params.path}\nLanguage: ${result.language}\nLines: ${result.lineCount}\n\n\`\`\`${result.language}\n${result.content}\n\`\`\``,
						data: result
					};
				}
				return { success: false, message: `Error: ${result.error}` };
			}
			
			case 'read_multiple_files': {
				const paths = params.paths as string[];
				const results: Record<string, any> = {};
				
				for (const p of paths) {
					const result = await fileOps.readFileByPath(p);
					results[p] = result;
				}
				
				return {
					success: true,
					message: `Read ${paths.length} files`,
					data: results
				};
			}
			
			case 'create_file': {
				const proposal = await fileOps.writeFileByPath(params.path, params.content);
				return {
					success: true,
					message: proposal
				};
			}
			
			case 'edit_file': {
				const proposal = await fileOps.editFileByPath(
					params.path,
					params.old_text,
					params.new_text,
					{ exact: params.exact_match }
				);
				return {
					success: true,
					message: proposal
				};
			}
			
			case 'apply_patch': {
				const result = await fileOps.createFileFromPatch(params.patch);
				const successCount = result.results.filter(r => r.success).length;
				const failCount = result.results.length - successCount;
				
				const message = result.results
					.map(r => `${r.success ? '✅' : '❌'} ${r.file}${r.error ? ` - ${r.error}` : ''}`)
					.join('\n');
				
				return {
					success: failCount === 0,
					message: `Applied ${result.results.length} file operations: ${successCount} succeeded, ${failCount} failed\n\n${message}`,
					data: result
				};
			}
			
			case 'delete_file': {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					return { success: false, message: 'No workspace open' };
				}
				
				let uri: vscode.Uri;
				if (params.path.startsWith('/') || params.path.match(/^[A-Za-z]:/)) {
					uri = vscode.Uri.file(params.path);
				} else {
					uri = vscode.Uri.joinPath(workspaceFolders[0].uri, params.path);
				}
				
				const result = await fileOps.deleteFile(uri);
				if (result.success) {
					return {
						success: true,
						message: `✅ File deleted: ${params.path}`
					};
				}
				return { success: false, message: `Error: ${result.error}` };
			}
			
			case 'list_files': {
				const result = await fileOps.listFiles(params.directory || '.', params.max_depth || 2);
				if (result.success && result.files) {
					const formatted = result.files
						.map(f => `${f.isDirectory ? '📁' : '📄'} ${f.name}${f.isDirectory ? '/' : ''}`)
						.join('\n');
					return {
						success: true,
						message: `Files:\n${formatted}`,
						data: result.files
					};
				}
				return { success: false, message: `Error: ${result.error}` };
			}
			
			case 'search_files': {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					return { success: false, message: 'No workspace open' };
				}
				
				const pattern = new RegExp(params.pattern, 'gi');
				const filePattern = params.file_pattern || '**/*';
				
				const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**');
				const matches: Array<{ file: string; matches: string[] }> = [];
				
				for (const file of files.slice(0, 50)) {
					try {
						const result = await fileOps.readFile(file);
						if (result.success && result.content) {
							const fileMatches: string[] = [];
							let match;
							while ((match = pattern.exec(result.content)) !== null) {
								const start = Math.max(0, match.index - 30);
								const end = Math.min(result.content.length, match.index + 50);
								const lineNum = result.content.substring(0, match.index).split('\n').length;
								fileMatches.push(`Line ${lineNum}: ...${result.content.substring(start, end)}...`);
							}
							if (fileMatches.length > 0) {
								matches.push({ file: file.fsPath, matches: fileMatches.slice(0, 5) });
							}
						}
					} catch {}
				}
				
				const message = matches
					.map(m => `**${m.file}**\n${m.matches.join('\n')}`)
					.join('\n\n');
				
				return {
					success: true,
					message: message || 'No matches found',
					data: matches
				};
			}
			
			case 'get_file_info': {
				const result = await fileOps.readFileByPath(params.path);
				if (!result.success) {
					return { success: false, message: `Error: ${result.error}` };
				}
				
				const symbols = await getDocumentSymbols(params.path);
				
				return {
					success: true,
					message: `**File:** ${params.path}\n**Language:** ${result.language}\n**Lines:** ${result.lineCount}\n\n**Symbols:**\n${symbols}`,
					data: { result, symbols }
				};
			}
			
			default:
				return { success: false, message: `Unknown tool: ${toolName}` };
		}
	} catch (error: any) {
		return { success: false, message: `Tool execution error: ${error.message}` };
	}
}

async function getDocumentSymbols(filePath: string): Promise<string> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return 'No workspace';
		}
		
		let uri: vscode.Uri;
		if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
			uri = vscode.Uri.file(filePath);
		} else {
			uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
		}
		
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			uri
		);
		
		if (!symbols || symbols.length === 0) {
			return 'No symbols found';
		}
		
		const formatSymbol = (s: vscode.DocumentSymbol, indent: number = 0): string => {
			const prefix = '  '.repeat(indent);
			const kind = vscode.SymbolKind[s.kind];
			return `${prefix}${kind} ${s.name}`;
		};
		
		return symbols.map(s => formatSymbol(s)).join('\n');
	} catch (error) {
		return `Error getting symbols: ${error}`;
	}
}

export function getToolsForAI(): string {
	return FILE_TOOL_DEFINITIONS
		.map(t => `- **${t.name}**: ${t.description}`)
		.join('\n');
}