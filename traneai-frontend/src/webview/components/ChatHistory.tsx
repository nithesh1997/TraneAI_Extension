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
	loadingSessionId: string | null;
	visible: boolean;
	onClose: () => void;
	onLoadSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => void;
	onNewChat: () => void;
}

type GroupLabel = 'Today' | 'Yesterday' | 'Last 7 days' | 'Last 30 days' | 'Older';

interface SessionGroup {
	label: GroupLabel;
	sessions: SessionSummary[];
}

function getGroupLabel(timestamp: number): GroupLabel {
	const now = new Date();
	const date = new Date(timestamp);
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const yesterdayStart = todayStart - 86400000;
	const sevenDaysAgo = todayStart - 6 * 86400000;
	const thirtyDaysAgo = todayStart - 29 * 86400000;

	if (timestamp >= todayStart) return 'Today';
	if (timestamp >= yesterdayStart) return 'Yesterday';
	if (timestamp >= sevenDaysAgo) return 'Last 7 days';
	if (timestamp >= thirtyDaysAgo) return 'Last 30 days';
	return 'Older';
}

function groupSessions(sessions: SessionSummary[]): SessionGroup[] {
	const order: GroupLabel[] = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];
	const map = new Map<GroupLabel, SessionSummary[]>();

	for (const session of sessions) {
		const label = getGroupLabel(session.updatedAt);
		if (!map.has(label)) map.set(label, []);
		map.get(label)!.push(session);
	}

	return order
		.filter(label => map.has(label))
		.map(label => ({ label, sessions: map.get(label)! }));
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
	sessions,
	currentSessionId,
	loadingSessionId,
	visible,
	onClose,
	onLoadSession,
	onDeleteSession,
	onNewChat,
}) => {
	const groups = groupSessions(sessions);

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
						groups.map(group => (
							<div key={group.label} className="history-group">
								<div className="history-group-label">{group.label}</div>
								{group.sessions.map(session => (
									<div
										key={session.id}
										className={`history-item${session.id === currentSessionId ? ' history-item--active' : ''}${session.id === loadingSessionId ? ' history-item--loading' : ''}`}
										onClick={() => { 
											if (session.id !== loadingSessionId) {
												onLoadSession(session.id); 
												// Don't close immediately to show loader
												setTimeout(onClose, 150);
											}
										}}
									>
										<div className="history-item-title">{session.title}</div>
										{session.id === loadingSessionId ? (
											<div className="history-item-loader">
												<div className="history-spinner"></div>
											</div>
										) : session.id === currentSessionId && (
											<span className="history-item-current">Current</span>
										)}
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
								))}
							</div>
						))
					)}
				</div>
			</div>
		</>
	);
};
