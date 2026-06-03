import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
// Developed at Trane Technologies by: Nithesh Kumar Ve.U (Dev & Architect), Vempali, Mahalakshmi (QA & Architect)
import { AppHeader } from './components/AppHeader';
import { HeroSection } from './components/HeroSection';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { TypingIndicator } from './components/TypingIndicator';
import { RedirectScreen } from './components/RedirectScreen';
import { ChatFooter } from './components/ChatFooter';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import { WorkspaceEmptyState } from './components/WorkspaceEmptyState';
import { ChatHistory, SessionSummary } from './components/ChatHistory';
import { MessageData, Attachment, EditProposal } from './components/Message';
import { ConsolePanel, LogEntry, LogLevel, LogSource } from './components/ConsolePanel';
import { secureStore, secureRetrieve } from './utils/storage';
import { VoiceService } from './utils/VoiceService';

const TAB_STORAGE_KEY = 'traneai_tab';

interface StoredTab {
	currentModel: string;
	authView: 'login' | 'signup';
	currentSessionId?: string;
	consoleFilter?: string;
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
	const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
	const [workspaceOpen, setWorkspaceOpen] = useState(true);
	const [workspaceRoot, setWorkspaceRoot] = useState<string>(() => {
		const state = vscode.getState();
		return state?.workspaceRoot || '';
	});
	const [isLoading, setIsLoading] = useState(true);
	const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
	const [consoleVisible, setConsoleVisible] = useState(false);
	const [consoleFilter, setConsoleFilter] = useState('all');

	useEffect(() => {
		secureRetrieve<StoredTab>(TAB_STORAGE_KEY).then(stored => {
			if (stored?.currentModel) { setCurrentModel(stored.currentModel); }
			if (stored?.authView) { setAuthView(stored.authView); }
			if (stored?.consoleFilter) { setConsoleFilter(stored.consoleFilter); }
		}).finally(() => {
			if (!isAuthenticated) {
				setIsLoading(false);
			}
		});
	}, [isAuthenticated]);

