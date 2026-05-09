import React from 'react';

export interface SessionSummary {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
}

interface ChatHistoryProps {
	sessions: SessionSummary[];
	currentSessionId: string;
	visible: boolean;
	onClose: () => void;
	onLoadSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => void;
	onNewChat: () => void;
}

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) { return 'just now'; }
	if (minutes < 60) { return `${minutes}m ago`; }
	if (hours < 24) { return `${hours}h ago`; }
	if (days < 7) { return `${days}d ago`; }
	return new Date(timestamp).toLocaleDateString();
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
	sessions,
	currentSessionId,
	visible,
	onClose,
	onLoadSession,
	onDeleteSession,
	onNewChat,
}) => {
	return (
		<>
			{visible && <div className="history-overlay" onClick={onClose} />}
			<div className={`history-panel${visible ? ' history-panel--open' : ''}`}>
				<div className="history-panel-header">
					<span className="history-panel-title">Chat History</span>
					<button className="history-close-btn" onClick={onClose} title="Close">
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
							<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						</svg>
					</button>
				</div>
				<div className="history-new-btn-wrap">
					<button className="history-new-btn" onClick={() => { onNewChat(); onClose(); }}>
						<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
							<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
						</svg>
						New Chat
					</button>
				</div>
				<div className="history-list">
					{sessions.length === 0 ? (
						<div className="history-empty">No previous chats yet</div>
					) : (
						sessions.map(session => (
							<div
								key={session.id}
								className={`history-item${session.id === currentSessionId ? ' history-item--active' : ''}`}
								onClick={() => { onLoadSession(session.id); onClose(); }}
							>
								<div className="history-item-title">{session.title}</div>
								<div className="history-item-meta">
									<span className="history-item-time">{formatRelativeTime(session.updatedAt)}</span>
									<span className="history-item-count">{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
								</div>
								<button
									className="history-item-delete"
									title="Delete"
									onClick={e => { e.stopPropagation(); onDeleteSession(session.id); }}
								>
									<svg width="11" height="11" viewBox="0 0 16 16" fill="none">
										<path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</button>
							</div>
						))
					)}
				</div>
			</div>
		</>
	);
};
