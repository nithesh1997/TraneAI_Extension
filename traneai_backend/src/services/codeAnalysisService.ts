import { CodeExplanation } from '../types/index.js';

interface ExtractionResult {
  functions: string[];
  classes: string[];
  imports: string[];
  interfaces: string[];
  exports: string[];
}

function extractSymbols(content: string, language: string): ExtractionResult {
  const functions: string[] = [];
  const classes: string[] = [];
  const imports: string[] = [];
  const interfaces: string[] = [];
  const exports: string[] = [];

  if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
    const fnMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[\w<>, |[\]]*?)?\s*\{)/gm);
    for (const m of fnMatches) {
      const name = m[1] || m[2] || m[3];
      if (name && !['if', 'for', 'while', 'switch'].includes(name) && !functions.includes(name)) functions.push(name);
    }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) classes.push(m[1]); }
    const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/gm);
    for (const m of importMatches) { if (!imports.includes(m[1])) imports.push(m[1]); }
    const interfaceMatches = content.matchAll(/interface\s+(\w+)/gm);
    for (const m of interfaceMatches) { if (!interfaces.includes(m[1])) interfaces.push(m[1]); }
    const exportMatches = content.matchAll(/^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/gm);
    for (const m of exportMatches) { if (!exports.includes(m[1])) exports.push(m[1]); }
  } else if (language === 'python') {
    const fnMatches = content.matchAll(/def\s+(\w+)\s*\(/gm);
    for (const m of fnMatches) { if (!functions.includes(m[1])) functions.push(m[1]); }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) classes.push(m[1]); }
    const importMatches = content.matchAll(/(?:import|from)\s+([\w.]+)/gm);
    for (const m of importMatches) { if (!imports.includes(m[1])) imports.push(m[1]); }
  } else if (['java', 'csharp', 'cpp', 'c'].includes(language)) {
    const fnMatches = content.matchAll(/(?:public|private|protected|static|void|int|string|bool|double|float|async)[\s\w<>[\],]*?\s+(\w+)\s*\(/gm);
    for (const m of fnMatches) {
      const name = m[1];
      if (name && !['if', 'for', 'while'].includes(name) && !functions.includes(name)) functions.push(name);
    }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) classes.push(m[1]); }
  }
  return { functions: functions.slice(0, 15), classes: classes.slice(0, 10), imports: imports.slice(0, 12), interfaces: interfaces.slice(0, 8), exports: exports.slice(0, 10) };
}

function inferPurpose(content: string, functions: string[], classes: string[]): string {
  const lower = content.toLowerCase();
  if (classes.some(c => c.includes('Service'))) return 'This file provides a service that encapsulates business logic and data operations.';
  if (classes.some(c => c.includes('Component'))) return 'This file defines a UI component responsible for rendering a part of the user interface.';
  if (lower.includes('controller')) return 'This file acts as a controller, handling incoming requests and returning responses.';
  if (lower.includes('middleware')) return 'This file implements middleware that processes requests before they reach route handlers.';
  if (lower.includes('model') || lower.includes('schema')) return 'This file defines data models/schemas representing the application data structure.';
  if (lower.includes('route') || lower.includes('router')) return 'This file defines API routes/endpoints and maps them to handler functions.';
  if (lower.includes('test') || lower.includes('spec')) return 'This file contains unit tests for testing application logic.';
  if (lower.includes('store') || lower.includes('reducer') || lower.includes('action')) return 'This file manages application state.';
  if (classes.length > 0) return 'This file defines the [' + classes[0] + '] class which handles specific application logic.';
  if (functions.length > 0) return 'This file exports utility functions for ' + functions.slice(0, 3).join(', ') + '.';
  return 'This file contains application source code.';
}

function inferDataFlow(content: string, imports: string[]): string {
  const flow: string[] = [];
  if (imports.some(i => i.includes('express') || i.includes('http'))) flow.push('External HTTP requests come in via routes/controllers');
  if (imports.some(i => i.includes('@angular') || i.includes('react') || i.includes('vue'))) flow.push('User interactions trigger component lifecycle or event handlers');
  if (imports.some(i => i.includes('mongoose') || i.includes('prisma') || i.includes('typeorm'))) flow.push('Data is persisted to/retrieved from a database');
  if (imports.some(i => i.includes('service'))) flow.push('Data flows through service layers for business logic processing');
  if (imports.some(i => i.includes('store') || i.includes('ngrx') || i.includes('redux'))) flow.push('State changes are dispatched via actions and handled by reducers');
  if (content.includes('subscribe') || content.includes('pipe')) flow.push('Reactive streams (Observables) carry asynchronous data');
  if (content.includes('await') || content.includes('.then(')) flow.push('Asynchronous operations are handled via promises/async-await');
  if (content.includes('catch') || content.includes('try')) flow.push('Errors are caught and handled through error handling mechanisms');
  return flow.length > 0 ? flow.join('\n- ') : 'Standard synchronous data flow with function calls and returns.';
}

