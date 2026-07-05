import { AzureOpenAI } from 'openai';
import { handleZenflowMessage } from './zenflowService';
import { MODE_DUMMY_RESPONSES } from './constants';
import { AI_TOOLS } from './tools';
import { listFiles, readFile, createFile, writeFile, editFile, multiFileEdit, fuzzyFindFile, analyzeCode, searchBySymbol, findReferences } from './fileOperations';
import { runCommand } from './commandRunner';
import { WorkspaceIndexer } from './workspaceIndexer';
import { IntentClassifier, Intent } from './intentClassifier';
import { ContextInjector } from './contextService';
import { ImpactAnalyzer } from './impactAnalyzer';
import { ArchitectureAnalyzer } from './architectureAnalyzer';
import { ErrorInvestigator } from './errorInvestigator';
import { getIndexer } from '../controllers/ragController';

const indexers: Map<string, WorkspaceIndexer> = new Map();
const contextInjectors: Map<string, ContextInjector> = new Map();
const impactAnalyzers: Map<string, ImpactAnalyzer> = new Map();
const architectureAnalyzers: Map<string, ArchitectureAnalyzer> = new Map();
const errorInvestigators: Map<string, ErrorInvestigator> = new Map();
const classifier = new IntentClassifier();

const getEnhancedSystemPrompt = (wsRoot?: string, indexSummary?: string, intent?: Intent, contextSnippets?: string) => `You are TraneAI Premium, an elite AI software engineering assistant. You excel at understanding entire codebases, making precise edits, explaining architecture, and investigating errors.

## Current Goal: ${intent || 'General Assistance'}

## Project Context
${indexSummary || 'No workspace index available.'}
${contextSnippets || ''}

## Identity & Tone (Requirement 9)
- You are a professional, senior software engineer.
- Responses must be structured but concise.
- For CHAT: Brief greetings only.
- For CODE tasks: Skip preamble, generate proposals immediately.
- Use [ANALYSIS], [DEPENDENCIES], [IMPACT], [RELATED FILES], [FLOW], [RECOMMENDATIONS] markers in responses.
- NO filler like "I hope this helps" or "Let me know if I can help further".
- NO emojis.

## Thinking Process
When working on complex tasks, wrap your reasoning in <think>...</think> tags BEFORE providing your answer.
This helps you plan and reason through the problem. The user will see a collapsed "Thinking..." section.
For simple greetings or trivial responses, do NOT use think tags.

## CRITICAL: Accurate Edit Placement (Requirement 4)
When editing a TypeScript/JavaScript/React file, you MUST follow these placement rules:
1. IMPORT statements: Place at the TOP of the file, after existing imports
2. React hooks (useState, useEffect, etc.): Place at the TOP of the function body, BEFORE any return statement
3. NEVER place code after the return statement - it is dead code
4. Local functions/variables: Place before the return statement
5. Use analyze_code first to see structural landmarks (last import line, component body start, return statement line)
6. To insert new code after imports: use oldString matching the last import line + surrounding context
7. To insert hooks/state at function top: use oldString matching the opening of function body + surrounding context
8. To add code before return: use oldString matching the return statement line + surrounding context

## Methodical Engineering Workflow (Requirement 1)
1. **Plan**: Output a [PLAN] block for complex tasks.
2. **Explore**: Use list_files, read_file, analyze_code, get_architecture to gather context.
3. **Analyze Impact**: Use analyze_impact before making cross-file changes.
4. **Propose**: Use edit_file, create_file, multi_file_edit as needed.

## Available Premium Tools

### File Operations
- list_files: Browse directory structure
- read_file: Read any file (ALWAYS use before editing)
- analyze_code: Get structural landmarks + code structure (ALWAYS use before editing)

### Edit Operations
- edit_file: Make precise edits (PREFERRED). Follow placement rules above.
- create_file: Create new files
- write_file: Overwrite entire file (use only for rewrites)
- multi_file_edit: Atomic multi-file changes

### Search & Discovery (Requirement 2)
- fuzzy_find_file: Find files by partial name
- search_symbol: Search for symbols (class, function, interface) across workspace
- find_references: Find all usages of a symbol across workspace

### Analysis Tools (Requirement 6)
- analyze_code: File-level structural analysis with landmarks
- explain_code_deeply: Deep explanation (purpose, data flow, dependencies, architecture decisions)
- get_architecture: Workspace-level architecture overview

### Impact & Error Analysis (Requirement 3, 7)
- analyze_impact: Multi-file impact analysis before changes
- investigate_error: Error analysis with root cause and fix proposal

### Utility
- run_command: Execute shell commands

## CRITICAL: Rename / Refactor Workflow (must follow)
When renaming a symbol (function, class, component, import, variable):
1. Call [find_references] with the OLD symbol name to find ALL files that reference it
2. Read each file to get EXACT current content
3. Copy the EXACT text from read_file output for oldString (do NOT re-type)
4. Use [multi_file_edit] with ALL affected files in a single call
5. Verify no files were missed

## Critical Rules (Requirement 10)
1. Read before edit: ALWAYS read_file before any modification
2. Use analyze_code first: Get structural landmarks before editing
3. Accurate placement: Follow the accurate edit placement rules above
4. Impact-aware: Use analyze_impact before cross-file changes
5. Deep explanations: Use explain_code_deeply when user asks "how does X work"
6. Error investigation: Use investigate_error when user reports errors
7. No destructive changes: Preserve existing code, only change what's requested
8. Path accuracy: Always use paths relative to workspace root
9. Response structure: Use [ANALYSIS], [IMPACT], [RELATED FILES], [FLOW], [RECOMMENDATIONS] markers
10. Be thorough: Check multiple files when investigating issues

## Workspace Access
- Workspace root: ${wsRoot || 'Not available'}
- You have full read/write access to the entire workspace`;

