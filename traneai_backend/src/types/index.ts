export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  model?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  model?: string;
  history?: HistoryMessage[];
  workspaceRoot?: string;
  context?: {
    fileName?: string;
    language?: string;
    content?: string;
    lineCount?: number;
  };
  pinnedFiles?: string[];
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

// Requirement 1, 2: Symbol and file context types
export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'component' | 'service' | 'selector' | 'route' | 'module' | 'directive' | 'pipe' | 'enum' | 'type';
  line?: number;
  filePath?: string;
}

export interface FileContext {
  filePath: string;
  exports: string[];
  imports: Array<{ source: string; symbols: string[] }>;
  symbols: SymbolInfo[];
  dependencies: string[];
  dependents: string[];
  routes?: string[];
  lineCount: number;
}

// Requirement 1: Architecture type
export interface ArchitectureInfo {
  type: 'angular' | 'react' | 'vue' | 'node-express' | 'python-flask' | 'python-django' | 'unknown';
  hasRouter: boolean;
  hasStore: boolean;
  hasTests: boolean;
  directories: string[];
  patterns: string[];
}

// Requirement 3: Impact analysis type
export interface ImpactAnalysis {
  primaryFile: string;
  affectedFiles: Array<{
    filePath: string;
    impactType: 'import' | 'export' | 'reference' | 'dependency' | 'route' | 'type';
    summary: string;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: string;
}

// Requirement 7: Error analysis type
export interface ErrorAnalysis {
  errorMessage: string;
  stackTrace: string[];
  rootCause: string;
  sourceFile: string;
  sourceLine: number;
  fixProposal: string;
  impactedFiles: string[];
}

// Requirement 6: Code explanation type
export interface CodeExplanation {
  purpose: string;
  dataFlow: string;
  dependencies: Array<{ name: string; usage: string }>;
  relatedFiles: string[];
  sideEffects: string[];
  architectureDecisions: string[];
  recommendations: string[];
}
