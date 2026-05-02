export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  model?: string;
}

export interface ChatRequest {
  message: string;
  model?: string;
  context?: {
    fileName?: string;
    language?: string;
    content?: string;
    lineCount?: number;
  };
}

export interface ChatResponse {
  message: Message;
  suggestions?: string[];
}

export interface QuickActionRequest {
  action: 'explain' | 'review' | 'tests';
  fileName: string;
  language: string;
  content: string;
  lineCount: number;
}

export interface QuickActionResponse {
  message: Message;
  codeBlock?: string;
  language?: string;
}