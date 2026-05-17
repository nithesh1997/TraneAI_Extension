import * as vscode from 'vscode';

export interface CodeSymbol {
	name: string;
	kind: vscode.SymbolKind;
	detail?: string;
	range: vscode.Range;
	children?: CodeSymbol[];
}

export interface FileAnalysis {
	filePath: string;
	language: string;
	lineCount: number;
	symbols: CodeSymbol[];
	functions: string[];
	classes: string[];
	imports: string[];
	diagnostics: string[];
	references: number;
}

export interface AnalysisResult {
	success: boolean;
	analysis?: FileAnalysis;
	error?: string;
}

export async function analyzeFileWithLSP(uri: vscode.Uri): Promise<AnalysisResult> {
	try {
		const doc = await vscode.workspace.openTextDocument(uri);
		const content = doc.getText();
		const language = doc.languageId;
		const lineCount = doc.lineCount;
		
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			uri
		) || [];
		
		const functions: string[] = [];
		const classes: string[] = [];
		
		function extractSymbols(syms: vscode.DocumentSymbol[], depth: number = 0) {
			if (depth > 3) return;
			
			for (const sym of syms) {
				const kind = sym.kind;
				if (kind === vscode.SymbolKind.Function || kind === vscode.SymbolKind.Method) {
					functions.push(sym.name);
				} else if (kind === vscode.SymbolKind.Class || kind === vscode.SymbolKind.Interface) {
					classes.push(sym.name);
				}
				
				if (sym.children && sym.children.length > 0) {
					extractSymbols(sym.children, depth + 1);
				}
			}
		}
		
		extractSymbols(symbols);
		
		const diagnostics = vscode.languages.getDiagnostics(uri)
			.map(d => `${d.severity === vscode.DiagnosticSeverity.Error ? '❌' : d.severity === vscode.DiagnosticSeverity.Warning ? '⚠️' : 'ℹ️'} ${d.message}`)
			.slice(0, 10);
		
		const imports = extractImports(content, language);
		
		return {
			success: true,
			analysis: {
				filePath: uri.fsPath,
				language,
				lineCount,
				symbols: symbols.map(s => ({
					name: s.name,
					kind: s.kind,
					detail: s.detail,
					range: s.range,
					children: []
				})),
				functions: [...new Set(functions)].slice(0, 20),
				classes: [...new Set(classes)].slice(0, 10),
				imports,
				diagnostics,
				references: symbols.reduce((acc, s) => acc + (s.children?.length || 0), 0)
			}
		};
	} catch (error: any) {
		return { success: false, error: error.message || 'Analysis failed' };
	}
}

function extractImports(content: string, language: string): string[] {
	const imports: string[] = [];
	
	if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
		const matches = content.matchAll(/import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g);
		for (const m of matches) {
			if (!imports.includes(m[1])) imports.push(m[1]);
		}
	} else if (language === 'python') {
		const matches = content.matchAll(/(?:from\s+(\S+)\s+import|import\s+(\S+))/g);
		for (const m of matches) {
			const imp = m[1] || m[2];
			if (imp && !imports.includes(imp)) imports.push(imp);
		}
	} else if (language === 'java') {
		const matches = content.matchAll(/import\s+([\w.]+);/g);
		for (const m of matches) {
			if (!imports.includes(m[1])) imports.push(m[1]);
		}
	}
	
	return imports.slice(0, 15);
}

export async function findReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
	try {
		const refs = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeReferenceProvider',
			uri,
			position
		);
		return refs || [];
	} catch {
		return [];
	}
}

export async function getCodeActions(uri: vscode.Uri, range: vscode.Range): Promise<vscode.CodeAction[]> {
	try {
		const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
			'vscode.executeCodeActionProvider',
			uri,
			range
		);
		return actions || [];
	} catch {
		return [];
	}
}

export async function formatDocument(uri: vscode.Uri): Promise<boolean> {
	try {
		const doc = await vscode.workspace.openTextDocument(uri);
		await doc.save();
		await vscode.commands.executeCommand('editor.action.formatDocument');
		return true;
	} catch {
		return false;
	}
}

export async function getDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location | null> {
	try {
		const def = await vscode.commands.executeCommand<vscode.Location | vscode.Location[]>(
			'vscode.executeDefinitionProvider',
			uri,
			position
		);
		if (def && Array.isArray(def)) return def[0] || null;
		if (def) return def as vscode.Location;
		return null;
	} catch {
		return null;
	}
}

export async function getHoverInfo(uri: vscode.Uri, position: vscode.Position): Promise<string | null> {
	try {
		const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
			'vscode.executeHoverProvider',
			uri,
			position
		);
		if (hover && hover.length > 0) {
			return hover[0].contents.map(c => {
				if (typeof c === 'string') return c;
				return c.value;
			}).join('\n');
		}
		return null;
	} catch {
		return null;
	}
}

