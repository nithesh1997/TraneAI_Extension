import React from 'react';

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
					<div className={`msg-text ${message.role === 'assistant' && message.isStreaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) + (message.role === 'assistant' && message.isStreaming ? '<span class="cursor">|</span>' : '') }}></div>
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
