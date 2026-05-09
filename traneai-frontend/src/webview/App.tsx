import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppHeader } from './components/AppHeader';
import { HeroSection } from './components/HeroSection';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { TypingIndicator } from './components/TypingIndicator';
import { RedirectScreen } from './components/RedirectScreen';
import { ChatFooter } from './components/ChatFooter';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import { ChatHistory, SessionSummary } from './components/ChatHistory';
import { MessageData, Attachment } from './components/Message';
import { secureStore, secureRetrieve } from './utils/storage';

const TAB_STORAGE_KEY = 'traneai_tab';

interface StoredTab {
	currentModel: string;
	authView: 'login' | 'signup';
	currentSessionId?: string;
}

declare const vscode: any;
declare const LOGO_URI: string;

const ChatApp: React.FC = () => {
	const { isAuthenticated, email } = useAuth();
	const [authView, setAuthView] = useState<'login' | 'signup'>('login');
	const [messages, setMessages] = useState<MessageData[]>([]);
	const [isTyping, setIsTyping] = useState(false);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [currentModel, setCurrentModel] = useState('auto');
	const [historyOpen, setHistoryOpen] = useState(false);
	const [historySessions, setHistorySessions] = useState<SessionSummary[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState('');

	useEffect(() => {
		secureRetrieve<StoredTab>(TAB_STORAGE_KEY).then(stored => {
			if (stored?.currentModel) { setCurrentModel(stored.currentModel); }
			if (stored?.authView) { setAuthView(stored.authView); }
		});
	}, []);

	useEffect(() => {
		if (isAuthenticated) {
			secureRetrieve<StoredTab>(TAB_STORAGE_KEY).then(stored => {
				if (stored?.currentSessionId) {
					vscode.postMessage({ command: 'loadSession', sessionId: stored.currentSessionId });
				}
			});
		} else {
			setCurrentSessionId('');
		}
	}, [isAuthenticated]);

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
				case 'historyList':
					setHistorySessions(message.sessions);
					setCurrentSessionId(message.currentSessionId);
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	useEffect(() => {
		secureStore(TAB_STORAGE_KEY, { currentModel, authView, currentSessionId });
	}, [currentModel, authView, currentSessionId]);

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
		vscode.postMessage({ command: 'newChat' });
	};

	const handleClearChat = () => {
		vscode.postMessage({ command: 'clearChat' });
	};

	const handleStopGeneration = () => {
		vscode.postMessage({ command: 'stopGeneration' });
	};

	const handleRestore = () => {
		vscode.postMessage({ command: 'restore' });
	};

	const handleCopy = (text: string) => {
		vscode.postMessage({ command: 'copyMessage', text });
	};

	const handleShowHistory = () => {
		vscode.postMessage({ command: 'loadHistory' });
		setHistoryOpen(true);
	};

	const handleLoadSession = (sessionId: string) => {
		vscode.postMessage({ command: 'loadSession', sessionId });
	};

	const handleDeleteSession = (sessionId: string) => {
		vscode.postMessage({ command: 'deleteSession', sessionId });
	};

	const isSidebar = document.body.classList.contains('sidebar');
	const showRedirect = isFullScreen && isSidebar;

	if (!isAuthenticated) {
		return authView === 'login' ? (
			<LoginPage logoUri={LOGO_URI} onSwitchToSignup={() => setAuthView('signup')} />
		) : (
			<SignupPage logoUri={LOGO_URI} onSwitchToLogin={() => setAuthView('login')} />
		);
	}

	if (showRedirect) {
		return <RedirectScreen logoUri={LOGO_URI} onRestore={handleRestore} />;
	}

	return (
		<div className="main-content">
			<AppHeader
				logoUri={LOGO_URI}
				onNewChat={handleNewChat}
				onClearChat={handleClearChat}
				onShowHistory={handleShowHistory}
			/>
			<div id="chat-container" className="chat-container">
				<HeroSection logoUri={LOGO_URI} onQuickSend={handleQuickSend} visible={messages.length === 0} currentModel={currentModel} />
				<MessageList messages={messages} logoUri={LOGO_URI} onCopy={handleCopy} userEmail={email} />
				<TypingIndicator logoUri={LOGO_URI} visible={isTyping} />
			</div>
			<div className="chat-input-section">
				<InputArea
					onSendMessage={handleSendMessage}
					onFilesSelected={handleFilesSelected}
					currentModel={currentModel}
					onModelChange={setCurrentModel}
					isTyping={isTyping}
					onStopGeneration={handleStopGeneration}
				/>
				<ChatFooter />
			</div>
			<ChatHistory
				sessions={historySessions}
				currentSessionId={currentSessionId}
				visible={historyOpen}
				onClose={() => setHistoryOpen(false)}
				onLoadSession={handleLoadSession}
				onDeleteSession={handleDeleteSession}
				onNewChat={handleNewChat}
			/>
		</div>
	);
};

export const App: React.FC = () => {
	return (
		<AuthProvider>
			<ChatApp />
		</AuthProvider>
	);
};
