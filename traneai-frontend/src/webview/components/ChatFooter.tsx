import React from 'react';

export const ChatFooter: React.FC = () => {
	return (
		<div className="footer">
			<div className="footer-item" title="Change context scope">
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
					<path d="M5 13h6M8 11v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
				</svg>
				Local
				<svg width="8" height="8" viewBox="0 0 16 16" fill="none">
					<path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>
			<div className="footer-item" title="Approval settings">
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
					<path d="M8 2L3 4.5V8c0 2.8 2.3 5.2 5 6 2.7-.8 5-3.2 5-6V4.5L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
				</svg>
				Default Approvals
				<svg width="8" height="8" viewBox="0 0 16 16" fill="none">
					<path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>
		</div>
	);
};
