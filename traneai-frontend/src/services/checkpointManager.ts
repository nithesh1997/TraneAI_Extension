import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface FileState {
	path: string;
	content: string;
}

export interface Checkpoint {
	id: string;
	timestamp: number;
	files: FileState[];
}

export class CheckpointManager {
	private checkpoints: Checkpoint[] = [];
	private historyDir: string;

	constructor(extensionUri: vscode.Uri) {
		this.historyDir = path.join(os.tmpdir(), 'traneai-history');
		if (!fs.existsSync(this.historyDir)) {
			fs.mkdirSync(this.historyDir, { recursive: true });
		}
	}

	public async createCheckpoint(filePaths: string[]): Promise<string> {
		const checkpointId = `cp-${Date.now()}`;
		const files: FileState[] = [];

		for (const filePath of filePaths) {
			try {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders) continue;

				let uri: vscode.Uri;
				if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
					uri = vscode.Uri.file(filePath);
				} else {
					uri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
				}

				if (fs.existsSync(uri.fsPath)) {
					const content = fs.readFileSync(uri.fsPath, 'utf-8');
					files.push({ path: filePath, content });
				}
			} catch (err) {
				console.error(`Failed to backup file ${filePath}:`, err);
			}
		}

		const checkpoint: Checkpoint = {
			id: checkpointId,
			timestamp: Date.now(),
			files
		};

		this.checkpoints.push(checkpoint);
		return checkpointId;
	}

	public async revertCheckpoint(checkpointId: string): Promise<boolean> {
		const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
		if (!checkpoint) return false;

		for (const file of checkpoint.files) {
			try {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders) continue;

				let uri: vscode.Uri;
				if (file.path.startsWith('/') || file.path.match(/^[A-Za-z]:/)) {
					uri = vscode.Uri.file(file.path);
				} else {
					uri = vscode.Uri.joinPath(workspaceFolders[0].uri, file.path);
				}

				fs.writeFileSync(uri.fsPath, file.content, 'utf-8');
			} catch (err) {
				console.error(`Failed to revert file ${file.path}:`, err);
				return false;
			}
		}

		return true;
	}

	public getCheckpointSummary(checkpointId: string): string {
		const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
		if (!checkpoint) return 'Checkpoint not found';

		return `Checkpoint ${checkpointId} created at ${new Date(checkpoint.timestamp).toLocaleTimeString()}. Backed up ${checkpoint.files.length} files.`;
	}
}
