import React from 'react';

export interface EditProposal {
  filePath: string;
  oldContent: string;
  newContent: string;
}

type MessagePart =
  | { type: 'markdown'; content: string }
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
		const lang = match[1] || 'plaintext';
		const code = match[2]
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		parts.push(
			`<div class="md-code-block">` +
			`<div class="md-code-header"><span class="md-code-lang">${lang}</span></div>` +
			`<pre><code class="language-${lang}">${code}</code></pre>` +
			`</div>`
		);
		lastIndex = codeBlockRegex.lastIndex;
	}

	if (lastIndex < text.length) {
		parts.push(processInlineMarkdown(text.substring(lastIndex)));
	}

	return parts.join('');
};

// --- Components ---

const ActionStepView: React.FC<{ 
	label: string; 
	detail?: string; 
	status: string;
	onOpenFile?: (path: string) => void;
}> = ({ label, detail, status, onOpenFile }) => {
	const getIcon = () => {
		if (status === 'pending') return '⋯';
		
		const lowLabel = label.toLowerCase();
		if (lowLabel.includes('exploring')) return '📁';
		if (lowLabel.includes('read file')) return '📄';
		if (lowLabel.includes('analyzing')) return '🔍';
		if (lowLabel.includes('command')) return '⌨️';
		return '✓';
	};

	const handleClick = () => {
		if (detail && onOpenFile) {
			onOpenFile(detail.trim());
		}
	};

	return (
		<div 
			className={`action-step step-${status} ${detail ? 'clickable' : ''}`} 
			onClick={handleClick}
		>
			<span className="step-icon">{getIcon()}</span>
			<span className="step-label">{label}</span>
			{detail && <span className="step-detail">{detail}</span>}
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
  while ((match = editRegex.exec(text)) !== null) {
    allMatches.push({ index: match.index, end: editRegex.lastIndex, part: { type: 'editProposal', edit: { filePath: match[1], oldContent: match[2], newContent: match[3] } } });
  }
  while ((match = legacyEditRegex.exec(text)) !== null) {
      if (!allMatches.some(m => m.index === match!.index)) {
          allMatches.push({ index: match.index, end: legacyEditRegex.lastIndex, part: { type: 'editProposal', edit: { filePath: match[1], oldContent: match[2], newContent: match[3] } } });
      }
  }
  while ((match = stepRegex.exec(text)) !== null) {
    allMatches.push({ index: match.index, end: stepRegex.lastIndex, part: { type: 'actionStep', label: match[1], detail: match[2], status: 'success' } });
  }
  while ((match = cmdRegex.exec(text)) !== null) {
      try { const data = JSON.parse(match[1]); allMatches.push({ index: match.index, end: cmdRegex.lastIndex, part: { type: 'command', cmd: data.cmd, status: data.status, output: data.output, duration: data.duration } }); } catch { /* ignore */ }
  }
  while ((match = cmdProposalRegex.exec(text)) !== null) {
      allMatches.push({ index: match.index, end: cmdProposalRegex.lastIndex, part: { type: 'command', cmd: match[1], status: match[2], output: '' } });
  }
  while ((match = planRegex.exec(text)) !== null) {
	  const stepLines = match[1].split('\n').filter(l => l.trim().startsWith('-'));
	  const steps = stepLines.map(l => {
		  const clean = l.trim().slice(1).trim();
		  return { text: clean, completed: clean.toLowerCase().includes('(done)') || clean.includes('✅') };
	  });
	  allMatches.push({ index: match.index, end: planRegex.lastIndex, part: { type: 'plan', steps } });
  }
  while ((match = choiceRegex.exec(text)) !== null) {
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
  while ((match = consoleRegex.exec(text)) !== null) {
      const logLines = match[2].split('\n').filter(Boolean);
      const logs = logLines.map(line => {
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
    if (m.index > lastIndex) result.push({ type: 'markdown', content: text.substring(lastIndex, m.index) });
    result.push(m.part);
    lastIndex = m.end;
  }
  if (lastIndex < text.length) result.push({ type: 'markdown', content: text.substring(lastIndex) });

  const finalParts: MessagePart[] = [];
  const editProposals: EditProposal[] = [];

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
										<img
											className="msg-image"
											src={`data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.imageData}`}
											alt={attachment.name}
											title={attachment.name}
											style={{height:"30px",width:'30px'}}
										/>
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
