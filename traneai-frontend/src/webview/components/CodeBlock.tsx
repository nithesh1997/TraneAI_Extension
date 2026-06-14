import React from 'react';

import hljs from 'highlight.js';

type CodeBlockProps = {
	code: string;
	language?: string;
	/** If true, uses the exact visual treatment from the input editor palette */
	variant?: 'palette' | 'md';
};

const normalizeLanguage = (lang?: string) => {
	const l = (lang || '').trim();
	if (!l) return 'plaintext';
	return l.toLowerCase();
};

const escapeHtml = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '<')
		.replace(/>/g, '>')
		.replace(/"/g, '"')
		.replace(/'/g, '&#039;');

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, variant = 'palette' }) => {
	const lang = normalizeLanguage(language);

	// highlight.js works with plain code and outputs HTML spans.
	// If language is unknown, fall back to auto.
	let highlighted = '';
	try {
		if (hljs.getLanguage(lang)) {
			highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
		} else {
			highlighted = hljs.highlightAuto(code).value;
		}
	} catch {
		highlighted = escapeHtml(code);
	}

	// We intentionally re-use the same DOM/classnames as InputArea's code palette
	// so existing styles in _input.scss apply in chat too.
	return (
		<div className={variant === 'palette' ? 'code-palette' : 'md-code-block'}>
			<div className={variant === 'palette' ? 'code-palette-header' : 'md-code-header'}>
				<span className={variant === 'palette' ? 'code-palette-lang' : 'md-code-lang'}>
					{lang}
				</span>
			</div>
			<div className={variant === 'palette' ? 'code-palette-body' : undefined}>
				<pre>
					<code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
				</pre>
			</div>
		</div>
	);
};