function inferDependencies(imports: string[]): Array<{ name: string; usage: string }> {
  return imports.map(imp => {
    let usage = 'imported module';
    if (imp.includes('@angular/core')) usage = 'Angular core framework';
    else if (imp.includes('@angular/')) usage = 'Angular module';
    else if (imp.includes('express')) usage = 'Express.js web framework';
    else if (imp.includes('mongoose')) usage = 'MongoDB database driver';
    else if (imp.includes('prisma')) usage = 'Prisma ORM';
    else if (imp.includes('typeorm')) usage = 'TypeORM';
    else if (imp.includes('rxjs')) usage = 'Reactive Extensions library';
    else if (imp.includes('react')) usage = 'React UI library';
    else if (imp.includes('vue')) usage = 'Vue.js framework';
    else if (imp.includes('jsonwebtoken')) usage = 'JWT authentication';
    else if (imp.includes('bcrypt')) usage = 'Password hashing';
    else if (imp.includes('dotenv')) usage = 'Environment variable management';
    else if (imp.includes('passport')) usage = 'Authentication middleware';
    else if (imp.includes('swagger')) usage = 'API documentation';
    else if (imp.startsWith('fs') || imp.startsWith('path') || imp.startsWith('http')) usage = 'Node.js built-in module';
    else usage = 'external library/module';
    return { name: imp, usage };
  });
}

function inferSideEffects(content: string): string[] {
  const effects: string[] = [];
  if (content.includes('console.log')) effects.push('Produces console output for debugging');
  if (content.includes('fs.writeFile') || content.includes('fs.writeFileSync')) effects.push('Modifies the filesystem (writes files)');
  if (content.includes('fs.unlink')) effects.push('Deletes files from the filesystem');
  if (content.includes('fetch(') || content.includes('axios.') || content.includes('http.')) effects.push('Makes external HTTP/API calls');
  if (content.includes('process.env')) effects.push('Reads environment variables for configuration');
  if (content.includes('process.exit')) effects.push('Can terminate the Node.js process');
  if (content.includes('setTimeout') || content.includes('setInterval')) effects.push('Schedules delayed/recurring execution');
  if (content.includes('res.send') || content.includes('res.json') || content.includes('res.write')) effects.push('Sends HTTP response to client');
  if (content.includes('throw')) effects.push('Can throw exceptions that propagate up the call stack');
  if (content.includes('exec(') || content.includes('spawn(')) effects.push('Executes child/subprocesses');
  return effects;
}

function inferArchitectureDecisions(content: string, imports: string[]): string[] {
  const decisions: string[] = [];
  if (imports.some(i => i.includes('@angular/core'))) decisions.push('Uses Angular framework with dependency injection');
  if (imports.some(i => i.includes('react'))) decisions.push('Uses React component-based UI architecture');
  if (imports.some(i => i.includes('vue'))) decisions.push('Uses Vue.js reactive component framework');
  if (imports.some(i => i.includes('express'))) decisions.push('Follows Express.js middleware pattern');
  if (content.includes('interface')) decisions.push('Uses interfaces for loose coupling');
  if (content.includes('@Injectable')) decisions.push('Uses dependency injection pattern');
  if (content.includes('extends ')) decisions.push('Uses inheritance for code reuse');
  if (content.includes('implements ')) decisions.push('Uses interface implementation pattern');
  if (content.includes('private ') || content.includes('public ')) decisions.push('Follows access modifier encapsulation');
  if (content.includes('async ') || content.includes('await ')) decisions.push('Uses async/await for asynchronous operations');
  if (content.includes('try') || content.includes('catch')) decisions.push('Implements try-catch error handling');
  return decisions;
}

