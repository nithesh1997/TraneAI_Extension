import React from 'react';

interface TypingIndicatorProps {
	logoUri: string;
	visible: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ logoUri, visible }) => {
	if (!visible) return null;

	return (
		<div className="typing-indicator visible" id="typing-indicator">
			<div className="avatar ai-avatar"><img src={logoUri} alt="AI" /></div>
			<div className="typing-dots">
				<div className="typing-dot"></div>
				<div className="typing-dot"></div>
				<div className="typing-dot"></div>
			</div>
		</div>
	);
};