	useEffect(() => {
		if (isAuthenticated) {
			setIsLoading(true);
			secureRetrieve<StoredTab>(TAB_STORAGE_KEY).then(stored => {
				if (stored?.currentSessionId) {
					vscode.postMessage({ command: 'loadSession', sessionId: stored.currentSessionId });
				} else {
					setIsLoading(false);
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
					if (message.workspaceOpen !== undefined) {
						setWorkspaceOpen(message.workspaceOpen);
					}
					if (message.workspaceRoot) {
						setWorkspaceRoot(message.workspaceRoot);
						const state = vscode.getState() || {};
						vscode.setState({ ...state, workspaceRoot: message.workspaceRoot });
					}
					setIsLoading(false);
					setLoadingSessionId(null);
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
					setLoadingSessionId(null);
					if (message.workspaceOpen !== undefined) {
						setWorkspaceOpen(message.workspaceOpen);
					}
					break;
				case 'consoleLogs':
					setConsoleLogs(message.logs);
					// Auto-show console if there are errors
					if (message.logs.some((l: LogEntry) => l.level === LogLevel.Error)) {
						setConsoleVisible(true);
					}
					break;
				case 'audioResult':
					const voiceService = new VoiceService();
					voiceService.playAudio(message.audioData).catch(err => {
						console.error('Failed to play audio:', err);
					});
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	useEffect(() => {
		secureStore(TAB_STORAGE_KEY, { currentModel, authView, currentSessionId, consoleFilter });
	}, [currentModel, authView, currentSessionId, consoleFilter]);

	const handleSendMessage = useCallback((text: string, model: string, attachments: Attachment[], pinnedFiles?: string[]) => {
		vscode.postMessage({ command: 'sendMessage', text, model, attachments, pinnedFiles });
	}, []);

	const handleFilesSelected = useCallback((files: string[]) => {
		vscode.postMessage({ command: 'filesSelected', files });
	}, []);

	const handleQuickSend = useCallback((action: string, text: string) => {
		vscode.postMessage({ command: 'quickAction', action, text });
	}, []);

	const handleNewChat = useCallback(() => {
		vscode.postMessage({ command: 'newChat' });
	}, []);

	const handleClearChat = useCallback(() => {
		vscode.postMessage({ command: 'clearChat' });
	}, []);

	const handleStopGeneration = useCallback(() => {
		vscode.postMessage({ command: 'stopGeneration' });
	}, []);

	const handleRestore = useCallback(() => {
		vscode.postMessage({ command: 'restore' });
	}, []);

	const handleCopy = useCallback((text: string) => {
		vscode.postMessage({ command: 'copyMessage', text });
	}, []);

	const handleShowHistory = useCallback(() => {
		vscode.postMessage({ command: 'loadHistory' });
		setHistoryOpen(true);
	}, []);

	const handleLoadSession = useCallback((sessionId: string) => {
		setLoadingSessionId(sessionId);
		vscode.postMessage({ command: 'loadSession', sessionId });
	}, []);

	const handleDeleteSession = useCallback((sessionId: string) => {
		vscode.postMessage({ command: 'deleteSession', sessionId });
	}, []);

	const handleOpenFolder = useCallback(() => {
		vscode.postMessage({ command: 'openFolder' });
	}, []);

	const handleCloneRepository = useCallback(() => {
		vscode.postMessage({ command: 'cloneRepository' });
	}, []);

	const handleApplyEdit = useCallback((edit: EditProposal) => {
		vscode.postMessage({ 
			command: 'applyEdit', 
			filePath: edit.filePath, 
			oldText: edit.oldContent, 
			newText: edit.newContent 
		});
	}, []);

	const handleRejectEdit = useCallback((edit: EditProposal) => {
		console.log('Edit rejected:', edit.filePath);
	}, []);

	const handleRevertEdit = useCallback((edit: EditProposal) => {
		vscode.postMessage({ 
			command: 'revertEdit', 
			filePath: edit.filePath, 
			oldText: edit.oldContent, 
			newText: edit.newContent 
		});
	}, []);

	const handleShowDiff = useCallback((edit: EditProposal) => {
		vscode.postMessage({ 
			command: 'showDiff', 
			filePath: edit.filePath, 
			oldText: edit.oldContent, 
			newText: edit.newContent 
		});
	}, []);

	const handleApplyMultiEdit = useCallback((edits: EditProposal[]) => {
		vscode.postMessage({ 
			command: 'applyMultiEdit', 
			edits
		});
	}, []);

	const handleFixCommand = useCallback((cmd: string, output: string) => {
		const text = `I got an error while running: \`${cmd}\`\nOutput:\n\`\`\`\n${output}\n\`\`\`\nPlease fix this error.`;
		handleSendMessage(text, currentModel, []);
	}, [handleSendMessage, currentModel]);

	const handleFixLog = useCallback((log: LogEntry) => {
		vscode.postMessage({ command: 'fixLog', log, model: currentModel });
	}, [currentModel]);

	const handleClearLogs = useCallback(() => {
		vscode.postMessage({ command: 'clearLogs' });
	}, []);

	const handleExecuteExpression = useCallback((expression: string, checkedLogs: LogEntry[]) => {
		if (checkedLogs && checkedLogs.length > 0) {
			const logAttachments: Attachment[] = checkedLogs.map(l => ({
				name: `${l.level}: ${l.message}`,
				path: l.file || 'runtime',
				type: 'console'
			}));
			
			const logsContext = checkedLogs.map(l => 
				`[${l.level}] ${l.message}${l.file ? ` (${l.file}:${l.line})` : ''}`
			).join('\n');
			
			// We still include a summary in message text for the LLM context, but use attachments for UI
			const textForAI = `${expression}\n\nRelevant logs:\n\`\`\`\n${logsContext}\n\`\`\``;
			
			setIsTyping(true);
			handleSendMessage(textForAI, currentModel, logAttachments);
			
			setConsoleVisible(false);
		} else {
			vscode.postMessage({ command: 'executeExpression', expression });
		}
	}, [handleSendMessage, currentModel]);

	const handleSpeak = useCallback((text: string) => {
		vscode.postMessage({ command: 'speakText', text });
	}, []);

	const handleOpenFile = useCallback((filePath: string) => {
		vscode.postMessage({ command: 'openFile', filePath });
	}, []);

	const handleSelectChoice = useCallback((choice: string, command?: string) => {
		vscode.postMessage({ command: command || 'selectChoice', choice });
	}, []);

	const isSidebar = document.body.classList.contains('sidebar');
	const showRedirect = isFullScreen && isSidebar;

	if (isLoading) {
		return (
			<div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
				<img src={LOGO_URI} alt="TraneAI" style={{ width: '48px', height: '48px', animation: 'pulse 2s infinite' }} />
				<div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading your session...</div>
			</div>
		);
	}

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
				<ConsolePanel 
					logs={consoleLogs} 
					onFix={handleFixLog} 
					onClear={handleClearLogs}
					onExecuteExpression={handleExecuteExpression}
					visible={consoleVisible} 
					onClose={() => setConsoleVisible(false)}
					filter={consoleFilter}
					onFilterChange={setConsoleFilter}
					isLoading={isTyping}
					logoUri={LOGO_URI}
				/>
				<MessageList 
					messages={messages} 
					logoUri={LOGO_URI} 
					onCopy={handleCopy} 
					userEmail={email} 
					onApplyEdit={handleApplyEdit} 
					onApplyMultiEdit={handleApplyMultiEdit}
					onRejectEdit={handleRejectEdit} 
					onRevertEdit={handleRevertEdit}
					onShowDiff={handleShowDiff}
					onOpenFile={handleOpenFile}
					onFixCommand={handleFixCommand}
					onSelectChoice={handleSelectChoice}
					onSpeak={handleSpeak}
				/>
				<TypingIndicator 
					logoUri={LOGO_URI} 
					visible={isTyping && !messages.some(m => m.isStreaming)} 
				/>
			</div>
			<div className="chat-input-section">
				<InputArea
					onSendMessage={handleSendMessage}
					onFilesSelected={handleFilesSelected}
					currentModel={currentModel}
					onModelChange={setCurrentModel}
					isTyping={isTyping}
					onStopGeneration={handleStopGeneration}
					workspaceRoot={workspaceRoot}
					onToggleConsole={() => setConsoleVisible(!consoleVisible)}
					isConsoleVisible={consoleVisible}
				/>
				<ChatFooter />
			</div>
			<ChatHistory
				sessions={historySessions}
				currentSessionId={currentSessionId}
				loadingSessionId={loadingSessionId}
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