// ──────────────────────────────────────────────────────────────────────────────
// Tool execution helper
// ──────────────────────────────────────────────────────────────────────────────
async function executeTool(
  functionName: string,
  functionArgs: any,
  workspaceRoot?: string
): Promise<string> {
  if (functionName === 'list_files') {
    return await listFiles(workspaceRoot, functionArgs.directory);
  } else if (functionName === 'read_file') {
    return await readFile(functionArgs.filePath, workspaceRoot);
  } else if (functionName === 'create_file') {
    return await createFile(functionArgs.filePath, functionArgs.content, workspaceRoot);
  } else if (functionName === 'write_file') {
    return await writeFile(functionArgs.filePath, functionArgs.content, workspaceRoot);
  } else if (functionName === 'edit_file') {
    return await editFile(functionArgs.filePath, functionArgs.oldString, functionArgs.newString, workspaceRoot);
  } else if (functionName === 'multi_file_edit') {
    return await multiFileEdit(functionArgs.changes, workspaceRoot);
  } else if (functionName === 'analyze_code') {
    return await analyzeCode(functionArgs.filePath, workspaceRoot);
  } else if (functionName === 'run_command') {
    return await runCommand(functionArgs.command, workspaceRoot);
  } else if (functionName === 'fuzzy_find_file') {
    return await fuzzyFindFile(functionArgs.query, workspaceRoot, functionArgs.max_results);
  } else if (functionName === 'search_symbol') {
    return await searchBySymbol(functionArgs.query, workspaceRoot);
  } else if (functionName === 'find_references') {
    return await findReferences(functionArgs.symbolName, workspaceRoot);
  } else if (functionName === 'investigate_error') {
    const investigator = workspaceRoot ? errorInvestigators.get(workspaceRoot) : undefined;
    if (investigator) {
      const analysis = investigator.analyzeError(functionArgs.errorMessage);
      return '## Error Investigation\n\n**Error:** ' + analysis.errorMessage + '\n**Root Cause:** ' + analysis.rootCause + '\n**Source File:** ' + analysis.sourceFile + ':' + analysis.sourceLine + '\n**Affected Files:** ' + analysis.impactedFiles.join(', ') + '\n\n**Fix Proposal:**\n' + analysis.fixProposal;
    }
    return 'Error investigator not initialized. Workspace root required.';
  } else if (functionName === 'get_architecture') {
    const analyzer = workspaceRoot ? architectureAnalyzers.get(workspaceRoot) : undefined;
    if (analyzer) {
      const detail = functionArgs.detail || 'overview';
      return detail === 'components' ? analyzer.getComponentMap() : analyzer.getArchitectureOverview();
    }
    return 'Architecture analyzer not initialized.';
  } else if (functionName === 'analyze_impact') {
    const analyzer = workspaceRoot ? impactAnalyzers.get(workspaceRoot) : undefined;
    if (analyzer) {
      const impact = analyzer.analyzeImpact(functionArgs.filePath, functionArgs.symbolName || 'changes');
      return '## Impact Analysis\n\n**File:** ' + impact.primaryFile + '\n**Risk Level:** ' + impact.riskLevel + '\n**Affected Files (' + impact.affectedFiles.length + '):**\n' + impact.affectedFiles.map((f: any) => '- `' + f.filePath + '` (' + f.impactType + ') -- ' + f.summary).join('\n') + '\n\n**Recommendation:** ' + impact.recommendation;
    }
    return 'Impact analyzer not initialized.';
  } else if (functionName === 'explain_code_deeply') {
    const codeAnalysis = await analyzeCode(functionArgs.filePath, workspaceRoot);
    return '## Deep Code Explanation\n\n' + codeAnalysis;
  }
  return 'Unknown tool: ' + functionName;
}

