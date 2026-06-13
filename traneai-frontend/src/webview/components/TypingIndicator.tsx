import React, { useState, useEffect } from 'react';

interface TypingIndicatorProps {
	logoUri: string;
	visible: boolean;
}

const THINKING_MESSAGES = [
	'Thinking',
	'Working',
	'Processing',
	'Analyzing',
	'Computing',
];

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ logoUri, visible }) => {
	const [msgIndex, setMsgIndex] = useState(0);

	useEffect(() => {
		if (!visible) return;
		const interval = setInterval(() => {
			setMsgIndex(i => (i + 1) % THINKING_MESSAGES.length);
		}, 2000);
		return () => clearInterval(interval);
	}, [visible]);

	if (!visible) return null;

	return (
		<div className="typing-indicator visible" id="typing-indicator">
			<div className="avatar ai-avatar"><img src={logoUri} alt="AI" /></div>
			<div className="typing-card">
				<div className="typing-card-content">
					<div className="typing-dots">
						<div className="typing-dot"></div>
						<div className="typing-dot"></div>
						<div className="typing-dot"></div>
					</div>
					<span className="typing-label">{THINKING_MESSAGES[msgIndex]}</span>
				</div>
				<div className="typing-card-bar">
					<div className="typing-card-bar-fill" />
				</div>
			</div>
		</div>
	);
};
