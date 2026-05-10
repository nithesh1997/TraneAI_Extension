import React from 'react';

type MessagePart =
  | { type: 'markdown'; content: string }
  | { type: 'command'; cmd: string; status: string; output: string; duration?: number };

const parseMessageParts = (text: string): MessagePart[] => {
  const parts: MessagePart[] = [];
  const regex = /```cmd-result\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
    }
    try {
      const data = JSON.parse(match[1].trim());
      parts.push({ type: 'command', cmd: data.cmd, status: data.status, output: data.output, duration: data.duration });
    } catch {
      parts.push({ type: 'markdown', content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'markdown', content: text.slice(lastIndex) });
  }

  return parts;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const highlightCmd = (raw: string): string => {
  const tokens = raw.match(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|[^\s]+|\s+)/g) || [];
  let first = true;
  return tokens.map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    const e = escapeHtml(tok);
    if (/^(".*"|'.*'|`.*`)$/.test(tok)) return `<span class="cmd-hl-str">${e}</span>`;
    if (/^(&&|\|\||[;|>]{1,2})$/.test(tok)) return `<span class="cmd-hl-op">${e}</span>`;
    if (/^--?[\w][\w-]*/.test(tok)) return `<span class="cmd-hl-flag">${e}</span>`;
    if (/^([A-Za-z]:[\\/]|~?\/)[^\s]*/.test(tok)) return `<span class="cmd-hl-path">${e}</span>`;
    if (first) { first = false; return `<span class="cmd-hl-bin">${e}</span>`; }
    return e;
  }).join('');
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3 11V3h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CommandBlock: React.FC<{
  cmd: string;
  status: string;
  output: string;
  duration?: number;
  onCopy: (text: string) => void;
}> = ({ cmd, status, output, duration, onCopy }) => {
  const [cmdCopied, setCmdCopied] = React.useState(false);
  const [outCopied, setOutCopied] = React.useState(false);
  const [outputOpen, setOutputOpen] = React.useState(false);

  const hasOutput = output && output !== '(no output)';
  const lineCount = hasOutput ? output.split('\n').length : 0;
  const isSuccess = status === 'success';

  const copyCmd = () => {
    onCopy(cmd);
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 1500);
  };

  const copyOut = () => {
    onCopy(output);
    setOutCopied(true);
    setTimeout(() => setOutCopied(false), 1500);
  };

  return (
    <div className={`cmd-block ${isSuccess ? 'cmd-success' : 'cmd-error'}`}>
      <div className="cmd-block-toolbar">
        <span className="cmd-prompt-symbol">&gt;_</span>
        <button className="cmd-icon-btn" onClick={copyCmd} title="Copy command">
          {cmdCopied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      <div className="cmd-body">
        <code
          className="cmd-text"
          dangerouslySetInnerHTML={{ __html: highlightCmd(cmd) }}
        />
      </div>

      <div className="cmd-status-row">
        <span className={`cmd-status-dot ${isSuccess ? 'dot-success' : 'dot-error'}`} />
        <span className="cmd-status-label">Command executed</span>
        {duration !== undefined && (
          <span className="cmd-duration">{formatDuration(duration)}</span>
        )}
        <div className="cmd-status-right">
          {hasOutput && (
            <button
              className={`cmd-toggle-btn ${outputOpen ? 'open' : ''}`}
              onClick={() => setOutputOpen(o => !o)}
              title={outputOpen ? 'Hide output' : `Show output (${lineCount} lines)`}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {hasOutput && !outputOpen && lineCount > 0 && (
                <span className="cmd-line-count">{lineCount}</span>
              )}
            </button>
          )}
          {!hasOutput && (
            <svg className="cmd-sq-icon" width="10" height="10" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </div>
      </div>

      <div className={`cmd-output-panel ${outputOpen ? 'cmd-output-open' : ''}`}>
        <div className="cmd-output-inner">
          <div className="cmd-output-header">
            <span className="cmd-output-lines">{lineCount} lines</span>
            <button className="cmd-icon-btn cmd-out-copy" onClick={copyOut} title="Copy output">
              {outCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <pre className="cmd-output">{output}</pre>
        </div>
      </div>
    </div>
  );
};

export type Attachment = {
  name: string;
  path?: string;
  file?: File;
  type: 'file' | 'terminal' | 'image';
  imageData?: string;
  mimeType?: string;
};
export interface MessageData {
	role: 'user' | 'assistant';
	text: string;
	timestamp: number;
	attachments?: Attachment[];
	id?: string;
	isStreaming?: boolean;
}

interface MessageProps {
	message: MessageData;
	logoUri: string;
	onCopy: (text: string) => void;
	userEmail?: string | null;
}

const formatTime = (ts: number) => {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

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
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	return `${diffDay}d ago`;
};

const applyInline = (text: string): string =>
	text
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');

const isListLine = (line: string, type: 'ul' | 'ol') =>
	type === 'ul' ? /^[-*] .+/.test(line) : /^\d+\. .+/.test(line);

const nextNonBlank = (lines: string[], from: number): string =>
	lines.slice(from).find(l => l.trim() !== '') ?? '';

const renderMarkdown = (text: string): string => {
	const codeBlocks: string[] = [];
	let src = text.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
		const i = codeBlocks.length;
		const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
		return `\x00CB${i}\x00`;
	});

	const lines = src.split('\n');
	const out: string[] = [];
	let listType: 'ul' | 'ol' | '' = '';

	const closeList = () => {
		if (listType) { out.push(`</${listType}>`); listType = ''; }
	};

	for (let idx = 0; idx < lines.length; idx++) {
		const line = lines[idx];
		const h3 = line.match(/^### (.+)/);
		const h2 = line.match(/^## (.+)/);
		const h1 = line.match(/^# (.+)/);
		const ul = line.match(/^[-*] (.+)/);
		const ol = line.match(/^\d+\. (.+)/);
		const hr = /^---+$/.test(line.trim());

		if (h3) { closeList(); out.push(`<h3>${applyInline(h3[1])}</h3>`); }
		else if (h2) { closeList(); out.push(`<h2>${applyInline(h2[1])}</h2>`); }
		else if (h1) { closeList(); out.push(`<h1>${applyInline(h1[1])}</h1>`); }
		else if (hr) { closeList(); out.push('<hr>'); }
		else if (ul) {
			if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
			out.push(`<li>${applyInline(ul[1])}</li>`);
		} else if (ol) {
			if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
			out.push(`<li>${applyInline(ol[1])}</li>`);
		} else if (line.trim() === '') {
			if (listType) {
				const next = nextNonBlank(lines, idx + 1);
				if (isListLine(next, listType as 'ul' | 'ol')) {
					continue;
				}
				closeList();
			}
			out.push('<br>');
		} else {
			closeList();
			out.push(`<p>${applyInline(line)}</p>`);
		}
	}
	closeList();

	return out.join('').replace(/\x00CB(\d+)\x00/g, (_m, i) => codeBlocks[+i]);
};

export const Message: React.FC<MessageProps> = ({ message, logoUri, onCopy, userEmail }) => {
	const isUser = message.role === 'user';
	const [copyText, setCopyText] = React.useState('Copy');
	const [feedback, setFeedback] = React.useState<'up' | 'down' | null>(null);
	const [relativeTime, setRelativeTime] = React.useState(() => getRelativeTime(message.timestamp));

	React.useEffect(() => {
		if (!isUser) return;
		const interval = setInterval(() => {
			setRelativeTime(getRelativeTime(message.timestamp));
		}, 30000);
		return () => clearInterval(interval);
	}, [isUser, message.timestamp]);

	const handleCopy = () => {
		onCopy(message.text);
		setCopyText('✓ Copied');
		setTimeout(() => setCopyText('Copy'), 1500);
	};

	return (
		<div className={`message-group ${isUser ? 'user-group' : 'ai-group'}`}>
			{!isUser && (
				<div className="avatar ai-avatar"><img src={logoUri} alt="AI" /></div>
			)}
			<div className="msg-body">
				<div className="msg-meta">
					<span className="msg-author">{isUser ? getNameFromEmail(userEmail) : 'TraneAI'}</span>
					{isUser ? ',' : ''}
					<span className="msg-time">{isUser ? relativeTime : formatTime(message.timestamp)}</span>
				</div>
				<div className="msg-bubble">
					{message.attachments && message.attachments.length > 0 && (
						<div className="file-chips">
							{message.attachments.map((file, index) => (
								<div key={index} className={`file-chip ${file.type}`}>
									{file.type === 'image' && file.imageData ? (
										<img
											src={`data:${file.mimeType || 'image/jpeg'};base64,${file.imageData}`}
											className="chip-image-thumb"
											alt=""
										/>
									) : file.type === 'terminal' ? (
										<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
											<path d="M2 4h12v8H2V4z" stroke="currentColor" strokeWidth="1.2" />
											<path d="M4 8h1M6 8h3" stroke="currentColor" strokeWidth="1.2" />
										</svg>
									) : (
										<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
											<path d="M3 3h10v10H3V3z" stroke="currentColor" strokeWidth="1.2" />
											<path d="M7 3v10M3 7h10" stroke="currentColor" strokeWidth="1.2" />
										</svg>
									)}
									<span className="file-name">{file.name}</span>
								</div>
							))}
						</div>
					)}
					{(() => {
						const parts = parseMessageParts(message.text);
						const hasCmdBlocks = parts.some(p => p.type === 'command');
						const isStreaming = message.role === 'assistant' && message.isStreaming;
						if (!hasCmdBlocks) {
							return (
								<div
									className={`msg-text ${isStreaming ? 'streaming' : ''}`}
									dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) + (isStreaming ? '<span class="cursor">|</span>' : '') }}
								/>
							);
						}
						return (
							<>
								{parts.map((part, idx) => {
									if (part.type === 'command') {
										return <CommandBlock key={idx} cmd={part.cmd} status={part.status} output={part.output} duration={part.duration} onCopy={onCopy} />;
									}
									if (!part.content.trim()) return null;
									const isLastPart = idx === parts.length - 1;
									return (
										<div
											key={idx}
											className={`msg-text ${isStreaming && isLastPart ? 'streaming' : ''}`}
											dangerouslySetInnerHTML={{ __html: renderMarkdown(part.content) + (isStreaming && isLastPart ? '<span class="cursor">|</span>' : '') }}
										/>
									);
								})}
							</>
						);
					})()}
				</div>
				{!isUser && (
					<div className="msg-actions">
						<button className="msg-action-btn" onClick={handleCopy}>
							<svg width="11" height="11" viewBox="0 0 16 16" fill="none">
								<rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
								<path d="M3 11V3h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							{copyText}
						</button>
						<button className={`msg-action-btn thumbs-up ${feedback === 'up' ? 'active-good' : ''}`} onClick={() => setFeedback(feedback === 'up' ? null : 'up')}>👍</button>
						<button className={`msg-action-btn thumbs-down ${feedback === 'down' ? 'active-bad' : ''}`} onClick={() => setFeedback(feedback === 'down' ? null : 'down')}>👎</button>
					</div>
				)}
			</div>
		</div>
	);
};