// ──────────────────────────────────────────────────────────────────────────────
// Stream a single OpenAI call, emitting tokens and collecting tool calls
// ──────────────────────────────────────────────────────────────────────────────
interface StreamResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
}

async function streamCompletion(
  client: AzureOpenAI,
  messages: any[],
  tools: any[],
  toolChoice: any,
  onToken: (token: string) => void
): Promise<StreamResult> {
  let content = '';
  const toolCallBuffers: Map<number, { id: string; name: string; args: string }> = new Map();

  try {
    const stream = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages,
      tools,
      tool_choice: toolChoice,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Stream content tokens immediately
      if (delta.content) {
        content += delta.content;
        onToken(delta.content);
      }

      // Buffer tool call arguments as they arrive in chunks
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallBuffers.has(idx)) {
            toolCallBuffers.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
          }
          const buf = toolCallBuffers.get(idx)!;
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) buf.args += tc.function.arguments;
        }
      }
    }
  } catch (err: any) {
    // If streaming fails (e.g. model doesn't support it), fall back to non-streaming
    console.warn('[aiService] Streaming failed, falling back to non-streaming:', err.message);
    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages,
      tools,
      tool_choice: toolChoice,
    });
    const msg = response.choices[0].message;
    if (msg.content) {
      content = msg.content;
      onToken(content);
    }
    if (msg.tool_calls) {
      for (let i = 0; i < msg.tool_calls.length; i++) {
        const tc = msg.tool_calls[i];
        const fnCall = 'function' in tc ? tc.function : undefined;
        if (!fnCall?.name) {
          continue;
        }

        toolCallBuffers.set(i, {
          id: tc.id,
          name: fnCall.name,
          args: fnCall.arguments || '',
        });
      }
    }
  }

  const toolCalls = Array.from(toolCallBuffers.values())
    .filter(tc => tc.id && tc.name)
    .map(tc => ({ id: tc.id, name: tc.name, arguments: tc.args }));

  return { content, toolCalls };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main streaming AI response generator
