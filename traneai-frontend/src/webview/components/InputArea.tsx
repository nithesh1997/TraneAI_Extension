import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Tag } from 'antd';
import { Attachment } from './Message';

interface InputAreaProps {
	onSendMessage: (text: string, model: string, attachments: Attachment[], pinnedFiles?: string[]) => void;
	onFilesSelected: (files: string[]) => void;
	currentModel: string;
	onModelChange: (model: string) => void;
	terminalPath?: string;
	isTyping?: boolean;
	onStopGeneration?: () => void;
	workspaceRoot?: string;
}

const MODELS = [
	{ id: 'auto', name: 'Auto', icon: '⚡', canAttachFiles: true },
	{ id: 'zenflow', name: 'Zenflow', icon: '🌊', canAttachFiles: true },
	{ id: 'new-joiner', name: 'New Joiner', icon: '🧩', canAttachFiles: true },
	{ id: 'developers', name: 'Developers', icon: '💻', canAttachFiles: true },
	{ id: 'qa', name: 'QA', icon: '🧪', canAttachFiles: true },
	{ id: 'eva', name: 'EVA', icon: '🤖', canAttachFiles: true },
	{ id: 'automated-testing', name: 'Automated Testing', icon: '🔄', canAttachFiles: true },
];

const SKILLS = [
	{ id: 'review', icon: '🔍' },
	{ id: 'styles', icon: '🎨' },
	{ id: 'code-review', icon: '🔍' },
	{ id: 'comprehensive-review', icon: '📋' },
	{ id: 'cross-review', icon: '🔀' },
	{ id: 'frontend-design', icon: '🎨' },
	{ id: 'init', icon: '🚀' },
	{ id: 'plan', icon: '📐' },
	{ id: 'playwright', icon: '🎭' },
	{ id: 'research', icon: '🔬' },
	{ id: 'skill-creator', icon: '⚙️' },
	{ id: 'morning-sunlight', icon: '☀️' },
	{ id: 'delayed-caffeine', icon: '☕' },
	{ id: 'deep-work', icon: '🧠' },
	{ id: 'habit-stacking', icon: '🧱' },
	{ id: 'nsdr', icon: '🧘' },
	{ id: 'evening-shutdown', icon: '🌙' },
];

const MODE_SKILLS: Record<string, string[]> = {
	'auto': [],
	'new-joiner': ['init', 'plan', 'research'],
	'developers': ['review', 'styles', 'code-review', 'comprehensive-review', 'cross-review', 'frontend-design', 'init', 'plan', 'research', 'skill-creator'],
	'qa': ['playwright', 'research', 'comprehensive-review'],
	'eva': [],
	'automated-testing': ['playwright']
};

const CONTEXT_OPTIONS = [
	{ 
		id: 'folders', 
		title: 'Folders', 
		description: 'Add all files in a folder to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M1.5 3.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1v-8.5z" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		)
	},
	{ 
		id: 'files', 
		title: 'Files', 
		description: 'Add a file to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M2.5 3.5a1 1 0 011-1h6.5l3.5 3.5v7.5a1 1 0 01-1 1h-9a1 1 0 01-1-1v-10z" stroke="currentColor" strokeWidth="1.2" />
				<path d="M10 2.5v3.5h3.5" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		)
	},
	{ 
		id: 'code', 
		title: 'Code', 
		description: 'Add code to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3l-2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		)
	},
	{ 
		id: 'prompts', 
		title: 'Prompts', 
		description: 'Add a saved prompt to context', 
		icon: (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M8 1.5l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5zM12 8.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5zM4 10.5l.3 1 .1 1 .3-1 1-.3-1-.3-.3-1-.3 1-1 .3 1 .3z" fill="currentColor" />
			</svg>
		)
	},
];

declare const vscode: any;

