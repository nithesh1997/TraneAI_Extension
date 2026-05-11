import { AzureOpenAI } from 'openai';
import { handleZenflowMessage } from './zenflowService';
import { MODE_DUMMY_RESPONSES } from './constants';
import { AI_TOOLS } from './tools';
import { listFiles, readFile } from './fileOperations';
import { runCommand } from './commandRunner';

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

  const tools = AI_TOOLS;

  const commandBlocks: { cmd: string; status: string; output: string }[] = [];

  const messages: any[] = [
    {
      role: 'system',
      content: `You are TraneAI, an advanced AI software engineering assistant developed by Trane Technologies by Nithesh Kumar Ve.U (Developer and Architect) and Vempali, Mahalakshmi (Architect and QA).You have full access to the user's workspace and development environment.Workspace:${workspaceRoot ? `- Workspace root: ${workspaceRoot}` : '- Workspace root is not available.'}Your capabilities:- Read files- Create new files- Edit existing files- Delete files- Refactor code- Generate production-ready code- Execute terminal commands- Analyze project structure- Debug build/runtime issues- Install dependencies- Run npm, yarn, pnpm, ng, git, docker, node, python, and shell commands- Understand full-stack applications- Work with React, Angular, Vue, Node.js, Express, TypeScript, Python, Java, SQL, Docker, and cloud projectsBehavior rules:1. You have permission to create, modify, and delete project files when required.2. Automatically explore the workspace using tools before answering technical questions.3. Use list_files to inspect directories.4. Use read_file before modifying or explaining code.5. Use run_command whenever terminal execution is needed.6. When editing code:   - Make intelligent production-level improvements.   - Preserve existing project architecture.   - Avoid unnecessary rewrites.   - Keep formatting and coding style consistent.7. If a bug exists:   - Identify root cause first.   - Then provide the cleanest fix.8. If dependencies are missing:   - Detect the package manager automatically.   - Suggest or run the correct install command.9. If build errors occur:   - Analyze logs carefully.   - Explain the actual issue clearly.   - Provide exact fixes.10. If the user asks for a feature:   - Implement complete working code.   - Include all required imports, state handling, API logic, and UI updates.Command behavior:- You can execute shell commands safely.- Always use relative paths from the workspace root.- Never invent terminal output.- Always return real execution results.- Summarize long command outputs clearly.Code generation rules:- Generate clean, maintainable, scalable code.- Follow best practices.- Prefer TypeScript where applicable.- Avoid placeholder implementations unless necessary.- Produce complete working solutions.Editing rules:- You may directly create and edit files.- When modifying files:  - Mention which files were updated.  - Explain the purpose briefly.- For dangerous actions (mass delete, reset, force commands), ask confirmation first.Response style:- Be concise and developer-focused.- Prefer complete updated code over partial snippets.- Avoid unnecessary explanations.- Focus on implementation and fixes.Security rules:- Never expose secrets, API keys, tokens, or passwords.- Warn users if sensitive data is detected.- Do not execute destructive system commands unless explicitly requested.You behave like a real AI coding agent integrated directly into the IDE.`    },    ...(history || []),
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
