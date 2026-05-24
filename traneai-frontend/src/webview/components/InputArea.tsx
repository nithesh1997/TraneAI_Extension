/**
 * InputArea renders the chat prompt input panel and handles message composition.
 * It supports model selection, attachments, code block detection, workspace mentions,
 * and other user interactions before sending requests to the backend.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Tag } from 'antd';
import { Attachment } from './Message';
import hljs from 'highlight.js';

import {
	CodeBlock,
	detectAndHighlight,
	isLikelyCode,
	MODELS,
	SKILLS,
	MODE_SKILLS,
	CONTEXT_OPTIONS
} from './InputAreaHelpers';

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

// Models, skills, and context options imported from InputAreaHelpers.tsx

declare const vscode: any;

const CodePalette: React.FC<{ cb: CodeBlock; onRemove: (id: number) => void }> = ({ cb, onRemove }) => {
	const { language, html } = useMemo(() => detectAndHighlight(cb.code), [cb.code]);
	return (
		<div className="code-palette">
			<div className="code-palette-header">
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
					<rect x="2" y="7" width="12" height="1.5" rx="0.75" fill="currentColor" />
					<rect x="2" y="11" width="8" height="1.5" rx="0.75" fill="currentColor" />
				</svg>
				<span className="code-palette-lang">{language}</span>
				<button className="code-palette-close" onClick={() => onRemove(cb.id)} title="Remove">×</button>
			</div>
			<div className="code-palette-body">
				<pre><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
			</div>
		</div>
	);
};

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
	const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([]);
	const codeBlockIdRef = useRef(0);
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
	const [workspaceBranches, setWorkspaceBranches] = useState<string[]>([]);
	const [selectedBranch, setSelectedBranch] = useState('');
	const [branchSearch, setBranchSearch] = useState('');
	const [showBranchDropdown, setShowBranchDropdown] = useState(false);
	const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
	const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
	const [filteredFolders, setFilteredFolders] = useState<string[]>([]);
	const [showFileDropdown, setShowFileDropdown] = useState(false);
	const [showFolderDropdown, setShowFolderDropdown] = useState(false);
	const [mentionQuery, setMentionQuery] = useState('');
	const [activeBrowserUrl, setActiveBrowserUrl] = useState<string | undefined>(undefined);

	// Fetch workspace files and folders
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (message.type === 'browserUrl') {
				setActiveBrowserUrl(message.value);
			} else if (message.type === 'snapshotResult') {
				const { image, url } = message;
				const snapshotAttachment: Attachment = {
					name: `snapshot-${Date.now()}.png`,
					path: url,
					type: 'image',
					imageData: image,
					mimeType: 'image/png'
				};
				const urlAttachment: Attachment = {
					name: url,
					path: url,
					type: 'url'
				};
				setAttachedFiles(prev => [...prev, snapshotAttachment, urlAttachment]);
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

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

				// Fetch branches
				const branchesResponse = await fetch(`http://localhost:5000/api/workspace/branches?root=${encodeURIComponent(workspaceRoot)}`);
				if (branchesResponse.ok) {
					const branches = await branchesResponse.json();
					setWorkspaceBranches(branches);
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
				// Only filter if a dropdown is already open
				if (showFolderDropdown) {
					setFilteredFolders(workspaceFolders.filter(f => f.toLowerCase().includes(query.toLowerCase())).slice(0, 8));
				} else if (showFileDropdown) {
					setFilteredFiles(workspaceFiles.filter(f => f.toLowerCase().includes(query.toLowerCase())).slice(0, 8));
				} else {
					// Neither dropdown is open - don't filter, keep context menu closed
					setShowContextDropdown(false);
					setShowFileDropdown(false);
					setShowFolderDropdown(false);
				}
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
		if (!text.trim() && attachedFiles.length === 0 && codeBlocks.length === 0) return;
		
		// Check for ticket number or images to prioritize them over the branch selector
		const hasTicketNumber = /[A-Z]+-\d+/.test(text);
		const hasImages = attachedFiles.some(f => f.type === 'image');
		const prioritizeInput = hasTicketNumber || hasImages;

		// Add selected mode as a skill if not already present in the text
		let finalChatText = text;
		const modeSkill = `@${currentModel}`;
		
		// If QA mode and Research skill are active, and a branch is selected
		if (currentModel === 'qa' && selectedSkill === 'research' && selectedBranch && !prioritizeInput) {
			const researchSkill = `@research`;
			if (!text.includes(researchSkill)) {
				finalChatText = `${modeSkill} ${researchSkill} Branch: ${selectedBranch} ${text}`;
			} else if (!text.includes('Branch:')) {
				finalChatText = text.replace(researchSkill, `${researchSkill} Branch: ${selectedBranch}`);
				finalChatText = `${modeSkill} ${finalChatText}`;
			} else {
				finalChatText = `${modeSkill} ${text}`;
			}
		} else if (text.trim() && !text.includes(modeSkill) && currentModel !== 'auto') {
			finalChatText = `${modeSkill} ${text}`;
		} else if (!text.trim() && currentModel !== 'auto') {
			finalChatText = `${modeSkill}`;
		}

		if (codeBlocks.length > 0) {
			const codeBlockText = codeBlocks.map(cb => `\`\`\`${detectAndHighlight(cb.code).language}\n${cb.code}\n\`\`\``).join('\n\n');
			finalChatText = finalChatText ? `${finalChatText}\n\n${codeBlockText}` : codeBlockText;
		}

		const pinnedFiles = attachedFiles.filter(f => f.isPinned).map(f => f.path).filter(Boolean) as string[];
		onSendMessage(finalChatText, currentModel, attachedFiles, pinnedFiles);
		
		setText('');
		setCodeBlocks([]);
		
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

	// Handle paste events — intercept clipboard images and code blocks
	const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = Array.from(e.clipboardData?.items || []);
		const imageItems = items.filter(item => item.type.startsWith('image/'));
		if (imageItems.length > 0) {
			e.preventDefault();
			const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
			Promise.all(files.map(readImageFile)).then(newAttachments => {
				const updatedFiles = [...attachedFiles, ...newAttachments];
				setAttachedFiles(updatedFiles);
				onFilesSelected(updatedFiles.map(f => f.name));
			});
			return;
		}

		const pastedText = e.clipboardData?.getData('text') || '';
		if (isLikelyCode(pastedText)) {
			e.preventDefault();
			const id = ++codeBlockIdRef.current;
			setCodeBlocks(prev => [...prev, { id, code: pastedText }]);
		}
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
			setShowFolderDropdown(false);
			setShowContextDropdown(false);
			setMentionQuery('');
		} else if (id === 'folders') {
			setFilteredFolders(workspaceFolders.slice(0, 8));
			setShowFolderDropdown(true);
			setShowFileDropdown(false);
			setShowContextDropdown(false);
			setMentionQuery('');
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
		setSelectedSkill(skill);
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
		setSelectedSkill(null); // Reset skill when model changes
	}, [currentModel]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.model-selector')) setShowModelDropdown(false);
			if (!target.closest('.skills-selector')) setShowSkillsDropdown(false);
			if (!target.closest('.attachment-selector')) setShowAttachmentDropdown(false);
			if (!target.closest('.branch-selector-custom')) setShowBranchDropdown(false);
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
								) : file.type === 'url' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: '#007acc' }}>
										<path d="M4.5 10.5h2.25l4.5-4.5-2.25-2.25-4.5 4.5V10.5z" stroke="currentColor" strokeWidth="1.2" />
										<path d="M7.5 13.5h7.5" stroke="currentColor" strokeWidth="1.2" />
										<circle cx="11.5" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
										<path d="M10 2.5a4 4 0 012.828 1.172l2 2a4 4 0 010 5.656l-2 2A4 4 0 0110 14.5m-4-13a4 4 0 00-2.828 1.172l-2 2a4 4 0 000 5.656l2 2A4 4 0 006 14.5" stroke="currentColor" strokeWidth="1.2" />
									</svg>
								) : (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
										<path d="M3 3h10v10H3V3z" stroke="currentColor" strokeWidth="1.2" />
										<path d="M7 3v10M3 7h10" stroke="currentColor" strokeWidth="1.2" />
									</svg>
								)}
								<span 
									className="file-name"
									onClick={() => {
										if (file.type === 'url' && file.path) {
											vscode.postMessage({ command: 'openUrl', url: file.path });
										}
									}}
									style={file.type === 'url' ? { color: '#007acc', cursor: 'pointer', textDecoration: 'underline' } : {}}
								>
									{file.name}
									{file.type === 'terminal' && <div className="chip-tooltip">{file.path}</div>}
								</span>
							</Tag>
						))}
					</div>
				)}
				{codeBlocks.length > 0 && (
					<div className="code-palettes">
						{codeBlocks.map(cb => (
							<CodePalette
								key={cb.id}
								cb={cb}
								onRemove={(id) => setCodeBlocks(prev => prev.filter(b => b.id !== id))}
							/>
						))}
					</div>
				)}
				{currentModel === 'qa' && (selectedSkill === 'research' || text.includes('@research')) && workspaceBranches.length > 0 && (
					<div className="branch-selector-row" style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
						<span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branch</span>
						<div className="branch-selector-custom" style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
							<div 
								className="branch-trigger" 
								onClick={() => setShowBranchDropdown(!showBranchDropdown)}
								style={{
									background: 'var(--bg-secondary)', 
									color: 'var(--text-primary)', 
									border: '1px solid var(--border)', 
									borderRadius: '4px', 
									padding: '2px 8px', 
									fontSize: '12px',
									cursor: 'pointer',
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center'
								}}
							>
								<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
									{selectedBranch || 'Select branch'}
								</span>
								<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
									{selectedBranch && (
										<span 
											onClick={(e) => { e.stopPropagation(); setSelectedBranch(''); }}
											style={{ 
												display: 'flex', 
												alignItems: 'center', 
												justifyContent: 'center',
												width: '16px',
												height: '16px',
												borderRadius: '50%',
												fontSize: '14px',
												lineHeight: '1',
												color: 'var(--text-secondary)'
											}}
											className="clear-branch-btn"
											title="Clear selection"
										>
											×
										</span>
									)}
									<svg width="10" height="10" viewBox="0 0 16 16" fill="none">
										<path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</div>
							</div>
							
							{showBranchDropdown && (
								<div 
									className="branch-dropdown"
									style={{
										position: 'absolute',
										bottom: '100%',
										left: 0,
										width: '100%',
										background: 'var(--bg-secondary)',
										border: '1px solid var(--border)',
										borderRadius: '4px',
										boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
										zIndex: 1000,
										marginBottom: '4px',
										display: 'flex',
										flexDirection: 'column'
									}}
								>
									<div style={{ padding: '4px', borderBottom: '1px solid var(--border)' }}>
										<input 
											type="text"
											placeholder="Search branches..."
											value={branchSearch}
											onChange={(e) => setBranchSearch(e.target.value)}
											autoFocus
											style={{
												width: '100%',
												background: 'var(--bg-primary)',
												border: '1px solid var(--border)',
												borderRadius: '2px',
												padding: '4px 8px',
												fontSize: '12px',
												color: 'var(--text-primary)',
												outline: 'none'
											}}
										/>
									</div>
									<div style={{ maxHeight: '180px', overflowY: 'auto' }}>
										<div 
											className="branch-item"
											onClick={() => { setSelectedBranch(''); setShowBranchDropdown(false); setBranchSearch(''); }}
											style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
										>
											None
										</div>
										{workspaceBranches
											.filter(b => b.toLowerCase().includes(branchSearch.toLowerCase()))
											.map(branch => (
												<div 
													key={branch}
													className={`branch-item ${selectedBranch === branch ? 'selected' : ''}`}
													onClick={() => { setSelectedBranch(branch); setShowBranchDropdown(false); setBranchSearch(''); }}
													style={{ 
														padding: '4px 8px', 
														fontSize: '12px', 
														cursor: 'pointer',
														background: selectedBranch === branch ? 'var(--bg-active)' : 'transparent'
													}}
												>
													{branch}
												</div>
											))
										}
									</div>
								</div>
							)}
						</div>
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
						{activeBrowserUrl && (
							<button 
								className="snapshot-btn" 
								onClick={() => vscode.postMessage({ command: 'takeSnapshot' })}
								title="Take snapshot of current browser view"
								style={{
									background: '#f85149',
									color: 'white',
									border: 'none',
									borderRadius: '4px',
									padding: '4px 8px',
									fontSize: '11px',
									fontWeight: 600,
									cursor: 'pointer',
									display: 'flex',
									alignItems: 'center',
									gap: '4px',
									marginRight: '8px'
								}}
							>
								<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
									<path d="M13 3H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.2" />
									<circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
								</svg>
								SnapShot View
							</button>
						)}
						{isTyping ? (
							<button className="stop-btn" id="stop-btn" onClick={onStopGeneration} title="Stop generating">
								<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
									<rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
								</svg>
								Stop
							</button>
						) : (
							<button className="send-btn" id="send-btn" onClick={handleSend} disabled={!text.trim() && attachedFiles.length === 0 && codeBlocks.length === 0}>
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
