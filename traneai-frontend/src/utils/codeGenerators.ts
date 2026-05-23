/**
 * Utility functions for generating explanations, reviews, and test generation
 * from code inputs. These pure functions were extracted from ChatViewProvider.ts
 * to improve readability and separation of concerns.
 */

export function extractSymbols(content: string, language: string): { functions: string[], classes: string[], imports: string[] } {
	const functions: string[] = [];
	const classes: string[] = [];
	const imports: string[] = [];

	if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
		const fnMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[\w<>, |[\]]*?)?\s*\{)/gm);
		for (const m of fnMatches) {
			const name = m[1] || m[2] || m[3];
			if (name && name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch' && !functions.includes(name)) {
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
			if (name && name !== 'if' && name !== 'for' && name !== 'while' && !functions.includes(name)) {
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

	if (classes.length > 0) {
		response += `**Classes:**\n${classes.map(c => `- \`${c}\``).join('\n')}\n\n`;
	}
	if (functions.length > 0) {
		response += `**Functions / Methods:**\n${functions.map(f => `- \`${f}\``).join('\n')}\n\n`;
	}
	if (imports.length > 0) {
		response += `**Dependencies:**\n${imports.map(i => `- \`${i}\``).join('\n')}\n\n`;
	}

	if (content.trim().length === 0) {
		response += '_The file appears to be empty._';
	} else if (functions.length === 0 && classes.length === 0) {
		response += '_No top-level functions or classes detected. The file may contain configuration, styles, or data definitions._';
	} else {
		response += `This file defines **${classes.length} class${classes.length !== 1 ? 'es' : ''}** and **${functions.length} function${functions.length !== 1 ? 's' : ''}**. Review the symbols above to understand its responsibilities.`;
	}

	return response;
}

export function generateReview(fileName: string, language: string, content: string, lineCount: number): string {
	const issues: string[] = [];
	const suggestions: string[] = [];

	if (content.includes('console.log') || content.includes('console.error') || content.includes('print(')) {
		issues.push('Debug logging statements detected — consider removing before production.');
	}
	if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
		issues.push('Unresolved `TODO` / `FIXME` / `HACK` comments found in the code.');
	}
	if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) {
		issues.push('Possible hardcoded credentials or secrets detected — use environment variables instead.');
	}
	if (content.includes('any') && ['typescript', 'typescriptreact'].includes(language)) {
		issues.push('Usage of `any` type found — prefer explicit types for better type safety.');
	}
	if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(content)) {
		issues.push('Empty or comment-only `catch` blocks detected — ensure errors are handled or logged.');
	}

	const { functions } = extractSymbols(content, language);
	if (lineCount > 300) {
		suggestions.push(`File is **${lineCount} lines** — consider splitting into smaller, focused modules.`);
	}
	if (functions.length > 15) {
		suggestions.push(`**${functions.length} functions** detected — consider grouping related logic into classes or separate files.`);
	}
	if (!content.includes('test') && !content.includes('spec') && !content.includes('describe')) {
		suggestions.push('No test coverage detected in this file — consider adding unit tests.');
	}

	let response = `**Code Review — \`${fileName}\`**\n\n`;

	if (issues.length > 0) {
		response += `**Issues Found:**\n${issues.map(i => `- ⚠️ ${i}`).join('\n')}\n\n`;
	} else {
		response += `**Issues Found:** ✅ No obvious issues detected.\n\n`;
	}

	if (suggestions.length > 0) {
		response += `**Suggestions:**\n${suggestions.map(s => `- 💡 ${s}`).join('\n')}\n\n`;
	}

	response += `**Summary:** ${lineCount} lines of ${language} code reviewed. ${issues.length} issue${issues.length !== 1 ? 's' : ''} and ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found.`;

	return response;
}

export function generateTests(fileName: string, language: string, content: string, lineCount: number): string {
	const { functions, classes } = extractSymbols(content, language);
	const baseName = fileName.replace(/\.[^.]+$/, '');

	let testCode = '';
	let framework = '';

	if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
		framework = 'Jest';
		const ext = language.startsWith('typescript') ? 'ts' : 'js';
		const imports = classes.length > 0
			? `import { ${[...classes, ...functions].slice(0, 5).join(', ')} } from './${baseName}';`
			: `import { ${functions.slice(0, 5).join(', ')} } from './${baseName}';`;

		const testBlocks = functions.slice(0, 5).map(fn => `  describe('${fn}', () => {\n    it('should work correctly', () => {\n      // TODO: implement test\n      expect(${fn}).toBeDefined();\n    });\n  });`).join('\n\n');

		testCode = `// ${baseName}.test.${ext}\n${imports}\n\ndescribe('${baseName}', () => {\n${testBlocks || '  it(\'should be defined\', () => {\n    // TODO: implement test\n  });'}\n});`;
	} else if (language === 'python') {
		framework = 'pytest';
		const importLine = `from ${baseName} import ${functions.slice(0, 5).join(', ') || '*'}`;
		const testFns = functions.slice(0, 5).map(fn => `def test_${fn}():\n    # TODO: implement test\n    assert ${fn} is not None`).join('\n\n');
		testCode = `# test_${baseName}.py\n${importLine}\n\n${testFns || 'def test_placeholder():\n    # TODO: implement test\n    pass'}`;
	} else if (language === 'java') {
		framework = 'JUnit 5';
		const className = classes[0] ?? baseName;
		const testMethods = functions.slice(0, 5).map(fn => `  @Test\n  void test${fn.charAt(0).toUpperCase() + fn.slice(1)}() {\n    // TODO: implement test\n  }`).join('\n\n');
		testCode = `// ${className}Test.java\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${className}Test {\n${testMethods || '  @Test\n  void testPlaceholder() {\n    // TODO: implement test\n  }'}\n}`;
	} else {
		return `**Generate Unit Tests — \`${fileName}\`**\n\nUnit test generation for **${language}** is not yet supported. Detected **${functions.length} function${functions.length !== 1 ? 's' : ''}**:\n${functions.map(f => `- \`${f}\``).join('\n') || '_No functions detected._'}`;
	}

	let response = `**Generated Unit Tests — \`${fileName}\`** (${framework})\n\n`;
	response += `Detected **${functions.length} function${functions.length !== 1 ? 's' : ''}** and **${classes.length} class${classes.length !== 1 ? 'es' : ''}**.\n\n`;
	response += `\`\`\`${language}\n${testCode}\n\`\`\`\n\n`;
	response += `_Tests generated as stubs — fill in the assertions and edge cases based on your implementation._`;

	return response;
}
