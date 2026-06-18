import React from 'react';

export interface EditProposal {
  filePath: string;
  oldContent: string;
  newContent: string;
}

type MessagePart =
  | { type: 'markdown'; content: string }
  | { type: 'think'; content: string; isStreaming?: boolean }
  | { type: 'command'; cmd: string; status: string; output: string; duration?: number }
  | { type: 'actionStep'; label: string; detail?: string; status: 'pending' | 'success' | 'error' }
  | { type: 'editProposal'; edit: EditProposal }
  | { type: 'multiEditProposal'; edits: EditProposal[] }
  | { type: 'plan'; steps: { text: string; completed: boolean }[] }
  | { type: 'choice'; choices: string[]; placeholder?: string; command?: string }
  | { type: 'consoleLogs'; logs: { type: string; text: string }[] };

// --- Helpers ---

const getFileIcon = (filePath: string) => {
	const ext = filePath.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'tsx':
		case 'jsx':
			return <span className="file-icon react-icon">⚛️</span>;
		case 'ts':
		case 'js':
			return <span className="file-icon ts-icon">TS</span>;
		case 'scss':
		case 'css':
		case 'sass':
			return <span className="file-icon style-icon">🎨</span>;
		case 'html':
			return <span className="file-icon html-icon">HTML</span>;
		case 'json':
			return <span className="file-icon json-icon">{}</span>;
		case 'md':
			return <span className="file-icon md-icon">M↓</span>;
		default:
			return <span className="file-icon">📄</span>;
	}
};

const computeLineDiff = (oldContent: string, newContent: string) => {
	// Clean up any leaked tags or markdown residue aggressively
	const cleanTags = (t: string) => t
		.replace(/\[EDIT_PROPOSAL\]|\[END_EDIT\]/g, '')
		.replace(/file: .*?(\r?\n|$)/g, '')
		.replace(/old: \|(\r?\n|$)/g, '')
		.replace(/new: \|(\r?\n|$)/g, '')
		.replace(/status: .*?(\r?\n|$)/g, '')
		.replace(/message: .*?(\r?\n|$)/g, '')
		.replace(/^```(\w+)?(\r?\n|$)/gm, '')
		.replace(/```$/gm, '')
		.trim();

	const cleanOld = cleanTags(oldContent);
	const cleanNew = cleanTags(newContent);

	const oldLines = cleanOld.split('\n');
	const newLines = cleanNew.split('\n');
	const result: { type: 'unchanged' | 'removed' | 'added'; content: string; oldLineNum?: number; newLineNum?: number }[] = [];
	
	let i = 0;
	let j = 0;
	
	while (i < oldLines.length || j < newLines.length) {
		if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
			result.push({ type: 'unchanged', content: oldLines[i], oldLineNum: i + 1, newLineNum: j + 1 });
			i++;
			j++;
		} else {
			const nextMatchInNew = j < newLines.length ? newLines.indexOf(oldLines[i], j) : -1;
			if (i < oldLines.length && (nextMatchInNew === -1 || nextMatchInNew > j + 5)) {
				result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
				i++;
			} else if (j < newLines.length) {
				result.push({ type: 'added', content: newLines[j], newLineNum: j + 1 });
				j++;
			} else if (i < oldLines.length) {
				result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
				i++;
			}
		}
	}
	
	return { lines: result };
};