// ──────────────────────────────────────────────────────────────────────────────
export async function generateAIResponseStreaming(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] | undefined,
  context: any,
  workspaceRoot: string | undefined,
  model: string | undefined,
  onToken: (token: string) => void,
  onStep: (step: string) => void,
  pinnedFiles: string[] = [],
  images?: { base64: string; mimeType: string }[],
  modeRules?: string
): Promise<void> {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const tools = AI_TOOLS;

  let indexSummary = '';
  let pinnedContext = '';
  let contextSnippets = '';

  if (workspaceRoot) {
    if (!indexers.has(workspaceRoot)) {
      indexers.set(workspaceRoot, new WorkspaceIndexer(workspaceRoot));
      await indexers.get(workspaceRoot)!.indexWorkspace();
    }
    indexSummary = indexers.get(workspaceRoot)!.getContextForPrompt();

    // Initialize premium analyzers
    if (!impactAnalyzers.has(workspaceRoot)) {
      impactAnalyzers.set(workspaceRoot, new ImpactAnalyzer(indexers.get(workspaceRoot)!));
    }
    if (!architectureAnalyzers.has(workspaceRoot)) {
      architectureAnalyzers.set(workspaceRoot, new ArchitectureAnalyzer(indexers.get(workspaceRoot)!));
    }
    if (!errorInvestigators.has(workspaceRoot)) {
      errorInvestigators.set(workspaceRoot, new ErrorInvestigator(indexers.get(workspaceRoot)!));
    }

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
    
    // Augment context with RAG Vector DB Search
    try {
      const indexer = await getIndexer(workspaceRoot);
      const ragChunks = await indexer.search(message, 3);
      if (ragChunks && ragChunks.length > 0) {
        contextSnippets += '\n\n--- RAG KNOWLEDGE BASE CONTEXT ---\n';
        for (const chunk of ragChunks) {
          contextSnippets += `\n[Source: ${chunk.filePath} - ${chunk.heading}]\n${chunk.text}\n`;
        }
        contextSnippets += '--- END RAG CONTEXT ---\n';
      }
    } catch (e) {
      console.error('Failed to get RAG chunks:', e);
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

  const baseSystemPrompt = getEnhancedSystemPrompt(workspaceRoot, indexSummary, intent, contextSnippets);
  const finalSystemPrompt = modeRules 
    ? `${baseSystemPrompt}\n\n## strict mode rules\n${modeRules}\n\n`
    : baseSystemPrompt;

  const messages: any[] = [
    {
      role: 'system',
      content: finalSystemPrompt + pinnedContext,
    },
    ...(history || []),
    { role: 'user', content: userContent }
  ];

  let toolChoice: any = 'auto';
  if (forceTool) {
    toolChoice = 'required';
  }

  let allProposals: string[] = [];
  const MAX_TOOL_ROUNDS = 15;
  let round = 0;

  // ── Streaming tool loop ──────────────────────────────────────────────────
  while (round < MAX_TOOL_ROUNDS) {
    round++;

    let result: StreamResult;
    try {
      result = await streamCompletion(client, messages, tools, toolChoice, onToken);
    } catch (err) {
      console.warn('[aiService] stream call failed, falling back to auto:', err);
      toolChoice = 'auto';
      result = await streamCompletion(client, messages, tools, toolChoice, onToken);
    }

    // If no tool calls, we're done
    if (result.toolCalls.length === 0) {
      break;
    }

    // Build the assistant message with tool calls for the conversation
    const assistantMsg: any = { role: 'assistant', content: result.content || null };
    assistantMsg.tool_calls = result.toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    }));
    messages.push(assistantMsg);

    // Execute each tool call and stream steps
    for (const tc of result.toolCalls) {
      let functionArgs: any = {};
      try {
        functionArgs = JSON.parse(tc.arguments);
      } catch {
        console.warn('[aiService] Failed to parse tool arguments for', tc.name, tc.arguments);
        messages.push({ tool_call_id: tc.id, role: 'tool', name: tc.name, content: 'ERROR: Failed to parse arguments.' });
        continue;
      }

      // Emit step events
      let stepStr = '';
      if (tc.name === 'read_file') {
        stepStr = `[STEP] Read File | ${functionArgs.filePath} [/STEP]`;
      } else if (tc.name === 'list_files') {
        stepStr = `[STEP] Exploring Directory | ${functionArgs.directory || '/'} [/STEP]`;
      } else if (tc.name === 'analyze_code') {
        stepStr = `[STEP] Analyzing Code | ${functionArgs.filePath} [/STEP]`;
      } else if (tc.name === 'run_command') {
        stepStr = `[STEP] Running Command | ${functionArgs.command} [/STEP]`;
      } else if (tc.name === 'edit_file') {
        stepStr = `[STEP] Editing File | ${functionArgs.filePath} [/STEP]`;
      } else if (tc.name === 'create_file') {
        stepStr = `[STEP] Creating File | ${functionArgs.filePath} [/STEP]`;
      } else if (tc.name === 'multi_file_edit') {
        stepStr = `[STEP] Multi-File Edit | ${(functionArgs.changes || []).length} files [/STEP]`;
      } else if (tc.name === 'fuzzy_find_file') {
        stepStr = `[STEP] Searching Files | ${functionArgs.query} [/STEP]`;
      } else if (tc.name === 'search_symbol') {
        stepStr = `[STEP] Searching Symbol | ${functionArgs.query} [/STEP]`;
      } else if (tc.name === 'find_references') {
        stepStr = `[STEP] Finding References | ${functionArgs.symbolName} [/STEP]`;
      }

      if (stepStr) {
        onStep(stepStr);
      }

      const functionResponse = await executeTool(tc.name, functionArgs, workspaceRoot);

      if (tc.name === 'edit_file' || tc.name === 'multi_file_edit' || tc.name === 'run_command' || tc.name === 'create_file') {
        allProposals.push(functionResponse);
      }

      messages.push({
        tool_call_id: tc.id,
        role: 'tool',
        name: tc.name,
        content: functionResponse,
      });
    }

    // After first round of tool execution, switch to auto for subsequent calls
    toolChoice = 'auto';
  }

  // Safety Intervention: If forcing tools and no edit was proposed yet, nudge the AI
  if (forceTool && allProposals.length === 0) {
    messages.push({ role: 'user', content: 'You have analyzed the context but haven\'t proposed an edit yet. Please use the edit_file tool to implement the requested changes now.' });
    const retryResult = await streamCompletion(client, messages, tools, 'required', onToken);

    if (retryResult.toolCalls.length > 0) {
      const assistantMsg: any = { role: 'assistant', content: retryResult.content || null };
      assistantMsg.tool_calls = retryResult.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      messages.push(assistantMsg);

      for (const tc of retryResult.toolCalls) {
        let functionArgs: any = {};
        try {
          functionArgs = JSON.parse(tc.arguments);
        } catch { continue; }

        const functionResponse = await executeTool(tc.name, functionArgs, workspaceRoot);
        allProposals.push(functionResponse);

        messages.push({
          tool_call_id: tc.id,
          role: 'tool',
          name: tc.name,
          content: functionResponse,
        });
      }

      // Get final response after retry
      await streamCompletion(client, messages, tools, 'auto', onToken);
    }
  }

  // Stream any proposals that weren't already streamed as part of the AI's response
  for (const proposal of allProposals) {
    onToken('\n\n' + proposal);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Legacy non-streaming wrapper (kept for backward compatibility)
// ──────────────────────────────────────────────────────────────────────────────
export async function generateAIResponse(
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  context?: any,
  workspaceRoot?: string,
  model?: string,
  onStep?: (step: string) => void,
  pinnedFiles: string[] = [],
  images?: { base64: string; mimeType: string }[],
  modeRules?: string
): Promise<string> {
  let fullContent = '';
  const steps: string[] = [];

  await generateAIResponseStreaming(
    message,
    history,
    context,
    workspaceRoot,
    model,
    (token) => { fullContent += token; },
    (step) => { steps.push(step); if (onStep) onStep(step); },
    pinnedFiles,
    images,
    modeRules
  );

  // Prepend steps to the content
  if (steps.length > 0) {
    fullContent = steps.join('\n') + '\n\n' + fullContent;
  }

  return fullContent;
}
