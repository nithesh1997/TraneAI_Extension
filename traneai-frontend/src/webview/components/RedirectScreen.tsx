import React from 'react';

interface RedirectScreenProps {
	logoUri: string;
	onRestore: () => void;
}

export const RedirectScreen: React.FC<RedirectScreenProps> = ({ logoUri, onRestore }) => {
	return (
		<div className="redirect-container">
			<img src={logoUri} alt="TraneAI" />
			<div className="redir-title">Opened in Editor</div>
			<div className="redir-sub">The chat is currently open in the main editor panel.</div>
			<button className="restore-btn" onClick={onRestore}>← Return to Sidebar</button>
		</div>
	);
};
