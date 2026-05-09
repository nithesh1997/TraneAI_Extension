import React, { useState, useRef, useEffect } from 'react';
import { Tag } from 'antd';
import { Attachment } from './Message';

interface InputAreaProps {
	onSendMessage: (text: string, model: string, attachments: Attachment[]) => void;
	onFilesSelected: (files: string[]) => void;
	currentModel: string;
	onModelChange: (model: string) => void;
	terminalPath?: string;
	isTyping?: boolean;
	onStopGeneration?: () => void;
}

const MODELS = [
	{ id: 'auto', name: 'Auto', icon: '⚡', canAttachFiles: true },
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

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onFilesSelected, currentModel, onModelChange, terminalPath, isTyping, onStopGeneration }) => {
	const [text, setText] = useState('');
	const [showModelDropdown, setShowModelDropdown] = useState(false);
	const [showSkillsDropdown, setShowSkillsDropdown] = useState(false);
	const [showAttachmentDropdown, setShowAttachmentDropdown] = useState(false);
	const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const el = e.target;
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, 180) + 'px';
		setText(el.value);
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

		onSendMessage(finalChatText, currentModel, attachedFiles);
		setText('');
		setAttachedFiles([]);
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

	const removeFile = (index: number) => {
		const updatedFiles = attachedFiles.filter((_, i) => i !== index);
		setAttachedFiles(updatedFiles);
		onFilesSelected(updatedFiles.map(f => f.name));
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
		};
		window.addEventListener('click', handleClickOutside);
		return () => window.removeEventListener('click', handleClickOutside);
	}, []);

	const hasSkills = (MODE_SKILLS[currentModel] || []).length > 0;
	const currentModelData = MODELS.find(m => m.id === currentModel);
	const canAttach = currentModelData?.canAttachFiles !== false;
	
	return (
		<div className="input-area">
			<div className="input-container">
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
				></textarea>
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
};
