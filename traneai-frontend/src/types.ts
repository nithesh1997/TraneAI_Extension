export enum MessageType {
    FILE_CHANGED = 'FILE_CHANGED',
    CURSOR_MOVED = 'CURSOR_MOVED',
    AI_REQUEST = 'AI_REQUEST',
    AI_RESPONSE = 'AI_RESPONSE',
    LOG_OUTPUT = 'LOG_OUTPUT',
    APP_STATE = 'APP_STATE',
    NAVIGATE = 'NAVIGATE'
}

export interface SyncMessage {
    type: MessageType;
    payload: any;
    timestamp: number;
}

export interface FileChangedPayload {
    uri: string;
    content: string;
}

export interface CursorMovedPayload {
    uri: string;
    line: number;
    character: number;
    selection?: string;
}

export interface AIRequestPayload {
    prompt: string;
    context: any;
}

export interface AIResponsePayload {
    text: string;
    isStreaming: boolean;
    done: boolean;
}
