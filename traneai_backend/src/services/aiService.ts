import { AzureOpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { handleZenflowMessage } from './zenflowService';

const execAsync = promisify(exec);

const MODE_DUMMY_RESPONSES: Record<string, string> = {
  'new-joiner': "👋 **New Joiner Mode** is coming soon! This mode will help new team members get onboarded quickly. Stay tuned!",
  'developers': "💻 **Developers Mode** is coming soon! This mode will provide advanced code analysis and developer tools. Stay tuned!",
  'qa': "🧪 **QA Mode** is coming soon! This mode will assist with quality assurance workflows and test planning. Stay tuned!",
  'eva': "🤖 **EVA Mode** is coming soon! This mode will provide specialized AI assistance. Stay tuned!",
  'automated-testing': "🔄 **Automated Testing Mode** is coming soon! This mode will help you create and manage automated test suites. Stay tuned!",
};

export async function generateAIResponse(
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  context?: any,
  workspaceRoot?: string,
  mode?: string
): Promise<string> {

  if (mode === 'zenflow') {
    const result = await handleZenflowMessage({ message, history, context, workspaceRoot });
    return result.content;
  }

  if (mode && mode !== 'auto' && MODE_DUMMY_RESPONSES[mode]) {
    return MODE_DUMMY_RESPONSES[mode];
  }

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
    {
      type: 'function' as const,
      function: {
        name: 'run_command',
        description: 'Execute a shell command in the workspace directory. Use for git commands, npm/yarn commands, running tests, building, listing directory contents, or any shell operation requested by the user.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute' },
          },
          required: ['command'],
        },
      },
    },
  ];

  const commandBlocks: { cmd: string; status: string; output: string }[] = [];

  const messages: any[] = [
    { 
      role: 'system', 
      content: `You are TraneAI assistant. You were developed by Trane Technologies by Nithesh Kumar Ve.U (Developer and Architect) and Vempali, Mahalakshmi (Architect and QA).
      You have access to the user's workspace files and can execute shell commands.
      ${workspaceRoot ? `The workspace root is ${workspaceRoot}.` : ''}
      Use tools to explore the codebase when asked about files or the project structure.
      When the user asks to run a command (git, npm, yarn, etc.), use the run_command tool to execute it.
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
      } else if (functionName === 'run_command') {
        const result = await runCommand(functionArgs.command, workspaceRoot);
        commandBlocks.push(result);
        functionResponse = result.output;
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

  const finalContent = responseMessage.content || 'No response';
  if (commandBlocks.length === 0) {
    return finalContent;
  }
  const blockMarkers = commandBlocks
    .map(b => `\`\`\`cmd-result\n${JSON.stringify(b)}\n\`\`\``)
    .join('\n');
  return `${blockMarkers}\n\n${finalContent}`;
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

async function runCommand(command: string, workspaceRoot?: string): Promise<{ cmd: string; status: string; output: string }> {
  try {
    const cwd = workspaceRoot || process.cwd();
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000, shell: true });
    const output = (stdout + (stderr ? '\n' + stderr : '')).trim();
    return { cmd: command, status: 'success', output: output || '(no output)' };
  } catch (err: any) {
    const output = ((err.stdout || '') + (err.stderr ? '\n' + err.stderr : '') || err.message || 'Command failed').trim();
    return { cmd: command, status: 'error', output };
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
