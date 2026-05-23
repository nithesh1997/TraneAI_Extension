import React from 'react';
import hljs from 'highlight.js';

/**
 * Helpers and constants for the InputArea component.
 * This file was created to split the code from InputArea.tsx (which had over 800 lines) 
 * to improve maintainability and readability.
 * It contains utility functions for code block detection, highlighting, as well as 
 * predefined models, skills, and context menu options.
 */

export interface CodeBlock {
	id: number;
	code: string;
}

export function detectAndHighlight(code: string): { language: string; html: string } {
	const hintLangs = ['typescript', 'javascript', 'python', 'html', 'json', 'css', 'sql', 'bash', 'yaml', 'go', 'rust', 'java', 'cpp', 'xml'];
	try {
		const result = hljs.highlightAuto(code, hintLangs);
		let lang = result.language || 'plaintext';
		if ((lang === 'javascript' || lang === 'typescript') && /import\s+React|<[A-Z][A-Za-z]+[\s/>]/.test(code)) {
			lang = 'typescriptreact';
		}
		return { language: lang, html: result.value };
	} catch (_) {
		return { language: 'plaintext', html: code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
	}
}

export function isLikelyCode(text: string): boolean {
	const lines = text.split('\n');
	if (lines.length < 2) return false;
	const codePatterns = [
		/^\s{2,}/,
		/[{}\[\]();]/,
		/=>/,
		/\bfunction\b|\bconst\b|\blet\b|\bvar\b|\bimport\b|\bexport\b|\bclass\b|\bdef\b|\breturn\b/,
		/\/\/|\/\*|\*\/|#\s/,
	];
	const matchedLines = lines.filter(line => codePatterns.some(p => p.test(line)));
	return matchedLines.length >= Math.max(2, lines.length * 0.3);
}

export const MODELS = [
	{ id: 'auto', name: 'Auto', icon: '⚡', canAttachFiles: true },
	{ id: 'zenflow', name: 'Zenflow', icon: '🌊', canAttachFiles: true },
	{ id: 'new-joiner', name: 'New Joiner', icon: '🧩', canAttachFiles: true },
	{ id: 'developers', name: 'Developers', icon: '💻', canAttachFiles: true },
	{ id: 'qa', name: 'QA', icon: '🧪', canAttachFiles: true },
	{ id: 'eva', name: 'EVA', icon: '🤖', canAttachFiles: true },
	{ id: 'automated-testing', name: 'Automated Testing', icon: '🔄', canAttachFiles: true },
];

export const SKILLS = [
	{ id: 'review', icon: '🔍' },
	{ id: 'styles', icon: '🎨' },
	{ id: 'code-review', icon: '🔍' },
	{ id: 'comprehensive-review', icon: '📋' },
	{ id: 'cross-review', icon: '🔀' },
	{ id: 'frontend-design', icon: '🎨' },
	{ id: 'init', icon: '🚀' },
	{ id: 'plan', icon: '📐' },
	{ id: 'playwright', icon: '🎭' },
	{ id: 'research', icon: '🔬' },
	{ id: 'skill-creator', icon: '⚙️' },
	{ id: 'morning-sunlight', icon: '☀️' },
	{ id: 'delayed-caffeine', icon: '☕' },
	{ id: 'deep-work', icon: '🧠' },
	{ id: 'habit-stacking', icon: '🧱' },
	{ id: 'nsdr', icon: '🧘' },
	{ id: 'evening-shutdown', icon: '🌙' },
];

export const MODE_SKILLS: Record<string, string[]> = {
	'auto': [],
	'new-joiner': ['init', 'plan', 'research'],
	'developers': ['review', 'styles', 'code-review', 'comprehensive-review', 'cross-review', 'frontend-design', 'init', 'plan', 'research', 'skill-creator'],
	'qa': ['playwright', 'research', 'comprehensive-review'],
	'eva': [],
	'automated-testing': ['playwright']
};

export const CONTEXT_OPTIONS = [
	{ 
		id: 'folders', 
		title: 'Folders', 
		description: 'Add all files in a folder to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M1.5 3.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1v-8.5z" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		)
	},
	{ 
		id: 'files', 
		title: 'Files', 
		description: 'Add a file to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M2.5 3.5a1 1 0 011-1h6.5l3.5 3.5v7.5a1 1 0 01-1 1h-9a1 1 0 01-1-1v-10z" stroke="currentColor" strokeWidth="1.2" />
				<path d="M10 2.5v3.5h3.5" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		)
	},
	{ 
		id: 'code', 
		title: 'Code', 
		description: 'Add code to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3l-2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		)
	},
	{ 
		id: 'prompts', 
		title: 'Prompts', 
		description: 'Add a saved prompt to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M8 1.5l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5zM12 8.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5zM4 10.5l.3 1 .1 1 .3-1 1-.3-1-.3-.3-1-.3 1-1 .3 1 .3z" fill="currentColor" />
			</svg>
		)
	},
];
