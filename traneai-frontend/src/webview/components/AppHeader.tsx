import React from 'react';
import { useAuth } from '../context/AuthContext';

interface AppHeaderProps {
	logoUri: string;
	onNewChat: () => void;
	onClearChat: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ logoUri, onNewChat, onClearChat }) => {
	const { logout } = useAuth();

	return (
		<div className="app-header">
			<img src={logoUri} className="header-logo" alt="TraneAI" />
			<div className="header-title"><span>TraneAI</span></div>
			<div className="header-badge">
				<div className="header-badge-dot"></div>
				Online
			</div>
			<div className="header-actions">
				<button className="hdr-btn" title="New Chat" onClick={onNewChat}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
						<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
				</button>
				<button className="hdr-btn" title="Clear Chat" onClick={onClearChat}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
						<path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</button>
				<button className="hdr-btn hdr-btn--logout" title="Logout" onClick={logout}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
						<path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
						<path d="M10 11l3-3-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
						<path d="M13 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
					</svg>
					Logout
				</button>
			</div>
		</div>
	);
};
