interface Context {
  fileName?: string;
  language?: string;
  content?: string;
  lineCount?: number;
}

export async function generateAIResponse(
  message: string,
  model: string = 'auto',
  context?: Context
): Promise<string> {
  const contextInfo = context?.content
    ? `\n\nContext: Currently editing ${context.fileName || 'file'} (${context.language})\n${context.content.slice(0, 500)}...`
    : '';

  return `I am TraneAI. You said: "${message}"${contextInfo}\n\nHow can I help you today?`;
}