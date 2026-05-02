import React from 'react';

export interface Attachment {
	name: string;
	path: string;
	type: 'file' | 'terminal';
}

export interface MessageData {
	role: 'user' | 'assistant';
	text: string;
	timestamp: number;
	attachments?: Attachment[];
}

interface MessageProps {
	message: MessageData;
	logoUri: string;
	onCopy: (text: string) => void;
}

const formatTime = (ts: number) => {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderMarkdown = (text: string) => {
	return text
		.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/\n/g, '<br>');
};

export const Message: React.FC<MessageProps> = ({ message, logoUri, onCopy }) => {
	const isUser = message.role === 'user';
	const [copyText, setCopyText] = React.useState('Copy');
	const [feedback, setFeedback] = React.useState<'up' | 'down' | null>(null);

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
					<span className="msg-author">{isUser ? 'Nithesh' : 'TraneAI'}</span>
					{isUser ? ',' : ''}
					<span className="msg-time">{isUser ? '3m ago' : formatTime(message.timestamp)}</span>
				</div>
				<div className="msg-bubble">
					{message.attachments && message.attachments.length > 0 && (
						<div className="file-chips">
							{message.attachments.map((file, index) => (
								<div key={index} className={`file-chip ${file.type}`}>
									{file.type === 'terminal' ? (
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
					<div className="msg-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}></div>
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
