import React from 'react';

interface WorkspaceEmptyStateProps {
	logoUri: string;
	onOpenFolder: () => void;
	onCloneRepository: () => void;
}

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({ logoUri, onOpenFolder, onCloneRepository }) => {
	return (
		<div className="workspace-empty-state">
			<div className="empty-state-icon">
				<img src={logoUri} alt="TraneAI" style={{ width: '32px', height: '32px' }} />
			</div>
			<h2 className="empty-state-title">Open a workspace to get started</h2>
			<p className="empty-state-description">
				TraneAI works with your codebase. Please open a folder or clone a repository to continue.
			</p>
			<div className="empty-state-actions">
				<button className="empty-state-btn primary" onClick={onOpenFolder}>
					Open folder
				</button>
				<button className="empty-state-btn" onClick={onCloneRepository}>
					Clone repository
				</button>
			</div>
		</div>
	);
};
