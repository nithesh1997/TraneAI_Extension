interface ExtractionResult {
  functions: string[];
  classes: string[];
  imports: string[];
}

function extractSymbols(content: string, language: string): ExtractionResult {
  const functions: string[] = [];
  const classes: string[] = [];
  const imports: string[] = [];

  if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
    const fnMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[\w<>, |[\]]*?)?\s*\{)/gm);
    for (const m of fnMatches) {
      const name = m[1] || m[2] || m[3];
      if (name && !['if', 'for', 'while', 'switch'].includes(name) && !functions.includes(name)) {
        functions.push(name);
      }
    }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
    const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/gm);
    for (const m of importMatches) { if (!imports.includes(m[1])) { imports.push(m[1]); } }
  } else if (language === 'python') {
    const fnMatches = content.matchAll(/def\s+(\w+)\s*\(/gm);
    for (const m of fnMatches) { if (!functions.includes(m[1])) { functions.push(m[1]); } }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
    const importMatches = content.matchAll(/(?:import|from)\s+([\w.]+)/gm);
    for (const m of importMatches) { if (!imports.includes(m[1])) { imports.push(m[1]); } }
  } else if (['java', 'csharp', 'cpp', 'c'].includes(language)) {
    const fnMatches = content.matchAll(/(?:public|private|protected|static|void|int|string|bool|double|float|async)[\s\w<>[\],]*?\s+(\w+)\s*\(/gm);
    for (const m of fnMatches) {
      const name = m[1];
      if (name && !['if', 'for', 'while'].includes(name) && !functions.includes(name)) {
        functions.push(name);
      }
    }
    const classMatches = content.matchAll(/class\s+(\w+)/gm);
    for (const m of classMatches) { if (!classes.includes(m[1])) { classes.push(m[1]); } }
  }

  return { functions: functions.slice(0, 10), classes: classes.slice(0, 5), imports: imports.slice(0, 8) };
}

export function generateExplanation(fileName: string, language: string, content: string, lineCount: number): string {
  const { functions, classes, imports } = extractSymbols(content, language);
  const langLabel = language === 'typescriptreact' ? 'TypeScript (React)' : language === 'javascriptreact' ? 'JavaScript (React)' : language.charAt(0).toUpperCase() + language.slice(1);

  let response = `**File:** \`${fileName}\`\n**Language:** ${langLabel}\n**Lines:** ${lineCount}\n\n`;

  if (classes.length > 0) response += `**Classes:**\n${classes.map(c => `- \`${c}\``).join('\n')}\n\n`;
  if (functions.length > 0) response += `**Functions / Methods:**\n${functions.map(f => `- \`${f}\``).join('\n')}\n\n`;
  if (imports.length > 0) response += `**Dependencies:**\n${imports.map(i => `- \`${i}\``).join('\n')}\n\n`;

  if (content.trim().length === 0) {
    response += '_The file appears to be empty._';
  } else if (functions.length === 0 && classes.length === 0) {
    response += '_No top-level functions or classes detected._';
  } else {
    response += `This file defines **${classes.length} class${classes.length !== 1 ? 'es' : ''}** and **${functions.length} function${functions.length !== 1 ? 's' : ''}**.`;
  }

  return response;
}

export function generateReview(fileName: string, language: string, content: string, lineCount: number): string {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (content.includes('console.log') || content.includes('console.error') || content.includes('print(')) {
    issues.push('Debug logging statements detected.');
  }
  if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
    issues.push('Unresolved TODO/FIXME/HACK comments found.');
  }
  if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) {
    issues.push('Possible hardcoded credentials detected.');
  }
  if (content.includes('any') && ['typescript', 'typescriptreact'].includes(language)) {
    issues.push('Usage of `any` type found.');
  }
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(content)) {
    issues.push('Empty or comment-only catch blocks detected.');
  }

  const { functions } = extractSymbols(content, language);
  if (lineCount > 300) suggestions.push(`File is ${lineCount} lines — consider splitting.`);
  if (functions.length > 15) suggestions.push(`${functions.length} functions detected — consider grouping.`);
  if (!content.includes('test') && !content.includes('spec')) suggestions.push('No test coverage detected.');

  let response = `**Code Review — \`${fileName}\`**\n\n`;
  if (issues.length > 0) response += `**Issues Found:**\n${issues.map(i => `- ⚠️ ${i}`).join('\n')}\n\n`;
  else response += `**Issues Found:** ✅ No obvious issues detected.\n\n`;

  if (suggestions.length > 0) response += `**Suggestions:**\n${suggestions.map(s => `- 💡 ${s}`).join('\n')}\n\n`;
  response += `**Summary:** ${lineCount} lines reviewed. ${issues.length} issue${issues.length !== 1 ? 's' : ''}, ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}.`;

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
      ? `import { ${[...classes, ...functions].slice(0, 5).join(', ')} } from './${baseName}';`
      : `import { ${functions.slice(0, 5).join(', ')} } from './${baseName}';`;

    const testBlocks = functions.slice(0, 5).map(fn =>
      `  describe('${fn}', () => {\n    it('should work correctly', () => {\n      expect(${fn}).toBeDefined();\n    });\n  });`
    ).join('\n\n');

    testCode = `// ${baseName}.test.${codeLanguage === 'typescript' ? 'ts' : 'js'}\n${imports}\n\ndescribe('${baseName}', () => {\n${testBlocks || '  it(\'should be defined\', () => {});'}\n});`;
  } else if (language === 'python') {
    framework = 'pytest';
    codeLanguage = 'python';
    const importLine = `from ${baseName} import ${functions.slice(0, 5).join(', ') || '*'}`;
    const testFns = functions.slice(0, 5).map(fn =>
      `def test_${fn}():\n    assert ${fn} is not None`
    ).join('\n\n');
    testCode = `# test_${baseName}.py\n${importLine}\n\n${testFns || 'def test_placeholder():\n    pass'}`;
  } else if (language === 'java') {
    framework = 'JUnit 5';
    codeLanguage = 'java';
    const className = classes[0] ?? baseName;
    const testMethods = functions.slice(0, 5).map(fn =>
      `  @Test\n  void test${fn.charAt(0).toUpperCase() + fn.slice(1)}() {}`
    ).join('\n\n');
    testCode = `// ${className}Test.java\nimport org.junit.jupiter.api.Test;\n\nclass ${className}Test {\n${testMethods || '  @Test\n  void testPlaceholder() {}'}\n}`;
  } else {
    return {
      text: `**Generate Unit Tests — \`${fileName}\`**\n\nLanguage **${language}** not yet supported. Detected **${functions.length} function${functions.length !== 1 ? 's' : ''}**:\n${functions.map(f => `- \`${f}\``).join('\n') || '_No functions detected._'}`,
      code: '',
      language: ''
    };
  }

  return {
    text: `**Generated Unit Tests — \`${fileName}\`** (${framework})\n\nDetected **${functions.length} function${functions.length !== 1 ? 's' : ''}** and **${classes.length} class${classes.length !== 1 ? 'es' : ''}**.\n\n`,
    code: testCode,
    language: codeLanguage
  };
}