const ModernDiffView: React.FC<{
	filePath: string;
	oldContent: string;
	newContent: string;
	onCopy: (text: string) => void;
}> = ({ filePath, oldContent, newContent, onCopy }) => {
	const [isExpanded, setIsExpanded] = React.useState(true);
	const [copied, setCopied] = React.useState(false);
	const diff = React.useMemo(() => computeLineDiff(oldContent, newContent), [oldContent, newContent]);
	const ext = filePath.split('.').pop()?.toUpperCase() || 'FILE';
	
	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		const newVersion = diff.lines
			.filter(l => l.type !== 'removed')
			.map(l => l.content)
			.join('\n');
		onCopy(newVersion);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className={`modern-diff-view ${!isExpanded ? 'collapsed' : ''}`}>
			<div className="modern-diff-header" onClick={() => setIsExpanded(!isExpanded)}>
				<div className="modern-diff-file-info">
					{getFileIcon(filePath)}
					<span className="modern-diff-filename">{ext}</span>
				</div>
				<div className="modern-diff-actions">
					<button className={`modern-diff-action-btn copy-btn ${copied ? 'copied' : ''}`} title="Copy new version" onClick={handleCopy}>
						<span className="icon">{copied ? '✓' : '📋'}</span>
						{copied && <span className="copied-text">Copied!</span>}
					</button>
					<button className="modern-diff-action-btn" title={isExpanded ? "Collapse" : "Expand"}>
						<span className="icon">{isExpanded ? '↕️' : '↔️'}</span>
					</button>
				</div>
			</div>
			{isExpanded && (
				<div className="modern-diff-content">
					<div className="modern-diff-hunk-header">
						@@ -1,1 +1,1 @@
					</div>
					{diff.lines.map((line, i) => (
						<div key={i} className={`modern-diff-line ${line.type}`}>
							<span className="modern-diff-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
							<pre className="modern-diff-code">{line.content}</pre>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

const formatWhatsAppTime = (ts: number): string => {
	const now = new Date();
	const date = new Date(ts);
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const yesterdayStart = todayStart - 86400000;

	if (ts >= todayStart) {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
	if (ts >= yesterdayStart) {
		return 'Yesterday';
	}
	if (date.getFullYear() === now.getFullYear()) {
		return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}
	return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const getNameFromEmail = (email: string | null | undefined): string => {
	if (!email) return 'User';
	const local = email.split('@')[0];
	const name = local.split(/[._-]/)[0];
	return name.charAt(0).toUpperCase() + name.slice(1);
};

const processInlineMarkdown = (text: string): string => {
	return text
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/@(\w[\w-]*)/g, '<span class="neo-mention">@$1</span>')
		.replace(/\n/g, '<br/>');
};

const renderMarkdown = (text: string): string => {
	const parts: string[] = [];
	const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
	let lastIndex = 0;
	let match;

	while ((match = codeBlockRegex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(processInlineMarkdown(text.substring(lastIndex, match.index)));
		}
		const lang = (match[1] || 'plaintext').trim() || 'plaintext';
		const code = match[2]
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		parts.push(
			`<div class="code-palette">` +
			`<div class="code-palette-header"><span class="code-palette-lang">${lang}</span></div>` +
			`<div class="code-palette-body"><pre><code class="language-${lang}">${code}</code></pre></div>` +
			`</div>`
		);
		lastIndex = codeBlockRegex.lastIndex;
	}

	const remainingText = text.substring(lastIndex);
	const openCodeBlockMatch = remainingText.match(/```(\w*)\n?([\s\S]*)$/);

	if (openCodeBlockMatch) {
		const preMatchText = remainingText.substring(0, openCodeBlockMatch.index);
		if (preMatchText) parts.push(processInlineMarkdown(preMatchText));
		
		const lang = (openCodeBlockMatch[1] || 'plaintext').trim() || 'plaintext';
		const code = openCodeBlockMatch[2]
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		parts.push(
			`<div class="code-palette streaming-code">` +
			`<div class="code-palette-header"><span class="code-palette-lang">${lang}</span><div class="inline-loader" style="padding:0; margin-left:8px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>` +
			`<div class="code-palette-body"><pre><code class="language-${lang}">${code}</code></pre></div>` +
			`</div>`
		);
	} else if (remainingText) {
		parts.push(processInlineMarkdown(remainingText));
	}

	return parts.join('');
};

// --- Components ---

const SvgIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
	switch (type) {
		case 'exploring':
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<path d="M1.5 3.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1v-8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
					<path d="M8.5 7.5L11 10M8.5 10L11 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
				</svg>
			);
		case 'read':
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<path d="M2.5 3.5h11v9h-11v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
					<path d="M5.5 6.5h5M5.5 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
				</svg>
			);
		case 'analyzing':
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
					<path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
					<path d="M5.5 7l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
			);
		case 'command':
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
					<path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
					<circle cx="6" cy="6" r="0.5" fill="currentColor"/>
				</svg>
			);
		case 'writing':
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<path d="M3 13l.5-3L10 3.5 12.5 6 6 12.5 3 13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
					<path d="M8.5 4l2.5 2.5" stroke="currentColor" strokeWidth="1.2"/>
				</svg>
			);
		default:
			return (
				<svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3"/>
					<path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
				</svg>
			);
	}
};

// --- ThinkBlock: Copilot-style collapsible reasoning view ---
const ThinkBlock: React.FC<{ content: string; isStreaming?: boolean }> = ({ content, isStreaming }) => {
	const [expanded, setExpanded] = React.useState(false);
	const trimmed = content.trim();
	const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

	return (
		<div className={`think-block ${isStreaming ? 'think-streaming' : ''}`}>
			<button className="think-header" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
				<div className="think-icon-wrap">
					{isStreaming ? (
						<div className="think-spinner" />
					) : (
						<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
							<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/>
							<path d="M6 6c0-1.1.9-2 2-2s2 .9 2 2c0 .8-.5 1.5-1.2 1.8L8 8.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
							<circle cx="8" cy="12" r="0.7" fill="currentColor"/>
						</svg>
					)}
				</div>
				<span className="think-label">
					{isStreaming ? 'Thinking...' : `Thought for ${wordCount} word${wordCount !== 1 ? 's' : ''}`}
				</span>
				<svg
					className={`think-chevron ${expanded ? 'expanded' : ''}`}
					width="12" height="12" viewBox="0 0 16 16" fill="none"
				>
					<path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
			</button>
			{expanded && (
				<div className="think-body">
					<pre className="think-content">{trimmed}</pre>
				</div>
			)}
		</div>
	);
};

