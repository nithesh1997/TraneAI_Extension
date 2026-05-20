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
  | { type: 'plan'; steps: { text: string; completed: boolean }[] };

// --- Helpers ---

const computeLineDiff = (oldContent: string, newContent: string) => {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');
	const result: { type: 'unchanged' | 'removed' | 'added'; content: string; oldLineNum?: number; newLineNum?: number }[] = [];
	
	let i = 0;
	let j = 0;
	let added = 0;
	let removed = 0;
	
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
				removed++;
			} else if (j < newLines.length) {
				result.push({ type: 'added', content: newLines[j], newLineNum: j + 1 });
				j++;
				added++;
			} else if (i < oldLines.length) {
				result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
				i++;
				removed++;
			}
		}
	}
	
	return { lines: result, added, removed };
};

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const getNameFromEmail = (email: string | null | undefined): string => {
	if (!email) return 'User';
	const local = email.split('@')[0];
	const name = local.split(/[._-]/)[0];
	return name.charAt(0).toUpperCase() + name.slice(1);
};

const getRelativeTime = (ts: number): string => {
	const diffMs = Date.now() - ts;
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return `${diffSec}s ago`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	return `${Math.floor(diffMin / 60)}h ago`;
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
	const diff = React.useMemo(() => computeLineDiff(edit.oldContent, edit.newContent), [edit]);
	
	if (status === 'applied') {
		return (
			<div className="edit-preview edit-applied">
				<div className="edit-preview-header">
					<div className="edit-file-info">📄 {edit.filePath}</div>
					<span className="edit-status applied">Applied</span>
				</div>
				<div className="edit-actions">
					<button className="edit-action-btn secondary-btn" onClick={() => { setStatus('pending'); onRevert(); }}>Revert</button>
					<button className="edit-action-btn secondary-btn" onClick={onShowDiff}>Full Diff</button>
				</div>
			</div>
		);
	}

	return (
		<div className="edit-preview">
			<div className="edit-preview-header">
				<div className="edit-file-info">📄 {edit.filePath}</div>
				<div className="edit-stats"><span className="stat-add">+{diff.added}</span> <span className="stat-rem">-{diff.removed}</span></div>
			</div>
			<div className="edit-diff-container">
				{diff.lines.map((line, i) => (
					<div key={i} className={`diff-line ${line.type}`}>
						<span className="diff-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
						<pre className="diff-content">{line.content}</pre>
					</div>
				))}
			</div>
			<div className="edit-actions">
				<button className="edit-action-btn apply-btn" onClick={() => { setStatus('applied'); onApply(); }}>Accept</button>
				<button className="edit-action-btn discard-btn" onClick={() => { setStatus('rejected'); onReject(); }}>Discard</button>
				<button className="edit-action-btn secondary-btn" onClick={onShowDiff}>Full Diff</button>
			</div>
		</div>
	);
};

const MultiEditPreview: React.FC<{ edits: EditProposal[]; onApply: (es: EditProposal[]) => void; onShowDiff: (e: EditProposal) => void }> = ({ edits, onApply, onShowDiff }) => {
	const [status, setStatus] = React.useState<'pending' | 'applied'>('pending');
	if (status === 'applied') return <div className="edit-preview edit-applied"><div className="edit-preview-header">Updated {edits.length} files</div></div>;
	return (
		<div className="edit-preview">
			<div className="edit-preview-header">Proposed changes in {edits.length} files</div>
			<div className="multi-edit-list">
				{edits.map((e, idx) => (
					<div key={idx} className="multi-edit-item" onClick={() => onShowDiff(e)}>📄 {e.filePath}</div>
				))}
			</div>
			<div className="edit-actions">
				<button className="edit-action-btn apply-all-btn" onClick={() => { setStatus('applied'); onApply(edits); }}>Accept All</button>
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

// --- Main Parsing Logic ---

const parseMessageParts = (text: string): MessagePart[] => {
  const result: MessagePart[] = [];
  const editRegex = /\[EDIT_PROPOSAL\]\nfile: (.*?)\nold: \|\n([\s\S]*?)\nnew: \|\n([\s\S]*?)\nstatus: (.*?)\nmessage: (.*?)\n\[END_EDIT\]/g;
  const legacyEditRegex = /\[EDIT_PROPOSAL\]\nfile: (.+?)\nold: \|\n([\s\S]*?)\nnew: \|\n([\s\S]*?)\n\[END_EDIT\]/g;
  const stepRegex = /\[STEP\] (.*?) (?:\| (.*?))?\[\/STEP\]/g;
  const cmdRegex = /```cmd-result\n([\s\S]*?)```/g;
  const cmdProposalRegex = /\[COMMAND_PROPOSAL\]\ncommand: (.*?)\nstatus: (.*?)\nmessage: (.*?)\n\[END_COMMAND\]/g;
  const planRegex = /\[PLAN\]\n([\s\S]*?)\n\[\/PLAN\]/g;
  
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

  allMatches.sort((a, b) => a.index - b.index);
  let lastIndex = 0;
  for (const m of allMatches) {
    if (m.index > lastIndex) result.push({ type: 'markdown', content: text.substring(lastIndex, m.index) });
    result.push(m.part);
    lastIndex = m.end;
  }
  if (lastIndex < text.length) result.push({ type: 'markdown', content: text.substring(lastIndex) });

  const finalParts: MessagePart[] = [];
  for (const part of result) {
    if (part.type === 'editProposal') {
      const last = finalParts[finalParts.length - 1];
      if (last && last.type === 'multiEditProposal') last.edits.push(part.edit);
      else if (last && last.type === 'editProposal') finalParts[finalParts.length - 1] = { type: 'multiEditProposal', edits: [last.edit, part.edit] };
      else finalParts.push(part);
    } else if (part.type === 'markdown' && !part.content.trim()) continue;
    else finalParts.push(part);
  }
  return finalParts;
};

// --- Exported Component ---

export interface Attachment {
	name: string;
	path?: string;
	file?: File;
	type: 'file' | 'terminal' | 'image' | 'diff' | 'folder';
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
}

export const Message: React.FC<MessageProps> = ({ message, logoUri, onCopy, userEmail, onApplyEdit, onApplyMultiEdit, onRejectEdit, onRevertEdit, onShowDiff, onOpenFile, onFixCommand }) => {
	const isUser = message.role === 'user';
	const [relativeTime, setRelativeTime] = React.useState(() => getRelativeTime(message.timestamp));
	const parts = React.useMemo(() => parseMessageParts(message.text), [message.text]);

	return (
		<div className={`message-group ${isUser ? 'user-group' : 'ai-group'}`}>
			{!isUser && <div className="avatar ai-avatar"><img src={logoUri} alt="AI" /></div>}
			<div className="msg-body">
				<div className="msg-meta">
					<span className="msg-author">{isUser ? getNameFromEmail(userEmail) : 'TraneAI'}</span>
					<span className="msg-time">{isUser ? relativeTime : formatTime(message.timestamp)}</span>
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
						if (p.type === 'editProposal') return <EditPreview key={idx} edit={p.edit} onApply={() => onApplyEdit?.(p.edit)} onReject={() => onRejectEdit?.(p.edit)} onRevert={() => onRevertEdit?.(p.edit)} onShowDiff={() => onShowDiff?.(p.edit)} />;
						if (p.type === 'multiEditProposal') return <MultiEditPreview key={idx} edits={p.edits} onApply={onApplyMultiEdit || (() => {})} onShowDiff={onShowDiff || (() => {})} />;
						if (p.type === 'plan') return <PlanView key={idx} steps={p.steps} />;
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
