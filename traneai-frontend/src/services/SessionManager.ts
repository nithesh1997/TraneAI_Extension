/**
 * SessionManager handles encrypted local storage of chat sessions.
 * It saves, loads, migrates, and summarizes user chat histories, while
 * keeping session data protected and scoped to the workspace or user.
 */
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

export interface SessionMessage {
	role: string;
	text: string;
	timestamp: number;
	attachments?: any[];
	id?: string;
	isStreaming?: boolean;
}

export interface ChatSession {
	id: string;
	title: string;
	email: string;
	createdAt: number;
	updatedAt: number;
	messages: SessionMessage[];
}

export interface SessionSummary {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
}

export class SessionManager {
	private _getEncryptionKey(): Buffer {
		const secret = vscode.env.machineId || 'traneai-default-secret';
		return crypto.scryptSync(secret, 'traneai-salt', 32);
	}

	private _compressAndEncrypt(data: string): Buffer {
		const compressed = zlib.deflateSync(data);
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv('aes-256-cbc', this._getEncryptionKey(), iv);
		const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
		return Buffer.concat([iv, encrypted]);
	}

	private _decryptAndDecompress(buffer: Buffer): string {
		try {
			const iv = buffer.subarray(0, 16);
			const encryptedData = buffer.subarray(16);
			const decipher = crypto.createDecipheriv('aes-256-cbc', this._getEncryptionKey(), iv);
			const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
			return zlib.inflateSync(decrypted).toString('utf-8');
		} catch (e) {
			console.error('Failed to decrypt/decompress session:', e);
			return '';
		}
	}

