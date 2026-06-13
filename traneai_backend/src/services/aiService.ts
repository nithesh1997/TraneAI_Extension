import { AzureOpenAI } from 'openai';
import { handleZenflowMessage } from './zenflowService';
import { MODE_DUMMY_RESPONSES } from './constants';
import { AI_TOOLS } from './tools';
import { listFiles, readFile, createFile, writeFile, editFile, multiFileEdit, fuzzyFindFile, analyzeCode } from './fileOperations';
import { runCommand } from './commandRunner';
import { WorkspaceIndexer } from './workspaceIndexer';
import { IntentClassifier, Intent } from './intentClassifier';
import { ContextInjector } from './contextService';

const indexers: Map<string, WorkspaceIndexer> = new Map();
const contextInjectors: Map<string, ContextInjector> = new Map();
const classifier = new IntentClassifier();

const getEnhancedSystemPrompt = (wsRoot?: string, indexSummary?: string, intent?: Intent, contextSnippets?: string) => `You are TraneAI, an advanced AI software engineering assistant developed by Trane Technologies.

## Current Goal: ${intent || 'General Assistance'}

## Project Context
${indexSummary || 'No workspace index available.'}
${contextSnippets || ''}

## Identity & Tone
- You are a professional software engineer.
- Be direct and efficient, but remain helpful and polite.
- For CHAT intent: Be friendly and welcoming. Brief greetings like "Hello! How can I help you today?" are perfect.
- For EDIT/REFACTOR intent: Skip the preamble and generate code immediately.
- NO unnecessary conversational filler like "I hope this helps".

## Instruction for Edits
- NEVER explain code before editing.
- GENERATE an edit proposal immediately using tools if you have enough information.
- If you need more context, use read_file or list_files first.
- ALWAYS use multi_file_edit for changes spanning multiple files.
- Preserve all existing formatting, indentation, and comments.

## Methodical Engineering Workflow
1. **Plan**: For any task more complex than a simple greeting, start with a [PLAN] block.
2. **Explore**: Use list_files and read_file to verify context. NEVER guess the content of a file.
3. **Propose**: Use the appropriate tool (edit_file, create_file, etc.) to propose changes. 
   - Your tools will automatically generate proposals that the user must click "Accept" to execute. 
   - ALWAYS explain what the changes do after the tools have run.

## Identity & Professionalism
- You provide accurate, practical, and production-ready code.
- You explain things clearly and concisely after proposing changes.

## Workspace Access
- Workspace root: ${wsRoot || 'Not available'}
- You have full read/write access to the entire workspace

## Available Tools

### list_files
- Lists directory contents (files and folders)
- Use to explore project structure
- Skips node_modules and .git automatically

### read_file  
- Reads complete file contents
- ALWAYS use before editing or explaining code
- Returns full file content

### create_file
- Creates a new file with specified content
- Use for new components, services, files
- Creates parent directories if needed

### write_file
- Overwrites entire file with new content
- ONLY use for new files or complete rewrites
- For small edits, use edit_file instead

### edit_file (PREFERRED for edits)
- Makes targeted, minimal changes to existing files
- Uses smart matching: can handle minor whitespace and formatting differences
- Preserves all other code, formatting, and whitespace
- Always use this for: renaming, small changes, single function edits

### analyze_code
- Analyzes code structure and logic
- Returns: classes, functions, imports, exports, code preview
- Use to understand how code works

### run_command
- Executes shell commands in workspace
- Use for: git, npm, yarn, pnpm, ng, docker, python, etc.
- Returns actual command output

### fuzzy_find_file
- Fuzzy search for files by partial name
- Use when you know part of a filename but not the full path
- Returns ranked results (best matches first)
- Example: "userServ" finds "userService.ts"
- Faster than manually exploring directories with list_files

## Critical Rules
1. **ALWAYS read a file before modifying it** - Use read_file first
2. **ALWAYS explore the workspace** - Use list_files to understand structure  
3. **Use analyze_code** to understand code logic before explaining
4. **Be accurate** - Never make up code or command output
5. **Provide working solutions** - Test your code mentally before presenting
6. **Preserve existing architecture** - Don't rewrite unnecessarily
7. **Use correct paths** - Always relative to workspace root

## How to Handle Common Requests

### "Read/Explain/Analyze a file"
1. Use read_file to get the content
2. Use analyze_code to understand structure
3. Provide clear explanation

### "Edit/Modify/Change code" (CRITICAL)
1. Use read_file first to get exact current content
2. Use edit_file with oldString matching the section you want to change
3. The edit_file tool uses smart matching — minor whitespace/indentation differences are OK
4. ONLY change what was requested - do NOT:
   - Reformat or re-indent code
   - Change unrelated functions
   - Add or remove extra whitespace
   - Modify code that wasn't asked to change
5. Keep all existing formatting, comments, and structure

### "Create a new file"
1. Prepare the complete content
2. Use create_file with full path and content

### "Run a command"
1. Use run_command with the exact command
2. Report actual output

### "Explore project"
1. Use list_files starting from root "."
2. Navigate deeper as needed

## Response Guidelines
- Be concise and to the point
- Show actual code, not descriptions
- Include file paths in responses
- When uncertain, ask for clarification
- For complex tasks, explain approach first

## Important
- Never say "I don't have access" - you have full access
- Never invent file contents - read them first
- Never guess command output - run the command
- Always use the tools available to you`;