function inferRecommendations(content: string, functions: string[], classes: string[], lineCount: number): string[] {
  const recs: string[] = [];
  if (lineCount > 300) recs.push('File is ' + lineCount + ' lines -- consider splitting into smaller modules');
  if (functions.length > 15) recs.push('File has ' + functions.length + ' functions -- consider grouping related functions into separate files');
  if (classes.length > 5) recs.push('File has ' + classes.length + ' classes -- consider one class per file');
  if (content.includes('any') && content.includes('typescript')) recs.push('Replace [any] types with specific interfaces/types for better type safety');
  if (content.includes('console.log') && lineCount > 100) recs.push('Replace console.log with a proper logging framework');
  if (content.includes('TODO')) recs.push('Resolve TODO comments for production readiness');
  if (content.includes('FIXME')) recs.push('Address FIXME comments which indicate known issues');
  if (!content.includes('try') && !content.includes('catch') && lineCount > 50) recs.push('Add error handling (try-catch) for robustness');
  if (content.includes('var ')) recs.push('Replace [var] with [const] or [let] for block scoping');
  if (recs.length === 0) recs.push('No significant issues detected -- code appears well-structured');
  return recs.slice(0, 8);
}

// Requirement 6: Advanced Explanations
export function generateDeepExplanation(fileName: string, language: string, content: string, lineCount: number): CodeExplanation {
  const { functions, classes, imports, interfaces, exports } = extractSymbols(content, language);
  return {
    purpose: inferPurpose(content, functions, classes),
    dataFlow: inferDataFlow(content, imports),
    dependencies: inferDependencies(imports),
    relatedFiles: [],
    sideEffects: inferSideEffects(content),
    architectureDecisions: inferArchitectureDecisions(content, imports),
    recommendations: inferRecommendations(content, functions, classes, lineCount),
  };
}

export function generateExplanation(fileName: string, language: string, content: string, lineCount: number): string {
  const { functions, classes, imports } = extractSymbols(content, language);
  const langLabel = language === 'typescriptreact' ? 'TypeScript (React)' : language === 'javascriptreact' ? 'JavaScript (React)' : language.charAt(0).toUpperCase() + language.slice(1);

  let response = '**File:** `' + fileName + '`\n**Language:** ' + langLabel + '\n**Lines:** ' + lineCount + '\n\n';
  if (classes.length > 0) response += '**Classes:**\n' + classes.map(c => '- `' + c + '`').join('\n') + '\n\n';
  if (functions.length > 0) response += '**Functions / Methods:**\n' + functions.map(f => '- `' + f + '`').join('\n') + '\n\n';
  if (imports.length > 0) response += '**Dependencies:**\n' + imports.map(i => '- `' + i + '`').join('\n') + '\n\n';
  if (content.trim().length === 0) response += '_The file appears to be empty._';
  else if (functions.length === 0 && classes.length === 0) response += '_No top-level functions or classes detected._';
  else response += 'This file defines **' + classes.length + ' class' + (classes.length !== 1 ? 'es' : '') + '** and **' + functions.length + ' function' + (functions.length !== 1 ? 's' : '') + '**.';
  return response;
}

// Requirement 6: Format deep explanation for quick actions
export function formatDeepExplanation(fileName: string, language: string, lineCount: number, explanation: CodeExplanation): string {
  const langLabel = language === 'typescriptreact' ? 'TypeScript (React)' : language === 'javascriptreact' ? 'JavaScript (React)' : language.charAt(0).toUpperCase() + language.slice(1);

  let response = '[ANALYSIS]\n' + explanation.purpose + '\n\n';
  response += '**File:** `' + fileName + '`\n**Language:** ' + langLabel + '\n**Lines:** ' + lineCount + '\n\n';
  response += '**Data Flow**\n' + explanation.dataFlow + '\n\n';

  if (explanation.dependencies.length > 0) {
    response += '**Dependencies**\n' + explanation.dependencies.map(d => '- `' + d.name + '` -- ' + d.usage).join('\n') + '\n\n';
  }
  if (explanation.sideEffects.length > 0) {
    response += '**Side Effects**\n' + explanation.sideEffects.map(s => '- ' + s).join('\n') + '\n\n';
  }
  if (explanation.architectureDecisions.length > 0) {
    response += '**Architecture Decisions**\n' + explanation.architectureDecisions.map(a => '- ' + a).join('\n') + '\n\n';
  }
  if (explanation.recommendations.length > 0) {
    response += '[RECOMMENDATIONS]\n' + explanation.recommendations.map(r => '- ' + r).join('\n');
  }
  return response;
}