	public getTraneAIDir(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			return path.join(workspaceFolders[0].uri.fsPath, '.traneAI');
		}
		return path.join(os.homedir(), '.traneAI');
	}

	public getSessionsDir(): string {
		return path.join(this.getTraneAIDir(), 'sessions');
	}

	public ensureTraneAIDir(): void {
		const traneAIDir = this.getTraneAIDir();
		const sessionsDir = this.getSessionsDir();
		if (!fs.existsSync(traneAIDir)) {
			fs.mkdirSync(traneAIDir, { recursive: true });
		}
		const gitignorePath = path.join(traneAIDir, '.gitignore');
		if (!fs.existsSync(gitignorePath)) {
			fs.writeFileSync(gitignorePath, '*\n');
		}
		if (!fs.existsSync(sessionsDir)) {
			fs.mkdirSync(sessionsDir, { recursive: true });
		}
		this._migrateSessions();
	}

	private _migrateSessions(): void {
		const sessionsDir = this.getSessionsDir();
		if (!fs.existsSync(sessionsDir)) return;
		
		try {
			const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
			for (const file of files) {
				const jsonPath = path.join(sessionsDir, file);
				const tranePath = path.join(sessionsDir, file.replace('.json', '.trane'));
				
				try {
					if (!fs.existsSync(tranePath)) {
						const content = fs.readFileSync(jsonPath, 'utf-8');
						const encrypted = this._compressAndEncrypt(content);
						fs.writeFileSync(tranePath, encrypted);
					}
					fs.unlinkSync(jsonPath);
				} catch (e) {
					console.error(`Failed to migrate ${file}:`, e);
				}
			}
		} catch (e) {
			console.error('Failed to read sessions directory for migration:', e);
		}
	}

	public saveSession(
		sessionId: string,
		userEmail: string,
		messages: SessionMessage[],
		forceUpdateTimestamp: boolean = true
	): void {
		if (!sessionId || messages.length === 0) {
			return;
		}
		this.ensureTraneAIDir();
		const firstUserMsg = messages.find(m => m.role === 'user');
		const title = firstUserMsg
			? firstUserMsg.text.replace(/\s+/g, ' ').trim().slice(0, 50) + (firstUserMsg.text.length > 50 ? '…' : '')
			: 'New Chat';

		const sessionsDir = this.getSessionsDir();
		const sessionFile = path.join(sessionsDir, `${sessionId}.trane`);
		const oldSessionFile = path.join(sessionsDir, `${sessionId}.json`);
		
		let createdAt = Date.now();
		let updatedAt = Date.now();
		let existingSession: ChatSession | undefined;

		if (fs.existsSync(sessionFile)) {
			try {
				const content = this._decryptAndDecompress(fs.readFileSync(sessionFile));
				if (content) {
					existingSession = JSON.parse(content);
				}
			} catch {}
		} else if (fs.existsSync(oldSessionFile)) {
			try {
				existingSession = JSON.parse(fs.readFileSync(oldSessionFile, 'utf-8'));
			} catch {}
		}

		if (existingSession) {
			createdAt = existingSession.createdAt;
			updatedAt = existingSession.updatedAt;
		}

		const newMessages = messages.map(m => ({ ...m, isStreaming: false }));
		
		const contentChanged = !existingSession || 
							 existingSession.title !== title || 
							 existingSession.email !== userEmail || 
							 JSON.stringify(existingSession.messages) !== JSON.stringify(newMessages);

		if (forceUpdateTimestamp && contentChanged) {
			updatedAt = Date.now();
		}

		const session: ChatSession = {
			id: sessionId,
			title,
			email: userEmail,
			createdAt,
			updatedAt,
			messages: newMessages,
		};
		
		try {
			const data = JSON.stringify(session);
			const encrypted = this._compressAndEncrypt(data);
			fs.writeFileSync(sessionFile, encrypted);
			
			if (fs.existsSync(oldSessionFile)) {
				fs.unlinkSync(oldSessionFile);
			}
		} catch (e) {
			console.error('Failed to save session:', e);
		}
	}

	public loadSessionList(userEmail: string): SessionSummary[] {
		this.ensureTraneAIDir();
		const sessionsDir = this.getSessionsDir();
		try {
			const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') || f.endsWith('.trane'));
			const summariesMap: Map<string, SessionSummary> = new Map();
			
			for (const file of files) {
				try {
					const filePath = path.join(sessionsDir, file);
					let session: ChatSession;
					
					if (file.endsWith('.trane')) {
						const content = this._decryptAndDecompress(fs.readFileSync(filePath));
						if (!content) continue;
						session = JSON.parse(content);
					} else {
						session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
					}

					if (!userEmail || session.email === userEmail) {
						if (!summariesMap.has(session.id) || summariesMap.get(session.id)!.updatedAt < session.updatedAt) {
							summariesMap.set(session.id, {
								id: session.id,
								title: session.title,
								updatedAt: session.updatedAt,
								messageCount: session.messages.length,
							});
						}
					}
				} catch {}
			}
			return Array.from(summariesMap.values()).sort((a, b) => {
				if (b.updatedAt !== a.updatedAt) {
					return b.updatedAt - a.updatedAt;
				}
				return b.id.localeCompare(a.id);
			});
		} catch {
			return [];
		}
	}

	public loadSessionById(sessionId: string, userEmail: string): ChatSession | undefined {
		const sessionsDir = this.getSessionsDir();
		const sessionFile = path.join(sessionsDir, `${sessionId}.trane`);
		const oldSessionFile = path.join(sessionsDir, `${sessionId}.json`);
		
		let session: ChatSession | undefined;
		
		if (fs.existsSync(sessionFile)) {
			try {
				const content = this._decryptAndDecompress(fs.readFileSync(sessionFile));
				if (content) {
					session = JSON.parse(content);
				}
			} catch {}
		} else if (fs.existsSync(oldSessionFile)) {
			try {
				session = JSON.parse(fs.readFileSync(oldSessionFile, 'utf-8'));
			} catch {}
		}

		if (!session) {
			return undefined;
		}

		if (userEmail && session.email && session.email !== userEmail) {
			return undefined;
		}
		return session;
	}

	public deleteSession(sessionId: string): void {
		const sessionFile = path.join(this.getSessionsDir(), `${sessionId}.json`);
		const compressedFile = path.join(this.getSessionsDir(), `${sessionId}.trane`);
		
		if (fs.existsSync(sessionFile)) {
			fs.unlinkSync(sessionFile);
		}
		if (fs.existsSync(compressedFile)) {
			fs.unlinkSync(compressedFile);
		}
	}
}
