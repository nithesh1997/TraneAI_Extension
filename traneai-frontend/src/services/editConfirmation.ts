import * as vscode from 'vscode';

export interface PendingEdit {
	id: string;
	filePath: string;
	oldContent: string;
	newContent: string;
	timestamp: number;
	applied: boolean;
}

export interface DiffPreview {
	oldLines: string[];
	newLines: string[];
	addedCount: number;
	removedCount: number;
	unchangedCount: number;
	removedLines: string[];
	addedLines: string[];
}

export interface ConfirmationResult {
	confirmed: boolean;
	applyAll: boolean;
}

const pendingEdits: Map<string, PendingEdit> = new Map();

export function generateDiff(oldText: string, newText: string): DiffPreview {
	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');
	
	const diff = computeDiff(oldLines, newLines);
	
	return {
		oldLines: diff.removed,
		newLines: diff.added,
		addedCount: diff.added.length,
		removedCount: diff.removed.length,
		unchangedCount: diff.unchanged.length,
		removedLines: diff.removed,
		addedLines: diff.added
	};
}

interface DiffResult {
	removed: string[];
	added: string[];
	unchanged: string[];
}

function computeDiff(oldLines: string[], newLines: string[]): DiffResult {
	const result: DiffResult = { removed: [], added: [], unchanged: [] };
	
	const lcs = longestCommonSubsequence(oldLines, newLines);
	
	let oldIdx = 0;
	let newIdx = 0;
	let lcsIdx = 0;
	
	while (oldIdx < oldLines.length || newIdx < newLines.length) {
		if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLines[oldIdx] === lcs[lcsIdx]) {
			if (newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
				result.unchanged.push(oldLines[oldIdx]);
				oldIdx++;
				newIdx++;
				lcsIdx++;
			} else {
				result.removed.push(oldLines[oldIdx]);
				oldIdx++;
			}
		} else if (newIdx < newLines.length && (lcsIdx >= lcs.length || newLines[newIdx] !== lcs[lcsIdx])) {
			result.added.push(newLines[newIdx]);
			newIdx++;
		} else if (oldIdx < oldLines.length) {
			result.removed.push(oldLines[oldIdx]);
			oldIdx++;
		}
	}
	
	return result;
}

function longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
	const m = arr1.length;
	const n = arr2.length;
	const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
	
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (arr1[i - 1] === arr2[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}
	
	const lcs: string[] = [];
	let i = m, j = n;
	while (i > 0 && j > 0) {
		if (arr1[i - 1] === arr2[j - 1]) {
			lcs.unshift(arr1[i - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}
	
	return lcs;
}

export function formatDiffAsMarkdown(diff: DiffPreview, fileName: string): string {
	let md = `**📝 Changes to \`${fileName}\`**\n\n`;
	md += `📊 ${diff.addedCount} added, ${diff.removedCount} removed, ${diff.unchangedCount} unchanged\n\n`;
	
	if (diff.removedCount > 0) {
		md += '### Removed:\n```diff\n';
		for (const line of diff.removedLines.slice(0, 20)) {
			md += `-${line}\n`;
		}
		if (diff.removedCount > 20) {
			md += `... ${diff.removedCount - 20} more lines\n`;
		}
		md += '```\n\n';
	}
	
	if (diff.addedCount > 0) {
		md += '### Added:\n```diff\n';
		for (const line of diff.newLines.slice(0, 20)) {
			md += `+${line}\n`;
		}
		if (diff.addedCount > 20) {
			md += `... ${diff.addedCount - 20} more lines\n`;
		}
		md += '```\n\n';
	}
	
	md += '\n**Do you want to apply these changes?**\n';
	md += '- `[Yes]` Apply changes\n';
	md += '- `[No]` Cancel\n';
	md += '- `[Yes to All]` Apply all pending changes';
	
	return md;
}

export async function requestConfirmation(
	editId: string,
	filePath: string,
	oldContent: string,
	newContent: string
): Promise<ConfirmationResult> {
	const edit: PendingEdit = {
		id: editId,
		filePath,
		oldContent,
		newContent,
		timestamp: Date.now(),
		applied: false
	};
	
	pendingEdits.set(editId, edit);
	
	const fileName = filePath.split(/[\\/]/).pop() || 'file';
	const diff = generateDiff(oldContent, newContent);
	const message = formatDiffAsMarkdown(diff, fileName);
	
	const selection = await vscode.window.showInformationMessage(
		`Apply changes to ${fileName}?`,
		{ modal: true },
		'Apply',
		'Apply All',
		'Cancel'
	);
	
	const confirmed = selection === 'Apply' || selection === 'Apply All';
	const applyAll = selection === 'Apply All';
	
	if (confirmed) {
		edit.applied = true;
	}
	
	return {
		confirmed,
		applyAll
	};
}

export async function applyEdit(editId: string): Promise<boolean> {
	const edit = pendingEdits.get(editId);
	if (!edit || edit.applied) return false;
	
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace open');
			return false;
		}
		
		let uri: vscode.Uri;
		if (edit.filePath.startsWith('/') || edit.filePath.match(/^[A-Za-z]:/)) {
			uri = vscode.Uri.file(edit.filePath);
		} else {
			uri = vscode.Uri.joinPath(workspaceFolders[0].uri, edit.filePath);
		}
		
		const doc = await vscode.workspace.openTextDocument(uri);
		const content = doc.getText();
		
		const startIndex = content.indexOf(edit.oldContent);
		if (startIndex === -1) {
			vscode.window.showErrorMessage('Text not found in file');
			return false;
		}
		
		const endIndex = startIndex + edit.oldContent.length;
		const startPos = doc.positionAt(startIndex);
		const endPos = doc.positionAt(endIndex);
		
		const editResult = vscode.TextEdit.replace(
			new vscode.Range(startPos, endPos),
			edit.newContent
		);
		
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(uri, [editResult]);
		
		const applied = await vscode.workspace.applyEdit(workspaceEdit);
		
		if (applied) {
			edit.applied = true;
			vscode.window.showInformationMessage(`Changes applied to ${edit.filePath.split(/[\\/]/).pop()}`);
		}
		
		return applied;
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to apply edit: ${error.message}`);
		return false;
	}
}

export async function applyAllPendingEdits(): Promise<number> {
	let applied = 0;
	
	for (const [id, edit] of pendingEdits) {
		if (!edit.applied) {
			const success = await applyEdit(id);
			if (success) applied++;
		}
	}
	
	return applied;
}

export async function discardAllEdits(): Promise<void> {
	pendingEdits.clear();
}

export function getPendingEditsCount(): number {
	return Array.from(pendingEdits.values()).filter(e => !e.applied).length;
}

export function getPendingEdits(): PendingEdit[] {
	return Array.from(pendingEdits.values()).filter(e => !e.applied);
}

export async function showDiffPreview(
	uri: vscode.Uri,
	oldContent: string,
	newContent: string
): Promise<boolean> {
	const doc = await vscode.workspace.openTextDocument(uri);
	
	const edit = new vscode.WorkspaceEdit();
	const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
	edit.replace(uri, fullRange, newContent);
	
	await vscode.workspace.applyEdit(edit);
	
	const selection = await vscode.window.showInformationMessage(
		'Review the changes in the editor. Save to keep, or close without saving to discard.',
		{ modal: true },
		'Save & Apply',
		'Discard Changes'
	);
	
	if (selection === 'Save & Apply') {
		await doc.save();
		return true;
	} else {
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		return false;
	}
}

export function createInlineDiffDecoration(
	editor: vscode.TextEditor,
	oldContent: string,
	newContent: string
): void {
	const doc = editor.document;
	const content = doc.getText();
	
	const startIndex = content.indexOf(oldContent);
	if (startIndex === -1) return;
	
	const endIndex = startIndex + oldContent.length;
	const startPos = doc.positionAt(startIndex);
	const endPos = doc.positionAt(endIndex);
	
	const decoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255, 200, 0, 0.2)',
		isWholeLine: false
	});
	
	editor.setDecorations(decoration, [new vscode.Range(startPos, endPos)]);
}