export function generateReview(fileName: string, language: string, content: string, lineCount: number): string {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (content.includes('console.log') || content.includes('console.error') || content.includes('print(')) issues.push('Debug logging statements detected.');
  if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) issues.push('Unresolved TODO/FIXME/HACK comments found.');
  if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) issues.push('Possible hardcoded credentials detected.');
  if (content.includes('any') && ['typescript', 'typescriptreact'].includes(language)) issues.push('Usage of `any` type found.');
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(content)) issues.push('Empty or comment-only catch blocks detected.');
  if (content.includes('var ')) issues.push('Usage of `var` instead of `const`/`let`.');

  const { functions } = extractSymbols(content, language);
  if (lineCount > 300) suggestions.push('File is ' + lineCount + ' lines - consider splitting.');
  if (functions.length > 15) suggestions.push(functions.length + ' functions detected - consider grouping.');
  if (!content.includes('test') && !content.includes('spec')) suggestions.push('No test coverage detected.');

  let response = '**Code Review -- `' + fileName + '`**\n\n';
  if (issues.length > 0) response += '**Issues Found:**\n' + issues.map(i => '- ' + i).join('\n') + '\n\n';
  else response += '**Issues Found:** No obvious issues detected.\n\n';
  if (suggestions.length > 0) response += '**Suggestions:**\n' + suggestions.map(s => '- ' + s).join('\n') + '\n\n';
  response += '**Summary:** ' + lineCount + ' lines reviewed. ' + issues.length + ' issue' + (issues.length !== 1 ? 's' : '') + ', ' + suggestions.length + ' suggestion' + (suggestions.length !== 1 ? 's' : '') + '.';
  return response;
}

interface TestResult {
  text: string;
  code: string;
  language: string;
}

export function generateTests(fileName: string, language: string, content: string, lineCount: number): TestResult {
  const { functions, classes } = extractSymbols(content, language);
  const baseName = fileName.replace(/\.[^.]+$/, '');
  let testCode = '';
  let framework = '';
  let codeLanguage = language;

  if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
    framework = 'Jest';
    codeLanguage = language.includes('typescript') ? 'typescript' : 'javascript';
    const imports = classes.length > 0
      ? 'import { ' + [...classes, ...functions].slice(0, 5).join(', ') + ' } from \'./' + baseName + '\';'
      : 'import { ' + functions.slice(0, 5).join(', ') + ' } from \'./' + baseName + '\';';
    const testBlocks = functions.slice(0, 5).map(fn =>
      "  describe('" + fn + "', () => {\n    it('should work correctly', () => {\n      expect(" + fn + ").toBeDefined();\n    });\n  });"
    ).join('\n\n');
    testCode = '// ' + baseName + '.test.' + (codeLanguage === 'typescript' ? 'ts' : 'js') + '\n' + imports + '\n\ndescribe(\'' + baseName + '\', () => {\n' + (testBlocks || "  it('should be defined', () => {});") + '\n});';
  } else if (language === 'python') {
    framework = 'pytest';
    codeLanguage = 'python';
    const importLine = 'from ' + baseName + ' import ' + (functions.slice(0, 5).join(', ') || '*');
    const testFns = functions.slice(0, 5).map(fn => 'def test_' + fn + '():\n    assert ' + fn + ' is not None').join('\n\n');
    testCode = '# test_' + baseName + '.py\n' + importLine + '\n\n' + (testFns || 'def test_placeholder():\n    pass');
  } else if (language === 'java') {
    framework = 'JUnit 5';
    codeLanguage = 'java';
    const className = classes[0] ?? baseName;
    const testMethods = functions.slice(0, 5).map(fn => '  @Test\n  void test' + fn.charAt(0).toUpperCase() + fn.slice(1) + '() {}').join('\n\n');
    testCode = '// ' + className + 'Test.java\nimport org.junit.jupiter.api.Test;\n\nclass ' + className + 'Test {\n' + (testMethods || '  @Test\n  void testPlaceholder() {}') + '\n}';
  } else {
    return { text: '**Generate Unit Tests -- `' + fileName + '`**\n\nLanguage **' + language + '** not yet supported. Detected **' + functions.length + ' function' + (functions.length !== 1 ? 's' : '') + '**:\n' + functions.map(f => '- `' + f + '`').join('\n') || '_No functions detected._', code: '', language: '' };
  }
  return { text: '**Generated Unit Tests -- `' + fileName + '`** (' + framework + ')\n\nDetected **' + functions.length + ' function' + (functions.length !== 1 ? 's' : '') + '** and **' + classes.length + ' class' + (classes.length !== 1 ? 'es' : '') + '**.\n\n', code: testCode, language: codeLanguage };
}
