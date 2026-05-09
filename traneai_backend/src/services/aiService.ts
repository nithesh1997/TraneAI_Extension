import { AzureOpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

export async function generateAIResponse(
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  context?: any,
  workspaceRoot?: string
): Promise<string> {

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'list_files',
        description: 'List files in a directory (max 2 levels deep)',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Relative path from workspace root' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Relative path from workspace root' },
          },
          required: ['filePath'],
        },
      },
    },
  ];

  const messages: any[] = [
    { 
      role: 'system', 
      content: `You are TraneAI assistant. You have access to the user's workspace files.
      ${workspaceRoot ? `The workspace root is ${workspaceRoot}.` : ''}
      Use tools to explore the codebase when asked about files or the project structure.
      When listing or reading files, use relative paths from the workspace root.` 
    },
    ...(history || []),
    { role: 'user', content: message }
  ];

  let response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: messages,
    tools: tools,
    tool_choice: 'auto',
  });

  let responseMessage = response.choices[0].message;

  while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      let functionResponse = '';

      if (functionName === 'list_files') {
        functionResponse = await listFiles(workspaceRoot, functionArgs.directory);
      } else if (functionName === 'read_file') {
        functionResponse = await readFile(functionArgs.filePath, workspaceRoot);
      }

      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: functionResponse,
      });
    }

    response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: messages,
    });
    responseMessage = response.choices[0].message;
  }

  return responseMessage.content || 'No response';
}

async function listFiles(workspaceRoot?: string, directory: string = '.'): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const targetDir = path.join(workspaceRoot, directory);
  if (!fs.existsSync(targetDir)) return `Directory not found: ${directory}`;
  
  try {
    const files = fs.readdirSync(targetDir, { withFileTypes: true });
    let result = `Contents of ${directory}:\n`;
    for (const file of files) {
      if (file.name === 'node_modules' || file.name === '.git') continue;
      result += `${file.isDirectory() ? '[DIR]' : '[FILE]'} ${file.name}\n`;
    }
    return result;
  } catch (err: any) {
    return `Error listing files: ${err.message}`;
  }
}

async function readFile(filePath: string, workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) return 'Workspace root not found.';
  const fullPath = path.join(workspaceRoot, filePath);
  if (!fs.existsSync(fullPath)) return `File not found: ${filePath}`;
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return content;
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

export async function generateVisionResponse(
  message: string,
  images: { base64: string; mimeType: string }[]
): Promise<string> {

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const imageContent = images.map(img => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }));

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: message },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content || 'No vision response';
}
