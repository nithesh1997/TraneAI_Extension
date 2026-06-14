import { AzureOpenAI } from 'openai';

export enum Intent {
  CHAT = 'CHAT',
  EXPLAIN_CODE = 'EXPLAIN_CODE',
  EXPLAIN_ARCHITECTURE = 'EXPLAIN_ARCHITECTURE',
  EDIT_FILE = 'EDIT_FILE',
  MULTI_FILE_EDIT = 'MULTI_FILE_EDIT',
  RUN_COMMAND = 'RUN_COMMAND',
  SHOW_DIFF = 'SHOW_DIFF',
  REVERT = 'REVERT',
  REFACTOR = 'REFACTOR',
  FIX_ERROR = 'FIX_ERROR',
  INVESTIGATE = 'INVESTIGATE',
  ANALYZE_IMPACT = 'ANALYZE_IMPACT',
  FIND_REFERENCES = 'FIND_REFERENCES',
  DEPENDENCY_ANALYSIS = 'DEPENDENCY_ANALYSIS'
}

export class IntentClassifier {
  private client?: AzureOpenAI;

  constructor() {}

  private initClient() {
    if (this.client) return;
    if (!process.env.AZURE_OPENAI_API_KEY) {
      console.warn('[IntentClassifier] AZURE_OPENAI_API_KEY not set. Using heuristic classification.');
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
    if (!this.client) return this.heuristicClassify(message);

    const truncated = message.length > 2000 ? message.substring(0, 2000) + '...' : message;
    const prompt = 'Classify the following user message into one of these intents:\n' +
      '- CHAT: General conversation, greeting, or non-coding question.\n' +
      '- EXPLAIN_CODE: Asking to explain how code works without changing it.\n' +
      '- EXPLAIN_ARCHITECTURE: Asking about project structure or architecture.\n' +
      '- EDIT_FILE: Requesting a change to a single file.\n' +
      '- MULTI_FILE_EDIT: Requesting changes spanning multiple files.\n' +
      '- RUN_COMMAND: Asking to run a terminal command (npm, git, etc).\n' +
      '- REVERT: Asking to undo or revert a change.\n' +
      '- REFACTOR: Asking to improve code structure or quality.\n' +
      '- FIX_ERROR: Reporting a bug, stack trace, or error.\n' +
      '- INVESTIGATE: Asking to find why something happens or locate a problem.\n' +
      '- ANALYZE_IMPACT: Asking about the impact of a change.\n' +
      '- FIND_REFERENCES: Asking where something is used.\n' +
      '- DEPENDENCY_ANALYSIS: Asking about dependencies between files.\n\n' +
      'Return ONLY the intent name in uppercase.\n\nMessage: "' + truncated + '"';

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT!,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0,
      });
      const intent = response.choices[0]?.message?.content?.trim().toUpperCase() as Intent;
      if (Object.values(Intent).includes(intent)) return intent;
      return this.heuristicClassify(message);
    } catch {
      return this.heuristicClassify(message);
    }
  }

  private heuristicClassify(message: string): Intent {
    const lower = message.toLowerCase();

    if (lower.match(/explain|how does|what does|understand/)) {
      if (lower.match(/architecture|structure|overview|organized|pattern/)) return Intent.EXPLAIN_ARCHITECTURE;
      return Intent.EXPLAIN_CODE;
    }
    if (lower.match(/architecture|project structure|overview/)) return Intent.EXPLAIN_ARCHITECTURE;
    if (lower.match(/error|bug|doesn.*work|fails|broken|stack trace/)) return Intent.FIX_ERROR;
    if (lower.match(/find|where is|locate|search for|investigate/)) return Intent.INVESTIGATE;
    if (lower.match(/impact|what happens if|affect|consequences/)) return Intent.ANALYZE_IMPACT;
    if (lower.match(/where.*used|references|usages|used anywhere/)) return Intent.FIND_REFERENCES;
    if (lower.match(/depends|dependency|what does.*use|imports of/)) return Intent.DEPENDENCY_ANALYSIS;
    if (lower.match(/run|execute|install|build|test|deploy|npm|git|docker|command/)) return Intent.RUN_COMMAND;
    if (lower.match(/revert|undo|rollback/)) return Intent.REVERT;
    if (lower.match(/refactor|clean up|improve|restructure|optimize/)) {
      if (lower.match(/all|everywhere|every|project|across/)) return Intent.MULTI_FILE_EDIT;
      return Intent.REFACTOR;
    }
    if (lower.match(/add|change|update|modify|remove|delete|rename|create|insert/)) {
      if (lower.match(/all files|everywhere|all|multiple|each/)) return Intent.MULTI_FILE_EDIT;
      return Intent.EDIT_FILE;
    }
    return Intent.CHAT;
  }
}
