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
      let functionArgs: any = {};
      try {
        functionArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        console.warn('[aiService] Failed to parse tool arguments for', functionName, toolCall.function.arguments);
        continue;
      }
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
      } else if (functionName === 'search_symbol') {
        functionResponse = await searchBySymbol(functionArgs.query, workspaceRoot);
      } else if (functionName === 'find_references') {
        functionResponse = await findReferences(functionArgs.symbolName, workspaceRoot);
      } else if (functionName === 'investigate_error') {
        const investigator = workspaceRoot ? errorInvestigators.get(workspaceRoot) : undefined;
        if (investigator) {
          const analysis = investigator.analyzeError(functionArgs.errorMessage);
          functionResponse = '## Error Investigation\n\n**Error:** ' + analysis.errorMessage + '\n**Root Cause:** ' + analysis.rootCause + '\n**Source File:** ' + analysis.sourceFile + ':' + analysis.sourceLine + '\n**Affected Files:** ' + analysis.impactedFiles.join(', ') + '\n\n**Fix Proposal:**\n' + analysis.fixProposal;
        } else {
          functionResponse = 'Error investigator not initialized. Workspace root required.';
        }
      } else if (functionName === 'get_architecture') {
        const analyzer = workspaceRoot ? architectureAnalyzers.get(workspaceRoot) : undefined;
        if (analyzer) {
          const detail = functionArgs.detail || 'overview';
          functionResponse = detail === 'components' ? analyzer.getComponentMap() : analyzer.getArchitectureOverview();
        } else {
          functionResponse = 'Architecture analyzer not initialized.';
        }
      } else if (functionName === 'analyze_impact') {
        const analyzer = workspaceRoot ? impactAnalyzers.get(workspaceRoot) : undefined;
        if (analyzer) {
          const impact = analyzer.analyzeImpact(functionArgs.filePath, functionArgs.symbolName || 'changes');
          functionResponse = '## Impact Analysis\n\n**File:** ' + impact.primaryFile + '\n**Risk Level:** ' + impact.riskLevel + '\n**Affected Files (' + impact.affectedFiles.length + '):**\n' + impact.affectedFiles.map(f => '- `' + f.filePath + '` (' + f.impactType + ') -- ' + f.summary).join('\n') + '\n\n**Recommendation:** ' + impact.recommendation;
        } else {
          functionResponse = 'Impact analyzer not initialized.';
        }
      } else if (functionName === 'explain_code_deeply') {
        const codeAnalysis = await analyzeCode(functionArgs.filePath, workspaceRoot);
        functionResponse = '## Deep Code Explanation\n\n' + codeAnalysis;
      }

      if (functionName === 'edit_file' || functionName === 'multi_file_edit' || functionName === 'run_command') {
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