const getActionIconType = (label: string): string => {
	const low = label.toLowerCase();
	if (low.includes('explor')) return 'exploring';
	if (low.includes('read')) return 'read';
	if (low.includes('analyz')) return 'analyzing';
	if (low.includes('command') || low.includes('run')) return 'command';
	if (low.includes('writ') || low.includes('edit') || low.includes('creat')) return 'writing';
	return 'default';
};

const ActionStepView: React.FC<{ 
	label: string; 
	detail?: string; 
	status: string;
	onOpenFile?: (path: string) => void;
}> = ({ label, detail, status, onOpenFile }) => {
	const [visible, setVisible] = React.useState(false);
	const iconType = getActionIconType(label);
	const isPending = status === 'pending';
	const isComplete = status === 'success' || status === 'completed';

	React.useEffect(() => {
		const timer = setTimeout(() => setVisible(true), 50);
		return () => clearTimeout(timer);
	}, []);

	const handleClick = () => {
		if (detail && onOpenFile) {
			onOpenFile(detail.trim());
		}
	};

	const handleShowFile = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (detail) {
			const vs = (window as any).vscode;
			if (vs) vs.postMessage({ command: 'openFile', path: detail.trim() });
		}
	};

	if (!visible) return null;

	return (
		<div className={`agent-step agent-step-${isComplete ? 'done' : isPending ? 'pending' : 'active'} ${detail ? 'clickable' : ''}`}>
			<div className="agent-step-track">
				<div className="agent-step-track-fill" />
			</div>
			<div className={`agent-step-icon ${iconType}`}>
				{isComplete ? (
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="check-icon">
						<circle cx="8" cy="8" r="7" fill="var(--success)" opacity="0.15"/>
						<path d="M5 8.5l2 2 4-4" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
					</svg>
				) : (
					<SvgIcon type={iconType} />
				)}
			</div>
			<div className="agent-step-content">
				<div className="agent-step-label">{label}</div>
				{detail && (
					<div className="agent-step-detail" onClick={handleShowFile}>
						<SvgIcon type="read" className="detail-file-icon" />
						<span>{detail}</span>
					</div>
				)}
			</div>
			{isComplete ? (
				<div className="agent-step-check">
					<svg width="10" height="10" viewBox="0 0 16 16" fill="none">
						<path d="M4 8l3 3 5-5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
					</svg>
				</div>
			) : (
				<div className="agent-step-loader">
					<div className="agent-step-dot" />
				</div>
			)}
		</div>
	);
};

const EditPreview: React.FC<{
	edit: EditProposal;
	onApply: () => void;
	onReject: () => void;
	onRevert: () => void;
	onShowDiff: () => void;
}> = ({ edit, onApply, onReject, onRevert, onShowDiff }) => {
	const [status, setStatus] = React.useState<'pending' | 'applied' | 'rejected'>('pending');
	
	const isNewFile = edit.oldContent.trim() === '';

	return (
		<div className={`edit-preview ${status === 'applied' ? 'edit-applied' : status === 'rejected' ? 'edit-rejected' : ''}`}>
			<div className="edit-preview-header">
				<div className="changes-title">
					<span className="changes-icon">📁</span>
					<span>Changes</span>
				</div>
				<div className="edit-actions-header">
					{status === 'applied' ? (
						<button className="edit-action-btn-header revert-btn" onClick={() => { setStatus('pending'); onRevert(); }}>
							<span className="btn-icon">↺</span> Revert
						</button>
					) : (
						<button className="edit-action-btn-header apply-btn" onClick={() => { setStatus('applied'); onApply(); }}>
							✓ Apply
						</button>
					)}
				</div>
			</div>
			
			<div className="multi-edit-list">
				<div className="multi-edit-item" onClick={onShowDiff}>
					<div className="multi-edit-item-content">
						{getFileIcon(edit.filePath)}
						<span className="multi-edit-path">{edit.filePath}</span>
					</div>
					{isNewFile && <span className="status-badge new">New</span>}
					<span className="chevron-icon">›</span>
				</div>
			</div>
		</div>
	);
};

