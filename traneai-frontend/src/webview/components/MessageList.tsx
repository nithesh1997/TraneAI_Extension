import React from 'react';
import { Message, MessageData, EditProposal } from './Message';

interface MessageListProps {
	messages: MessageData[];
	logoUri: string;
	onCopy: (text: string) => void;
	userEmail?: string | null;
	onApplyEdit?: (edit: EditProposal) => void;
	onApplyMultiEdit?: (edits: EditProposal[]) => void;
	onRejectEdit?: (edit: EditProposal) => void;
	onRevertEdit?: (edit: EditProposal) => void;
	onShowDiff?: (edit: EditProposal) => void;
	onOpenFile?: (path: string) => void;
	onFixCommand?: (cmd: string, output: string) => void;
	onSelectChoice?: (choice: string, command?: string) => void;
	onSpeak?: (text: string) => void;
}

export const MessageList: React.FC<MessageListProps> = React.memo(({ messages, logoUri, onCopy, userEmail, onApplyEdit, onApplyMultiEdit, onRejectEdit, onRevertEdit, onShowDiff, onOpenFile, onFixCommand, onSelectChoice, onSpeak }) => {
	const listRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (listRef.current) {
			const container = listRef.current.parentElement;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}
	}, [messages]);

	return (
		<div id="messages-list" className="messages-list" ref={listRef}>
			{messages.map((msg, idx) => (
				<Message 
					key={idx} 
					message={msg} 
					logoUri={logoUri} 
					onCopy={onCopy} 
					userEmail={userEmail}
					onApplyEdit={onApplyEdit}
					onApplyMultiEdit={onApplyMultiEdit}
					onRejectEdit={onRejectEdit}
					onRevertEdit={onRevertEdit}
					onShowDiff={onShowDiff}
					onOpenFile={onOpenFile}
					onFixCommand={onFixCommand}
					onSelectChoice={onSelectChoice}
					onSpeak={onSpeak}
				/>
			))}
		</div>
	);
});
