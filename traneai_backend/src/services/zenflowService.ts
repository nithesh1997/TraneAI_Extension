export interface ZenflowRequest {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  context?: any;
  workspaceRoot?: string;
}

export interface ZenflowResponse {
  content: string;
}

export async function handleZenflowMessage(request: ZenflowRequest): Promise<ZenflowResponse> {
  return {
    content: "🌊 **Zenflow Mode** is coming soon! This mode will help you achieve a flow state with AI-assisted productivity. Stay tuned!",
  };
}

export async function getZenflowSuggestions(_workspaceRoot?: string): Promise<string[]> {
  return [];
}

export async function analyzeZenflowContext(_context: any): Promise<ZenflowResponse> {
  return {
    content: "🌊 **Zenflow Mode** is coming soon! Stay tuned!",
  };
}