const MultiEditPreview: React.FC<{ 
	edits: EditProposal[]; 
	onApply: (es: EditProposal[]) => void; 
	onRevert: (es: EditProposal[]) => void;
	onShowDiff: (e: EditProposal) => void 
}> = ({ edits, onApply, onRevert, onShowDiff }) => {
	const [status, setStatus] = React.useState<'pending' | 'applied'>('pending');
	
	// Group edits by file path
	const groupedEdits = React.useMemo(() => {
		const groups: { [path: string]: EditProposal[] } = {};
		edits.forEach(edit => {
			if (!groups[edit.filePath]) groups[edit.filePath] = [];
			groups[edit.filePath].push(edit);
		});
		return groups;
	}, [edits]);

	return (
		<div className={`edit-preview ${status === 'applied' ? 'edit-applied' : ''}`}>
			<div className="edit-preview-header">
				<div className="changes-title">
					<span className="changes-icon">📁</span>
					<span>Changes</span>
				</div>
				<div className="edit-actions-header">
					{status === 'applied' ? (
						<button className="edit-action-btn-header revert-btn" onClick={() => { setStatus('pending'); onRevert(edits); }}>
							<span className="btn-icon">↺</span> Revert all
						</button>
					) : (
						<button className="edit-action-btn-header apply-all-btn" onClick={() => { setStatus('applied'); onApply(edits); }}>
							✓ Apply all
						</button>
					)}
				</div>
			</div>
			
			<div className="multi-edit-list">
				{Object.entries(groupedEdits).map(([filePath, fileEdits], idx) => (
					<div key={idx} className="multi-edit-item" onClick={() => onShowDiff(fileEdits[0])}>
						<div className="multi-edit-item-content">
							{getFileIcon(filePath)}
							<span className="multi-edit-path">{filePath}</span>
							{fileEdits.length > 1 && <span className="edit-count-badge">{fileEdits.length} changes</span>}
						</div>
						{fileEdits.some(e => e.oldContent.trim() === '') && <span className="status-badge new">New</span>}
						<span className="chevron-icon">›</span>
					</div>
				))}
			</div>
		</div>
	);
};