export const InputArea: React.FC<InputAreaProps> = React.memo(({ onSendMessage, onFilesSelected, currentModel, onModelChange, terminalPath, isTyping, onStopGeneration, workspaceRoot: workspaceRootProp }) => {
	const [text, setText] = useState(() => {
		const state = vscode.getState();
		return state?.inputText || '';
	});
	const [showModelDropdown, setShowModelDropdown] = useState(false);
	const [showSkillsDropdown, setShowSkillsDropdown] = useState(false);
	const [showAttachmentDropdown, setShowAttachmentDropdown] = useState(false);
	const [showContextDropdown, setShowContextDropdown] = useState(false);
	const [attachedFiles, setAttachedFiles] = useState<Attachment[]>(() => {
		const state = vscode.getState();
		return state?.attachedFiles || [];
	});
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDraggingOver, setIsDraggingOver] = useState(false);

	// Persist input text and files
	useEffect(() => {
		const timer = setTimeout(() => {
			const state = vscode.getState() || {};
			vscode.setState({ ...state, inputText: text, attachedFiles: attachedFiles });
		}, 500);
		return () => clearTimeout(timer);
	}, [text, attachedFiles]);

	const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
	const [workspaceFolders, setWorkspaceFolders] = useState<string[]>([]);
	const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
	const [filteredFolders, setFilteredFolders] = useState<string[]>([]);
	const [showFileDropdown, setShowFileDropdown] = useState(false);
	const [showFolderDropdown, setShowFolderDropdown] = useState(false);
	const [mentionQuery, setMentionQuery] = useState('');

	// Fetch workspace files and folders
	useEffect(() => {
		const fetchData = async () => {
			try {
				const state = vscode.getState();
				const workspaceRoot = workspaceRootProp || state?.workspaceRoot;
				
				if (!workspaceRoot) {
					vscode.postMessage({ command: 'getWorkspaceRoot' });
					return;
				}
				
				// Fetch files
				const filesResponse = await fetch(`http://localhost:5000/api/workspace/files?root=${encodeURIComponent(workspaceRoot)}`);
				if (filesResponse.ok) {
					const files = await filesResponse.json();
					setWorkspaceFiles(files);
				}

				// Fetch folders
				const foldersResponse = await fetch(`http://localhost:5000/api/workspace/folders?root=${encodeURIComponent(workspaceRoot)}`);
				if (foldersResponse.ok) {
					const folders = await foldersResponse.json();
					setWorkspaceFolders(folders);
				}
			} catch (error) {
				console.error('Failed to fetch workspace data:', error);
			}
		};
		fetchData();
	}, [workspaceRootProp]);

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const el = e.target;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
		const value = el.value;
		setText(value);

		const cursorPosition = el.selectionStart;
		const textBeforeCursor = value.substring(0, cursorPosition);
		const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
		
		if (lastAtSymbolIndex !== -1 && !textBeforeCursor.substring(lastAtSymbolIndex).includes(' ')) {
			const query = textBeforeCursor.substring(lastAtSymbolIndex + 1);
			setMentionQuery(query);
			
			if (query.length > 0) {
				if (showFolderDropdown) {
					setFilteredFolders(workspaceFolders.filter(f => f.toLowerCase().includes(query.toLowerCase())).slice(0, 8));
				} else {
					setFilteredFiles(workspaceFiles.filter(f => f.toLowerCase().includes(query.toLowerCase())).slice(0, 8));
					setShowFileDropdown(true);
				}
				setShowContextDropdown(false);
			} else {
				// Just "@" - reset to main context menu
				setShowFileDropdown(false);
				setShowFolderDropdown(false);
				setShowContextDropdown(true);
			}
			
			setShowSkillsDropdown(false);
			setShowModelDropdown(false);
			setShowAttachmentDropdown(false);
		} else {
			setShowFileDropdown(false);
			setShowFolderDropdown(false);
			setShowContextDropdown(false);
		}
	};

	const selectFileMention = (fileName: string) => {
		const cursorPosition = textareaRef.current?.selectionStart || 0;
		const textBeforeCursor = text.substring(0, cursorPosition);
		const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
		
		const newText = text.substring(0, lastAtSymbolIndex) + '@' + fileName + ' ' + text.substring(cursorPosition);
		setText(newText);
		
		if (!attachedFiles.find(f => f.name === fileName)) {
			setAttachedFiles([...attachedFiles, { name: fileName, path: fileName, type: 'file' }]);
		}
		
		setShowFileDropdown(false);
		textareaRef.current?.focus();
	};

	const selectFolderMention = (folderName: string) => {
		const cursorPosition = textareaRef.current?.selectionStart || 0;
		const textBeforeCursor = text.substring(0, cursorPosition);
		const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
		
		const newText = text.substring(0, lastAtSymbolIndex) + '@' + folderName + ' ' + text.substring(cursorPosition);
		setText(newText);
		
		if (!attachedFiles.find(f => f.name === folderName)) {
			setAttachedFiles([...attachedFiles, { name: folderName, path: folderName, type: 'folder' }]);
		}
		
		setShowFolderDropdown(false);
		textareaRef.current?.focus();
	};

	const handleKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleSend = () => {
		if (!text.trim() && attachedFiles.length === 0) return;
		
		// Add selected mode as a skill if not already present in the text
		let finalChatText = text;
		const modeSkill = `@${currentModel}`;
		if (text.trim() && !text.includes(modeSkill) && currentModel !== 'auto') {
			finalChatText = `${modeSkill} ${text}`;
		} else if (!text.trim() && currentModel !== 'auto') {
			finalChatText = `${modeSkill}`;
		}

		const pinnedFiles = attachedFiles.filter(f => f.isPinned).map(f => f.path).filter(Boolean) as string[];
		onSendMessage(finalChatText, currentModel, attachedFiles, pinnedFiles);
		
		setText('');
		
		// Keep only pinned files for the next message
		const nextAttachedFiles = attachedFiles.filter(f => f.isPinned);
		setAttachedFiles(nextAttachedFiles);

		// Persist state
		const state = vscode.getState() || {};
		vscode.setState({ ...state, inputText: '', attachedFiles: nextAttachedFiles });
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);

		const readFile = (f: File): Promise<Attachment> => new Promise((resolve) => {
			if (f.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (ev) => {
					const dataUrl = ev.target?.result as string;
					const base64 = dataUrl.split(',')[1];
					resolve({ name: f.name, path: f.name, type: 'image', imageData: base64, mimeType: f.type });
				};
				reader.readAsDataURL(f);
			} else {
				resolve({ name: f.name, path: f.name, type: 'file' });
			}
		});

		Promise.all(files.map(readFile)).then(newFiles => {
			const updatedFiles = [...attachedFiles, ...newFiles];
			setAttachedFiles(updatedFiles);
			onFilesSelected(updatedFiles.map(f => f.name));
		});

		e.target.value = '';
		setShowAttachmentDropdown(false);
	};

	// Helper: read a File/Blob as an Attachment
	const readImageFile = useCallback((f: File): Promise<Attachment> => new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = (ev) => {
			const dataUrl = ev.target?.result as string;
			const base64 = dataUrl.split(',')[1];
			resolve({ name: f.name || `pasted-image-${Date.now()}.png`, path: f.name || `pasted-image.png`, type: 'image', imageData: base64, mimeType: f.type || 'image/png' });
		};
		reader.readAsDataURL(f);
	}), []);

	// Handle paste events — intercept clipboard images
	const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = Array.from(e.clipboardData?.items || []);
		const imageItems = items.filter(item => item.type.startsWith('image/'));
		if (imageItems.length === 0) return; // no images → let default text paste happen

		e.preventDefault();
		const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
		Promise.all(files.map(readImageFile)).then(newAttachments => {
			const updatedFiles = [...attachedFiles, ...newAttachments];
			setAttachedFiles(updatedFiles);
			onFilesSelected(updatedFiles.map(f => f.name));
		});
	}, [attachedFiles, onFilesSelected, readImageFile]);

	// Drag-and-drop handlers
	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		const hasImages = Array.from(e.dataTransfer.items || []).some(i => i.type.startsWith('image/'));
		if (!hasImages) return;
		e.preventDefault();
		setIsDraggingOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		// Only clear if leaving the container itself (not a child)
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
			setIsDraggingOver(false);
		}
	}, []);

	const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		setIsDraggingOver(false);
		e.preventDefault();
		const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
		if (files.length === 0) return;
		Promise.all(files.map(readImageFile)).then(newAttachments => {
			const updatedFiles = [...attachedFiles, ...newAttachments];
			setAttachedFiles(updatedFiles);
			onFilesSelected(updatedFiles.map(f => f.name));
		});
	}, [attachedFiles, onFilesSelected, readImageFile]);

	const togglePin = (index: number) => {
		const newFiles = [...attachedFiles];
		newFiles[index].isPinned = !newFiles[index].isPinned;
		setAttachedFiles(newFiles);
	};

	const removeFile = (index: number) => {
		const updatedFiles = attachedFiles.filter((_, i) => i !== index);
		setAttachedFiles(updatedFiles);
		onFilesSelected(updatedFiles.map(f => f.name));
	};

	const selectContextOption = (id: string) => {
		if (id === 'files') {
			setFilteredFiles(workspaceFiles.slice(0, 8));
			setShowFileDropdown(true);
			setShowContextDropdown(false);
		} else if (id === 'folders') {
			setFilteredFolders(workspaceFolders.slice(0, 8));
			setShowFolderDropdown(true);
			setShowContextDropdown(false);
		} else {
			const newText = text.endsWith('@') ? text.slice(0, -1) : text;
			setText(newText + '#' + id + ' ');
			setShowContextDropdown(false);
		}
		textareaRef.current?.focus();
	};

	const selectSkill = (skill: string) => {
		const newText = (text ? text + ' ' : '') + '@' + skill + ' ';
		setText(newText);
		setShowSkillsDropdown(false);
		textareaRef.current?.focus();
	};

	const charCount = text.length;
	const counterClass = charCount > 1000 ? 'danger' : charCount > 800 ? 'warn' : '';

	useEffect(() => {
		const currentModelData = MODELS.find(m => m.id === currentModel);
		if (currentModelData?.canAttachFiles === false && attachedFiles.length > 0) {
			setAttachedFiles([]);
			onFilesSelected([]);
		}
	}, [currentModel]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.model-selector')) setShowModelDropdown(false);
			if (!target.closest('.skills-selector')) setShowSkillsDropdown(false);
			if (!target.closest('.attachment-selector')) setShowAttachmentDropdown(false);
			if (!target.closest('.context-dropdown')) {
				setShowContextDropdown(false);
				setShowFileDropdown(false);
				setShowFolderDropdown(false);
			}
		};
		window.addEventListener('click', handleClickOutside);
		return () => window.removeEventListener('click', handleClickOutside);
	}, []);

	const hasSkills = (MODE_SKILLS[currentModel] || []).length > 0;
	const currentModelData = MODELS.find(m => m.id === currentModel);
	const canAttach = currentModelData?.canAttachFiles !== false;
	
	return (
		<div className="input-area">
			<div
				className={`input-container${isDraggingOver ? ' drag-over' : ''}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{attachedFiles.length > 0 && (
					<div className="attached-files">
						{attachedFiles.map((file, index) => (
							<Tag
								key={index}
								className={`file-chip ${file.type}`}
								closable
								onClose={() => removeFile(index)}
								style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6 }}
							>
								{file.type === 'image' && file.imageData ? (
									<div className="img-thumb-wrap">
										<img
											className="chip-image-thumb"
											src={`data:${file.mimeType || 'image/jpeg'};base64,${file.imageData}`}
											alt={file.name}
										/>
										<div className="img-hover-preview">
											<img
												src={`data:${file.mimeType || 'image/jpeg'};base64,${file.imageData}`}
												alt={file.name}
											/>
										</div>
									</div>
								) : file.type === 'terminal' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
										<path d="M2 4h12v8H2V4z" stroke="currentColor" strokeWidth="1.2" />
										<path d="M4 8h1M6 8h3" stroke="currentColor" strokeWidth="1.2" />
									</svg>
								) : file.type === 'folder' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
										<path d="M1.5 3.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1v-8.5z" stroke="currentColor" strokeWidth="1.2" />
									</svg>
								) : (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
										<path d="M3 3h10v10H3V3z" stroke="currentColor" strokeWidth="1.2" />
										<path d="M7 3v10M3 7h10" stroke="currentColor" strokeWidth="1.2" />
									</svg>
								)}
								<span className="file-name">
									{file.name}
									{file.type === 'terminal' && <div className="chip-tooltip">{file.path}</div>}
								</span>
							</Tag>
						))}
					</div>
				)}
				<textarea
					ref={textareaRef}
					id="chat-input"
					placeholder="Ask TraneAI anything... (Enter to send, Shift+Enter for new line)"
					value={text}
					onKeyDown={handleKeydown}
					onInput={handleInput}
					onPaste={handlePaste}
				></textarea>
				{showFileDropdown && filteredFiles.length > 0 && (
					<div className="context-dropdown file-autocomplete show">
						<div className="context-dropdown-label">Mention file to add to context</div>
						{filteredFiles.map(file => (
							<div key={file} className="context-item file-item" onClick={() => selectFileMention(file)}>
								<div className="context-item-icon">📄</div>
								<div className="context-item-content">
									<div className="context-item-title">{file.split('/').pop()}</div>
									<div className="context-item-description">{file}</div>
								</div>
							</div>
						))}
					</div>
				)}
				{showFolderDropdown && filteredFolders.length > 0 && (
					<div className="context-dropdown folder-autocomplete show">
						<div className="context-dropdown-label">Mention folder to add to context</div>
						{filteredFolders.map(folder => (
							<div key={folder} className="context-item folder-item" onClick={() => selectFolderMention(folder)}>
								<div className="context-item-icon">📂</div>
								<div className="context-item-content">
									<div className="context-item-title">{folder.split('/').pop()}</div>
									<div className="context-item-description">{folder}</div>
								</div>
							</div>
						))}
					</div>
				)}
				{showContextDropdown && (
					<div className="context-dropdown show">
						<div className="context-dropdown-label">Pin context with ⌥ Enter</div>
						{CONTEXT_OPTIONS.map(option => (
							<div key={option.id} className="context-item" onClick={() => selectContextOption(option.id)}>
								<div className="context-item-icon">{option.icon}</div>
								<div className="context-item-content">
									<div className="context-item-title">{option.title}</div>
									<div className="context-item-description">{option.description}</div>
								</div>
								<span className="context-item-arrow">›</span>
							</div>
						))}
					</div>
				)}
				{charCount > 800 && (
					<div className={`char-counter ${counterClass}`} id="char-counter">
						{charCount} chars
					</div>
				)}
				<div className="controls">
					<div className="left-controls">
						{canAttach && (
							<div className="attachment-selector">
								<button 
									className={`icon-btn ${showAttachmentDropdown ? 'active' : ''}`} 
									title="Attach" 
									onClick={(e) => { e.stopPropagation(); setShowAttachmentDropdown(!showAttachmentDropdown); setShowModelDropdown(false); setShowSkillsDropdown(false); }}
								>
									<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
										<path d="M13 8.5V11a4 4 0 01-8 0V4.5a2.5 2.5 0 015 0V11a1 1 0 01-2 0V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</button>
								{showAttachmentDropdown && (
									<div className="dropdown-menu show" id="attachment-dropdown">
										<div className="dropdown-item" onClick={() => fileInputRef.current?.click()}>
											<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
												<path d="M2 3a1 1 0 011-1h6l4 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3z" stroke="currentColor" strokeWidth="1.2" />
											</svg>
											Files and images
											<span className="item-check">›</span>
										</div>
										<div className="dropdown-item">
											<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
												<path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
											</svg>
											Jira
											<span className="item-check">›</span>
										</div>
									</div>
								)}
							</div>
						)}
						<input type="file" ref={fileInputRef} id="file-input" style={{ display: 'none' }} multiple accept="image/*" onChange={handleFileChange} />

						<div className={`skills-selector ${!hasSkills ? 'disabled' : ''}`}>
							<button 
								className="icon-btn" 
								title="Skills" 
								onClick={(e) => { e.stopPropagation(); setShowSkillsDropdown(!showSkillsDropdown); setShowModelDropdown(false); }}
								disabled={!hasSkills}
								style={!hasSkills ? { opacity: 0.5, cursor: 'not-allowed', color: 'var(--text-muted)' } : {}}
							>
								@ Skills
							</button>
							{showSkillsDropdown && hasSkills && (
								<div className="skills-dropdown show" id="skills-dropdown">
									<div className="skills-header">Skills</div>
									{SKILLS.filter(skill => (MODE_SKILLS[currentModel] || []).includes(skill.id)).map(skill => (
										<div key={skill.id} className="skills-item" onClick={() => selectSkill(skill.id)}>
											<span className="skills-item-icon">{skill.icon}</span>{skill.id}
										</div>
									))}
								</div>
							)}
						</div>

						<div className="model-selector">
							<div className="model-trigger" onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); setShowSkillsDropdown(false); }}>
								<div className="model-dot"></div>
								<span id="selected-model">{currentModelData?.name || currentModel}</span>
								<svg width="9" height="9" viewBox="0 0 16 16" fill="none">
									<path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</div>
							{showModelDropdown && (
								<div className="dropdown-menu show" id="model-dropdown">
									<div className="dropdown-label">Select Mode</div>
									{MODELS.map(model => (
										<div
											key={model.id}
											className={`dropdown-item ${currentModel === model.id ? 'selected' : ''}`}
											onClick={() => { onModelChange(model.id); setShowModelDropdown(false); }}
										>
											<span>{model.icon}</span>{model.name}
											{currentModel === model.id && <span className="item-check">✓</span>}
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					<div className="right-controls">
						{isTyping ? (
							<button className="stop-btn" id="stop-btn" onClick={onStopGeneration} title="Stop generating">
								<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
									<rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
								</svg>
								Stop
							</button>
						) : (
							<button className="send-btn" id="send-btn" onClick={handleSend} disabled={!text.trim() && attachedFiles.length === 0}>
								<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
									<path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
								Send
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
});
