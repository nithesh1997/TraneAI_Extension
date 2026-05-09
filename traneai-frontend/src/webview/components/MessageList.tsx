import React from 'react';
import { Message, MessageData } from './Message';

interface MessageListProps {
	messages: MessageData[];
	logoUri: string;
	onCopy: (text: string) => void;
	userEmail?: string | null;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, logoUri, onCopy, userEmail }) => {
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
				<Message key={idx} message={msg} logoUri={logoUri} onCopy={onCopy} userEmail={userEmail} />
			))}
		</div>
	);
};
