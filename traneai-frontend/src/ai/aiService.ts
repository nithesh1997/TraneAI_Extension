import * as vscode from 'vscode';
import { SyncBridge } from '../syncBridge';
import { MessageType, SyncMessage, AIRequestPayload } from '../types';
import { BackendService } from '../services/BackendService';
import { ContextBuilder } from './contextBuilder';

export class AIService {
    private static instance: AIService;
    private syncBridge: SyncBridge;

    private constructor() {
        this.syncBridge = SyncBridge.getInstance();
        this.syncBridge.onMessage(this.handleMessage.bind(this));
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    private async handleMessage(message: SyncMessage) {
        if (message.type === MessageType.AI_REQUEST) {
            const payload = message.payload as AIRequestPayload;
            await this.processAIRequest(payload);
        }
    }

    private async processAIRequest(payload: AIRequestPayload) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const fullContext = ContextBuilder.getFullContext();
        
        await BackendService.sendChatMessage(
            payload.prompt,
            [], // history
            workspaceRoot,
            'gpt-4', // default model
            undefined, // attachments
            undefined, // signal
            (text, isFinal) => {
                this.syncBridge.send(MessageType.AI_RESPONSE, {
                    text,
                    isStreaming: !isFinal,
                    done: isFinal,
                    context: fullContext
                });
            }
        );
    }
}