export function generateAnalysisMarkdown(analysis: FileAnalysis): string {
	let md = `**📄 File:** \`${analysis.filePath.split(/[\\/]/).pop()}\`\n`;
	md += `**🗣️ Language:** ${analysis.language}\n`;
	md += `**📝 Lines:** ${analysis.lineCount}\n\n`;
	
	if (analysis.diagnostics.length > 0) {
		md += `### ⚠️ Diagnostics\n`;
		md += analysis.diagnostics.map(d => `- ${d}`).join('\n') + '\n\n';
	}
	
	if (analysis.classes.length > 0) {
		md += `### 🏗️ Classes & Interfaces\n`;
		md += analysis.classes.map(c => `- \`${c}\``).join('\n') + '\n\n';
	}
	
	if (analysis.functions.length > 0) {
		md += `### ⚡ Functions & Methods\n`;
		md += analysis.functions.slice(0, 15).map(f => `- \`${f}\``).join('\n');
		if (analysis.functions.length > 15) {
			md += `\n_...and ${analysis.functions.length - 15} more_`;
		}
		md += '\n\n';
	}
	
	if (analysis.imports.length > 0) {
		md += `### 📦 Dependencies\n`;
		md += analysis.imports.map(i => `- \`${i}\``).join('\n') + '\n\n';
	}
	
	md += `**Summary:** ${analysis.classes.length} class${analysis.classes.length !== 1 ? 'es' : ''}, ${analysis.functions.length} function${analysis.functions.length !== 1 ? 's' : ''}, ${analysis.references} references.`;
	
	return md;
}

export function generateReviewMarkdown(analysis: FileAnalysis, content: string): string {
	const issues: string[] = [];
	const suggestions: string[] = [];
	
	if (content.includes('console.log') || content.includes('console.error') || content.includes('print(')) {
		issues.push('Debug logging statements detected — consider removing before production.');
	}
	if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
		issues.push('Unresolved TODO/FIXME/HACK comments found in the code.');
	}
	if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) {
		issues.push('Possible hardcoded credentials or secrets detected — use environment variables instead.');
	}
	if (content.includes('any') && ['typescript', 'typescriptreact'].includes(analysis.language)) {
		issues.push('Usage of `any` type found — prefer explicit types for better type safety.');
	}
	if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
		issues.push('Empty catch blocks detected — ensure errors are handled or logged.');
	}
	
	if (analysis.lineCount > 300) {
		suggestions.push(`File is **${analysis.lineCount} lines** — consider splitting into smaller modules.`);
	}
	if (analysis.functions.length > 15) {
		suggestions.push(`**${analysis.functions.length} functions** detected — consider grouping related logic.`);
	}
	if (analysis.diagnostics.length > 0) {
		suggestions.push(`**${analysis.diagnostics.length} diagnostic${analysis.diagnostics.length !== 1 ? 's' : ''}** found — fix to improve code quality.`);
	}
	
	let md = `**🔍 Code Review — \`${analysis.filePath.split(/[\\/]/).pop()}\`**\n\n`;
	
	if (issues.length > 0) {
		md += `### Issues Found:\n${issues.map(i => `- ⚠️ ${i}`).join('\n')}\n\n`;
	} else {
		md += `### ✅ No obvious issues detected.\n\n`;
	}
	
	if (suggestions.length > 0) {
		md += `### Suggestions:\n${suggestions.map(s => `- 💡 ${s}`).join('\n')}\n\n`;
	}
	
	md += `**Summary:** ${analysis.lineCount} lines reviewed. ${issues.length} issue${issues.length !== 1 ? 's' : ''}, ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}.`;
	
	return md;
}

export function generateTestsMarkdown(analysis: FileAnalysis, language: string): { text: string; code: string } {
	const baseName = analysis.filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'test';
	
	let testCode = '';
	let framework = '';
	let codeLang = language;
	
	if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
		framework = 'Jest';
		codeLang = language.includes('typescript') ? 'typescript' : 'javascript';
		
		const testImports = analysis.classes.length > 0
			? `import { ${[...analysis.classes, ...analysis.functions].slice(0, 5).join(', ')} } from './${baseName}';`
			: `import { ${analysis.functions.slice(0, 5).join(', ')} } from './${baseName}';`;
		
		const testBlocks = analysis.functions.slice(0, 5).map(fn =>
			`  describe('${fn}', () => {
    it('should work correctly', () => {
      expect(${fn}).toBeDefined();
    });
  });`
		).join('\n\n');
		
		const ext = codeLang === 'typescript' ? 'ts' : 'js';
		testCode = `// ${baseName}.test.${ext}
${testImports}

describe('${baseName}', () => {
${testBlocks || "  it('should be defined', () => {\n    expect(true).toBe(true);\n  });"}
});`;
	} else if (language === 'python') {
		framework = 'pytest';
		const importLine = `from ${baseName} import ${analysis.functions.slice(0, 5).join(', ') || '*'}`;
		const testFns = analysis.functions.slice(0, 5).map(fn =>
			`def test_${fn}():\n    assert ${fn} is not None`
		).join('\n\n');
		
		testCode = `# test_${baseName}.py
${importLine}

${testFns || 'def test_placeholder():\n    pass'}`;
	} else if (language === 'java') {
		framework = 'JUnit 5';
		const className = analysis.classes[0] ?? baseName;
		const testMethods = analysis.functions.slice(0, 5).map(fn =>
			`  @Test\n  void test${fn.charAt(0).toUpperCase() + fn.slice(1)}() {}`
		).join('\n\n');
		
		testCode = `// ${className}Test.java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className}Test {
${testMethods || '  @Test\n  void testPlaceholder() {}'}
}`;
	}
	
	const text = `**🧪 Generated Unit Tests — \`${analysis.filePath.split(/[\\/]/).pop()}\`** (${framework})\n\n` +
		`Detected **${analysis.functions.length} function${analysis.functions.length !== 1 ? 's' : ''}** and **${analysis.classes.length} class${analysis.classes.length !== 1 ? 'es' : ''}**.\n\n` +
		(testCode ? `\`\`\`${codeLang}\n${testCode}\n\`\`\`` : `_No test framework available for ${language}_`);
	
	return { text, code: testCode };
}