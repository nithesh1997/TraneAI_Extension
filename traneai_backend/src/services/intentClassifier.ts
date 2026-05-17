import { AzureOpenAI } from 'openai';

export enum Intent {
  CHAT = 'CHAT',
  EXPLAIN_CODE = 'EXPLAIN_CODE',
  EDIT_FILE = 'EDIT_FILE',
  MULTI_FILE_EDIT = 'MULTI_FILE_EDIT',
  RUN_COMMAND = 'RUN_COMMAND',
  SHOW_DIFF = 'SHOW_DIFF',
  REVERT = 'REVERT',
  REFACTOR = 'REFACTOR',
  FIX_ERROR = 'FIX_ERROR'
}

export class IntentClassifier {
  private client?: AzureOpenAI;

  constructor() {
    // We'll initialize the client lazily in classify() to avoid crashing on startup if env vars are not set yet
  }

  private initClient() {
    if (this.client) return;

    if (!process.env.AZURE_OPENAI_API_KEY) {
      console.warn('[IntentClassifier] Warning: AZURE_OPENAI_API_KEY is not set. Intent classification will be disabled.');
      return;
    }

    this.client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: '2024-02-15-preview',
    });
  }

  public async classify(message: string): Promise<Intent> {
    this.initClient();
    
    if (!this.client) {
      return Intent.CHAT;
    }
    const prompt = `Classify the following user message into one of these intents:
- CHAT: General conversation, greeting, or non-coding question.
- EXPLAIN_CODE: Asking to explain how a file or function works without changing it.
- EDIT_FILE: Requesting a specific change, addition, or deletion to a file. Any request like "add function", "change name", "update x" is an EDIT_FILE.
- MULTI_FILE_EDIT: Requesting changes that span multiple files or a project-wide refactor.
- RUN_COMMAND: Asking to run a terminal command (npm, git, etc).
- REVERT: Asking to undo or revert a change.
- REFACTOR: Asking to improve code structure, quality, or clean up code.
- FIX_ERROR: Reporting a bug, stack trace, or error that needs fixing.

CRITICAL: If the message mentions a file (e.g. using @) and asks for ANY modification, it is an EDIT_FILE.

Return ONLY the intent name in uppercase.

Message: "${message}"`;

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT!,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0,
      });

      const intent = response.choices[0]?.message?.content?.trim().toUpperCase() as Intent;
      if (Object.values(Intent).includes(intent)) {
        return intent;
      }
      return Intent.CHAT;
    } catch (err) {
      console.error('[IntentClassifier] Error:', err);
      return Intent.CHAT;
    }
  }
}