export async function generateAIResponse(
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  context?: any,
  workspaceRoot?: string,
  model?: string,
  onStep?: (step: string) => void,
  pinnedFiles: string[] = [],
  images?: { base64: string; mimeType: string }[]
): Promise<string> {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const tools = AI_TOOLS;

  const commandBlocks: { cmd: string; status: string; output: string }[] = [];

  let indexSummary = '';
  let pinnedContext = '';
  let contextSnippets = '';

  if (workspaceRoot) {
    if (!indexers.has(workspaceRoot)) {
      indexers.set(workspaceRoot, new WorkspaceIndexer(workspaceRoot));
      await indexers.get(workspaceRoot)!.indexWorkspace();
    }
    indexSummary = indexers.get(workspaceRoot)!.getContextForPrompt();

    // Build BM25 context injector if not already
    if (!contextInjectors.has(workspaceRoot)) {
      const injector = new ContextInjector();
      await injector.buildIndex(workspaceRoot);
      contextInjectors.set(workspaceRoot, injector);
    }

    // Get relevant context from user's message (BM25 search)
    const injector = contextInjectors.get(workspaceRoot);
    if (injector) {
      contextSnippets = injector.getRelevantContext(message, 5);
    }

    // Load content of pinned files
    if (pinnedFiles.length > 0) {
      pinnedContext = '\n--- PINNED CONTEXT ---\n';
      for (const file of pinnedFiles) {
        try {
          const content = await readFile(file, workspaceRoot);
          pinnedContext += `\nFILE: ${file}\nCONTENT:\n${content}\n`;
        } catch (e) {
          console.error(`Failed to read pinned file ${file}:`, e);
        }
      }
      pinnedContext += '\n--- END PINNED CONTEXT ---\n';
    }
  }

  const intent = await classifier.classify(message);
  
  // High-reliability mode: Force tool use for coding tasks to ensure HITL approval
  const forceTool = intent === Intent.EDIT_FILE || intent === Intent.MULTI_FILE_EDIT || intent === Intent.REFACTOR || intent === Intent.FIX_ERROR;

  const userContent: any = images && images.length > 0
    ? [
        { type: 'text', text: message },
        ...images.map(img => ({
          type: 'image_url' as const,
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
      ]
    : message;

  const messages: any[] = [
    {
      role: 'system',
      content: getEnhancedSystemPrompt(workspaceRoot, indexSummary, intent, contextSnippets) + pinnedContext,
    },
    ...(history || []),
    { role: 'user', content: userContent }
  ];

  let toolChoice: any = 'auto';
  if (forceTool) {
    // Force the model to use a tool to ensure HITL approval triggers
    toolChoice = 'required';
  }

  let response;
  try {
    response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: messages,
      tools: tools,
      tool_choice: toolChoice,
    });
  } catch (err) {
    console.warn('[aiService] tool_choice: "required" failed or not supported, falling back to "auto"', err);
    response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });
  }

  let responseMessage = response.choices[0].message;
  let allProposals: string[] = [];

  const steps: string[] = [];

  while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      let functionResponse = '';

      // Add to steps log
      let stepStr = '';
      if (functionName === 'read_file') {
        stepStr = `[STEP] Read File | ${functionArgs.filePath} [/STEP]`;
      } else if (functionName === 'list_files') {
        stepStr = `[STEP] Exploring Directory | ${functionArgs.directory || '/'} [/STEP]`;
      } else if (functionName === 'analyze_code') {
        stepStr = `[STEP] Analyzing Code | ${functionArgs.filePath} [/STEP]`;
      } else if (functionName === 'run_command') {
        stepStr = `[STEP] Running Command | ${functionArgs.command} [/STEP]`;
      }

      if (stepStr) {
        steps.push(stepStr);
        if (onStep) onStep(stepStr);
      }

      if (functionName === 'list_files') {
        functionResponse = await listFiles(workspaceRoot, functionArgs.directory);
      } else if (functionName === 'read_file') {
        functionResponse = await readFile(functionArgs.filePath, workspaceRoot);
      } else if (functionName === 'create_file') {
        functionResponse = await createFile(functionArgs.filePath, functionArgs.content, workspaceRoot);
      } else if (functionName === 'write_file') {
        functionResponse = await writeFile(functionArgs.filePath, functionArgs.content, workspaceRoot);
      } else if (functionName === 'edit_file') {
        functionResponse = await editFile(functionArgs.filePath, functionArgs.oldString, functionArgs.newString, workspaceRoot);
      } else if (functionName === 'multi_file_edit') {
        functionResponse = await multiFileEdit(functionArgs.changes, workspaceRoot);
      } else if (functionName === 'analyze_code') {
        functionResponse = await analyzeCode(functionArgs.filePath, workspaceRoot);
      } else if (functionName === 'run_command') {
        const proposal = await runCommand(functionArgs.command, workspaceRoot);
        functionResponse = proposal;
      } else if (functionName === 'fuzzy_find_file') {
        functionResponse = await fuzzyFindFile(functionArgs.query, workspaceRoot, functionArgs.max_results);
      }

      if (functionName === 'edit_file' || functionName === 'multi_file_edit' || functionName === 'create_file' || functionName === 'write_file' || functionName === 'run_command') {
        allProposals.push(functionResponse);
      }

      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: functionResponse,
      });
    }

    const nextResponse = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: messages,
      tools: tools,
    });
    responseMessage = nextResponse.choices[0].message;

    // Safety Intervention: If forcing tools and the AI tried to "chat" its way out without an edit yet
    if (forceTool && allProposals.length === 0 && !responseMessage.tool_calls) {
       messages.push({ role: 'user', content: 'You have analyzed the context but haven\'t proposed an edit yet. Please use the edit_file tool to implement the requested changes now.' });
       const retryResponse = await client.chat.completions.create({
         model: process.env.AZURE_OPENAI_DEPLOYMENT!,
         messages: messages,
         tools: tools,
         tool_choice: 'required'
       });
       if (retryResponse.choices[0].message.tool_calls) {
         responseMessage = retryResponse.choices[0].message;
       }
    }
  }

  let finalContent = responseMessage.content || '';

  // Safety layer: ONLY append proposals if they are absolutely missing from the final message.
  // This prevents duplication if the AI already included them.
  if (allProposals.length > 0) {
    let proposalBlock = '';
    for (const proposal of allProposals) {
      // Check if this specific proposal is already in the final content in its completeness
      if (!finalContent.includes(proposal)) {
         proposalBlock += `\n\n${proposal}`;
      }
    }
    finalContent += proposalBlock;
  }
  
  // Prepend steps to the content
  if (steps.length > 0) {
    finalContent = steps.join('\n') + '\n\n' + finalContent;
  }

  if (commandBlocks.length === 0) {
    return finalContent;
  }
  const blockMarkers = commandBlocks
    .map(b => `\`\`\`cmd-result\n${JSON.stringify(b)}\n\`\`\``)
    .join('\n');
return `${blockMarkers}\n\n${finalContent}`;
}


