import React, { useState, useEffect } from 'react';
import { AppHeader } from './components/AppHeader';
import { HeroSection } from './components/HeroSection';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { TypingIndicator } from './components/TypingIndicator';
import { RedirectScreen } from './components/RedirectScreen';
import { ChatFooter } from './components/ChatFooter';
import { MessageData, Attachment } from './components/Message';

declare const vscode: any;
declare const LOGO_URI: string;

export const App: React.FC = () => {
	const [messages, setMessages] = useState<MessageData[]>([]);
	const [isTyping, setIsTyping] = useState(false);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [currentModel, setCurrentModel] = useState('auto');

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			switch (message.type) {
				case 'syncMessages':
					setMessages(message.messages);
					break;
				case 'typing':
					setIsTyping(message.value);
					break;
				case 'setFullScreen':
					setIsFullScreen(message.value);
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const handleSendMessage = (text: string, model: string, attachments: Attachment[]) => {
		vscode.postMessage({ command: 'sendMessage', text, model, attachments });
	};

	const handleFilesSelected = (files: string[]) => {
		vscode.postMessage({ command: 'filesSelected', files });
	};

	const handleQuickSend = (action: string, text: string) => {
		vscode.postMessage({ command: 'quickAction', action, text });
	};

	const handleNewChat = () => {
		vscode.postMessage({ command: 'clearChat' });
	};

	const handleClearChat = () => {
		vscode.postMessage({ command: 'clearChat' });
	};

	const handleRestore = () => {
		vscode.postMessage({ command: 'restore' });
	};

	const handleCopy = (text: string) => {
		vscode.postMessage({ command: 'copyMessage', text });
	};

	const isSidebar = document.body.classList.contains('sidebar');
	const showRedirect = isFullScreen && isSidebar;

	if (showRedirect) {
		return <RedirectScreen logoUri={LOGO_URI} onRestore={handleRestore} />;
	}

	return (
		<div className="main-content">
			<AppHeader logoUri={LOGO_URI} onNewChat={handleNewChat} onClearChat={handleClearChat} />
			<div id="chat-container" className="chat-container">
				<HeroSection logoUri={LOGO_URI} onQuickSend={handleQuickSend} visible={messages.length === 0} currentModel={currentModel} />
				<MessageList messages={messages} logoUri={LOGO_URI} onCopy={handleCopy} />
				<TypingIndicator logoUri={LOGO_URI} visible={isTyping} />
			</div>
			<div className="chat-input-section">
				<InputArea
					onSendMessage={handleSendMessage}
					onFilesSelected={handleFilesSelected}
					currentModel={currentModel}
					onModelChange={setCurrentModel}
				/>
				<ChatFooter />
			</div>
		</div>
	);
};