const CommandBlock: React.FC<{ 
	cmd: string; 
	output: string; 
	status: string; 
	duration?: number; 
	onCopy: (text: string) => void;
	onFix?: (cmd: string, output: string) => void;
	onExecute?: (cmd: string) => void;
}> = ({ cmd, output, status, onCopy, onFix, onExecute }) => {
	const [copied, setCopied] = React.useState(false);
	const [isExecuting, setIsExecuting] = React.useState(false);

	const handleCopy = () => {
		onCopy(cmd);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	if (status === 'pending') {
		return (
			<div className="cmd-block cmd-pending animated-pop shadow-lg">
				<div className="cmd-block-toolbar">
					<div className="cmd-type">
						<span className="terminal-icon">$_</span>
						<span className="cmd-label">Proposed Command</span>
					</div>
					<div className="cmd-toolbar-actions">
						<button className={`copy-btn-ghost ${copied ? 'copied' : ''}`} onClick={handleCopy}>
							{copied ? '✓' : 'Copy'}
						</button>
					</div>
				</div>
				<div className="cmd-body">
					<pre><code>{cmd}</code></pre>
				</div>
				<div className="cmd-footer-actions">
					<button 
						className="cmd-execute-btn" 
						disabled={isExecuting}
						onClick={() => {
							setIsExecuting(true);
							onExecute?.(cmd);
						}}
					>
						{isExecuting ? 'Executing...' : 'Run in Terminal'}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={`cmd-block cmd-${status}`}>
			<div className="cmd-block-toolbar">
				<div className="cmd-type">
					<span className="terminal-icon">$_</span>
					<span className="cmd-label">Terminal</span>
				</div>
				<div className="cmd-toolbar-actions">
					<button className={`copy-btn-ghost ${copied ? 'copied' : ''}`} onClick={handleCopy}>
						{copied ? '✓ Copied' : 'Copy'}
					</button>
					{status === 'error' && onFix && (
						<button className="fix-btn-ghost" onClick={() => onFix(cmd, output)}>⚡ Fix with AI</button>
					)}
				</div>
			</div>
			<div className="cmd-body">
				<pre><code>{cmd}</code></pre>
			</div>
			{output && (
				<div className="cmd-status-row">
					<div className="status-indicator">
						<span className="status-dot"></span>
						<span className="status-text">Output</span>
					</div>
					<pre className="cmd-output">{output}</pre>
				</div>
			)}
		</div>
	);
};

const PlanView: React.FC<{ steps: { text: string; completed: boolean }[] }> = ({ steps }) => {
	const [approved, setApproved] = React.useState(false);
	
	return (
		<div className="agent-plan-outer animated-pop">
			<div className="agent-plan">
				<div className="plan-header">
					<span className="plan-icon">📐</span>
					<span className="plan-title">Execution Plan</span>
					{approved && <span className="plan-badge approved">Approved</span>}
				</div>
				<div className="plan-steps">
					{steps.map((step, idx) => (
						<div key={idx} className={`plan-step ${step.completed ? 'completed' : ''}`}>
							<div className="step-check">{step.completed ? '✓' : idx + 1}</div>
							<div className="step-text">{step.text}</div>
						</div>
					))}
				</div>
				{!approved && (
					<div className="plan-footer">
						<button className="plan-approve-btn" onClick={() => setApproved(true)}>
							Approve & Execute
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

const ConsoleLogsView: React.FC<{ logs: { type: string, text: string }[] }> = ({ logs }) => {
	return (
		<div className="console-logs-container animated-pop" style={{
			background: '#1e1e1e',
			borderRadius: '8px',
			border: '1px solid var(--border)',
			margin: '10px 0',
			overflow: 'hidden',
			fontFamily: 'monospace',
			fontSize: '12px'
		}}>
			<div className="console-header" style={{
				background: 'var(--bg-tertiary)',
				padding: '6px 12px',
				color: 'var(--text-muted)',
				fontSize: '11px',
				fontWeight: 600,
				textTransform: 'uppercase',
				display: 'flex',
				justifyContent: 'space-between',
				borderBottom: '1px solid var(--border)'
			}}>
				<span>Application Console</span>
				<span>{logs.length} messages</span>
			</div>
			<div className="console-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
				{logs.map((log, i) => {
					let icon = 'ℹ️';
					let color = '#ccc';
					let bg = 'transparent';
					
					if (log.type === 'error') {
						icon = '❌';
						color = '#f85149';
						bg = 'rgba(248, 81, 73, 0.05)';
					} else if (log.type === 'warning') {
						icon = '⚠️';
						color = '#d29922';
						bg = 'rgba(210, 153, 34, 0.05)';
					} else if (log.type === 'debug' || log.type === 'verbose') {
						icon = '🔍';
						color = '#8b949e';
					}

					return (
						<div key={i} style={{
							display: 'flex',
							gap: '8px',
							padding: '4px 12px',
							borderBottom: '1px solid rgba(255,255,255,0.05)',
							background: bg,
							lineHeight: '1.4'
						}}>
							<span style={{ flexShrink: 0, width: '16px' }}>{icon}</span>
							<span style={{ color: color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.text}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};

const ChoiceView: React.FC<{
	choices: string[];
	placeholder?: string;
	onSelect: (choice: string) => void;
}> = ({ choices, placeholder, onSelect }) => {
	const [search, setSearch] = React.useState('');
	const [showDropdown, setShowDropdown] = React.useState(false);
	const [selected, setSelected] = React.useState('');

	const filtered = choices.filter(c => c.toLowerCase().includes(search.toLowerCase()));

	return (
		<div className="branch-selector-container animated-pop">
			<div className="branch-selector-label">BRANCH</div>
			<div className="branch-selector-custom" style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
				<div 
					className="branch-trigger" 
					onClick={() => setShowDropdown(!showDropdown)}
					style={{
						background: 'var(--bg-secondary)', 
						color: 'var(--text-primary)', 
						border: '1px solid var(--border)', 
						borderRadius: '4px', 
						padding: '6px 12px', 
						fontSize: '13px',
						cursor: 'pointer',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center'
					}}
				>
					<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
						{selected || placeholder || 'Select branch'}
					</span>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginLeft: '8px' }}>
						<path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</div>
				
				{showDropdown && (
					<div 
						className="branch-dropdown"
						style={{
							position: 'absolute',
							bottom: '100%',
							left: 0,
							width: '100%',
							background: 'var(--bg-secondary)',
							border: '1px solid var(--border)',
							borderRadius: '4px',
							boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
							zIndex: 1000,
							marginBottom: '4px',
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						<div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
							<input 
								type="text"
								placeholder="Search branches..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								autoFocus
								style={{
									width: '100%',
									background: 'var(--bg-primary)',
									border: '1px solid var(--border)',
									borderRadius: '2px',
									padding: '6px 10px',
									fontSize: '13px',
									color: 'var(--text-primary)',
									outline: 'none'
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
						<div style={{ maxHeight: '200px', overflowY: 'auto' }}>
							<div 
								className="branch-item"
								onClick={() => { setSelected('None'); onSelect(''); setShowDropdown(false); }}
								style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}
							>
								None
							</div>
							{filtered.map(choice => (
								<div 
									key={choice}
									className={`branch-item ${selected === choice ? 'selected' : ''}`}
									onClick={() => { setSelected(choice); onSelect(choice); setShowDropdown(false); }}
									style={{ 
										padding: '8px 12px', 
										fontSize: '13px', 
										cursor: 'pointer',
										background: selected === choice ? 'var(--bg-active)' : 'transparent'
									}}
								>
									{choice}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

// --- Main Parsing Logic ---

const parseMessageParts = (text: string): MessagePart[] => {
  const result: MessagePart[] = [];

  // ── 1. Extract <think>...</think> blocks first (including unclosed ones during streaming)
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const openThinkRegex = /<think>([\s\S]*)$/; // Unclosed tag = still streaming

  const thinkMatches: { index: number; end: number; part: MessagePart }[] = [];
  let thinkMatch;
  while ((thinkMatch = thinkRegex.exec(text)) !== null) {
    thinkMatches.push({
      index: thinkMatch.index,
      end: thinkRegex.lastIndex,
      part: { type: 'think', content: thinkMatch[1], isStreaming: false }
    });
  }

  // Check for unclosed <think> (actively streaming)
  const textWithoutClosedThinks = text.replace(thinkRegex, '');
  const openMatch = openThinkRegex.exec(textWithoutClosedThinks);
  if (openMatch) {
    const openIdx = text.indexOf('<think>', text.lastIndexOf('</think>') + 1);
    if (openIdx !== -1 && !thinkMatches.some(m => m.index === openIdx)) {
      thinkMatches.push({
        index: openIdx,
        end: text.length,
        part: { type: 'think', content: openMatch[1], isStreaming: true }
      });
    }
  }

  // Build text with think blocks removed so other regexes work cleanly
  let processedText = text;
  // Replace closed think blocks with a placeholder so indices stay valid
  processedText = processedText.replace(/<think>[\s\S]*?<\/think>/g, '');
  processedText = processedText.replace(/<think>[\s\S]*$/, ''); // remove open tag

  // ── 2. All other regexes run on the cleaned text
  const editRegex = /(?:```\r?\n?)?\[EDIT_PROPOSAL\]\r?\nfile: (.*?)\r?\nold: \|\r?\n([\s\S]*?)\r?\nnew: \|\r?\n([\s\S]*?)\r?\nstatus: (.*?)\r?\nmessage: (.*?)\r?\n\[END_EDIT\](?:\r?\n?```)?/g;
  const legacyEditRegex = /(?:```\r?\n?)?\[EDIT_PROPOSAL\]\r?\nfile: (.+?)\r?\nold: \|\r?\n((?:(?!\[EDIT_PROPOSAL\]|\[END_EDIT\]|new: \|)[\s\S])*?)\r?\nnew: \|\r?\n((?:(?!\[EDIT_PROPOSAL\]|\[END_EDIT\])[\s\S])*?)\r?\n\[END_EDIT\](?:\r?\n?```)?/g;
  const stepRegex = /\[STEP\] (.*?) (?:\| (.*?))?\[\/STEP\]/g;
  const cmdRegex = /```cmd-result\n([\s\S]*?)```/g;
  const cmdProposalRegex = /\[COMMAND_PROPOSAL\]\ncommand: (.*?)\nstatus: (.*?)\nmessage: (.*?)\n\[END_COMMAND\]/g;
  const planRegex = /\[PLAN\]\n([\s\S]*?)\n\[\/PLAN\]/g;
  const choiceRegex = /\[CHOICE\]\r?\nchoices: (.*?)\r?\nplaceholder: (.*?)\r?\ncommand: (.*?)\r?\n\[\/CHOICE\]/g;
  const consoleRegex = /\[CONSOLE (.*?)\]\n([\s\S]*?)(?=\n\n|\n\[|$)/g;

  const allMatches: { index: number; end: number; part: MessagePart }[] = [];
  let match;
  while ((match = editRegex.exec(processedText)) !== null) {
    allMatches.push({ index: match.index, end: editRegex.lastIndex, part: { type: 'editProposal', edit: { filePath: match[1], oldContent: match[2], newContent: match[3] } } });
  }
  while ((match = legacyEditRegex.exec(processedText)) !== null) {
      if (!allMatches.some(m => m.index === match!.index)) {
          allMatches.push({ index: match.index, end: legacyEditRegex.lastIndex, part: { type: 'editProposal', edit: { filePath: match[1], oldContent: match[2], newContent: match[3] } } });
      }
  }
  while ((match = stepRegex.exec(processedText)) !== null) {
    allMatches.push({ index: match.index, end: stepRegex.lastIndex, part: { type: 'actionStep', label: match[1], detail: match[2], status: 'success' } });
  }
  while ((match = cmdRegex.exec(processedText)) !== null) {
      try { const data = JSON.parse(match[1]); allMatches.push({ index: match.index, end: cmdRegex.lastIndex, part: { type: 'command', cmd: data.cmd, status: data.status, output: data.output, duration: data.duration } }); } catch { /* ignore */ }
  }
  while ((match = cmdProposalRegex.exec(processedText)) !== null) {
      allMatches.push({ index: match.index, end: cmdProposalRegex.lastIndex, part: { type: 'command', cmd: match[1], status: match[2], output: '' } });
  }
  while ((match = planRegex.exec(processedText)) !== null) {
	  const stepLines = match[1].split('\n').filter((l: string) => l.trim().startsWith('-'));
	  const steps = stepLines.map((l: string) => {
		  const clean = l.trim().slice(1).trim();
		  return { text: clean, completed: clean.toLowerCase().includes('(done)') || clean.includes('✅') };
	  });
	  allMatches.push({ index: match.index, end: planRegex.lastIndex, part: { type: 'plan', steps } });
  }
  while ((match = choiceRegex.exec(processedText)) !== null) {
	  try {
		  const choices = JSON.parse(match[1]);
		  allMatches.push({ 
			  index: match.index, 
			  end: choiceRegex.lastIndex, 
			  part: { 
				  type: 'choice', 
				  choices, 
				  placeholder: match[2], 
				  command: match[3] 
			  } 
		  });
	  } catch { /* ignore */ }
  }
  while ((match = consoleRegex.exec(processedText)) !== null) {
      const logLines = match[2].split('\n').filter(Boolean);
      const logs = logLines.map((line: string) => {
          const typeMatch = line.match(/^(\w+): (.*)/);
          if (typeMatch) {
              return { type: typeMatch[1].toLowerCase(), text: typeMatch[2] };
          }
          return { type: 'log', text: line };
      });
      allMatches.push({ index: match.index, end: consoleRegex.lastIndex, part: { type: 'consoleLogs', logs } });
  }

  allMatches.sort((a, b) => a.index - b.index);
  let lastIndex = 0;
  for (const m of allMatches) {
    if (m.index > lastIndex) result.push({ type: 'markdown', content: processedText.substring(lastIndex, m.index) });
    result.push(m.part);
    lastIndex = m.end;
  }
  if (lastIndex < processedText.length) result.push({ type: 'markdown', content: processedText.substring(lastIndex) });

  // ── 3. Build final parts: think blocks first, then content, then grouped edits
  const finalParts: MessagePart[] = [];
  const editProposals: EditProposal[] = [];

  // ── 2b. Extract incomplete [EDIT_PROPOSAL] from the final markdown part
  if (result.length > 0 && result[result.length - 1].type === 'markdown') {
    const lastPart = result[result.length - 1] as { type: 'markdown', content: string };
    const incompleteEditRegex = /(?:```\r?\n?)?\[EDIT_PROPOSAL\]\r?\nfile: (.*?)\r?\n([\s\S]*)$/;
    const match = lastPart.content.match(incompleteEditRegex);
    if (match) {
      // Remove the raw edit proposal text from the markdown part
      lastPart.content = lastPart.content.substring(0, match.index);
      
      const filePath = match[1];
      const remainder = match[2];
      
      // Try to extract the "new:" block to show the streaming code
      let streamingCode = '';
      const newBlockMatch = remainder.match(/new: \|\r?\n([\s\S]*)$/);
      if (newBlockMatch) {
          streamingCode = newBlockMatch[1];
      }

      // Add a special markdown block that formats the streaming edit
      result.push({ 
        type: 'markdown', 
        content: `**Generating Edit for \`${filePath}\`...**\n\n\`\`\`javascript\n${streamingCode}` 
      });
    }
  }

  // Insert think blocks at the top (they precede the answer)
  for (const tm of thinkMatches) {
    finalParts.push(tm.part);
  }

  for (const part of result) {
    if (part.type === 'editProposal') {
      editProposals.push(part.edit);
    } else if (part.type === 'markdown' && !part.content.trim()) {
      continue;
    } else {
      finalParts.push(part);
    }
  }

  if (editProposals.length > 0) {
    if (editProposals.length === 1) {
      finalParts.push({ type: 'editProposal', edit: editProposals[0] });
    } else {
      finalParts.push({ type: 'multiEditProposal', edits: editProposals });
    }
  }

  return finalParts;
};

// --- Exported Component ---

export interface Attachment {
	name: string;
	path?: string;
	file?: File;
	type: 'file' | 'terminal' | 'image' | 'diff' | 'folder' | 'url' | 'console';
	imageData?: string;
	mimeType?: string;
	isPinned?: boolean;
}

export interface MessageData {
	id: string;
	role: 'user' | 'ai';
	text: string;
	timestamp: number;
	attachments?: Attachment[];
	isStreaming?: boolean;
}

interface MessageProps {
 	message: MessageData;
 	logoUri: string;
 	onCopy: (text: string) => void;
 	userEmail?: string | null;
 	onApplyEdit?: (edit: EditProposal) => void;
    onApplyMultiEdit?: (edits: EditProposal[]) => void;
 	onRejectEdit?: (edit: EditProposal) => void;
 	onRevertEdit?: (edit: EditProposal) => void;
 	onShowDiff?: (edit: EditProposal) => void;
	onOpenFile?: (path: string) => void;
	onFixCommand?: (cmd: string, output: string) => void;
	onSelectChoice?: (choice: string, command?: string) => void;
}

export const Message: React.FC<MessageProps> = ({ message, logoUri, onCopy, userEmail, onApplyEdit, onApplyMultiEdit, onRejectEdit, onRevertEdit, onShowDiff, onOpenFile, onFixCommand, onSelectChoice }) => {
	const isUser = message.role === 'user';
	const parts = React.useMemo(() => parseMessageParts(message.text), [message.text]);

	return (
		<div className={`message-group ${isUser ? 'user-group' : 'ai-group'}`}>
			{!isUser && <div className="avatar ai-avatar"><img src={logoUri} alt="AI" /></div>}
			<div className="msg-body">
				<div className="msg-meta">
					<span className="msg-author">{isUser ? getNameFromEmail(userEmail) : 'TraneAI'}</span>
					<span className="msg-time">{formatWhatsAppTime(message.timestamp)}</span>
				</div>
				<div className="msg-bubble">
					{message.attachments && message.attachments.length > 0 && (
						<div className="msg-attachments">
							{message.attachments.map((attachment, idx) => (
								<div key={idx} className={`msg-attachment ${attachment.type}`}>
									{attachment.type === 'image' && attachment.imageData ? (
										<div className="img-thumb-wrap">
											<img
												className="msg-image"
												src={`data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.imageData}`}
												alt={attachment.name}
												title={attachment.name}
												style={{height:"30px",width:'30px'}}
											/>
											<div className="img-hover-preview">
												<img
													src={`data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.imageData}`}
													alt={attachment.name}
												/>
											</div>
										</div>
									) : (
										<div className="msg-attachment-file">
											<span className="attachment-icon">📎</span>
											<span className="attachment-name">{attachment.name}</span>
										</div>
									)}
								</div>
							))}
						</div>
					)}
					{parts.map((p, idx) => {
						if (p.type === 'think') return <ThinkBlock key={idx} content={p.content} isStreaming={p.isStreaming} />;
						if (p.type === 'markdown') return <div key={idx} className="msg-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.content) }} />;
						if (p.type === 'actionStep') return <ActionStepView key={idx} {...p} onOpenFile={onOpenFile} />;
						if (p.type === 'command') return <CommandBlock key={idx} {...p} onCopy={onCopy} onFix={onFixCommand} onExecute={(cmd) => {
							const vscode = (window as any).vscode;
							if (vscode) {
								vscode.postMessage({ command: 'executeCommand', cmd: cmd });
							}
						}} />;
						if (p.type === 'editProposal') {
							return (
								<React.Fragment key={idx}>
									<ModernDiffView filePath={p.edit.filePath} oldContent={p.edit.oldContent} newContent={p.edit.newContent} onCopy={onCopy} />
									<EditPreview edit={p.edit} onApply={() => onApplyEdit?.(p.edit)} onReject={() => onRejectEdit?.(p.edit)} onRevert={() => onRevertEdit?.(p.edit)} onShowDiff={() => onShowDiff?.(p.edit)} />
								</React.Fragment>
							);
						}
						if (p.type === 'multiEditProposal') {
							const groups: { [path: string]: EditProposal[] } = {};
							p.edits.forEach(e => {
								if (!groups[e.filePath]) groups[e.filePath] = [];
								groups[e.filePath].push(e);
							});
							
							return (
								<React.Fragment key={idx}>
									{Object.entries(groups).map(([filePath, fileEdits], gIdx) => (
										<ModernDiffView 
											key={gIdx} 
											filePath={filePath} 
											oldContent={fileEdits.map(e => e.oldContent).join('\n...\n')} 
											newContent={fileEdits.map(e => e.newContent).join('\n...\n')} 
											onCopy={onCopy} 
										/>
									))}
									<MultiEditPreview 
										edits={p.edits} 
										onApply={(es) => onApplyMultiEdit?.(es)} 
										onRevert={(es) => es.forEach(e => onRevertEdit?.(e))}
										onShowDiff={(e) => onShowDiff?.(e)} 
									/>
								</React.Fragment>
							);
						}
						if (p.type === 'plan') return <PlanView key={idx} steps={p.steps} />;
						if (p.type === 'choice') return <ChoiceView key={idx} choices={p.choices} placeholder={p.placeholder} onSelect={(choice) => onSelectChoice?.(choice, p.command)} />;
						if (p.type === 'consoleLogs') return <ConsoleLogsView key={idx} logs={p.logs} />;
						return null;
					})}
					{message.isStreaming && (
						<div className="inline-loader">
							<span className="dot"></span>
							<span className="dot"></span>
							<span className="dot"></span>
						</div>
					)}
				</div>
				{!isUser && (
					<div className="msg-actions">
						<button className="msg-action-btn" onClick={() => onCopy(message.text)}>Copy</button>
					</div>
				)}
			</div>
		</div>
	);
};
