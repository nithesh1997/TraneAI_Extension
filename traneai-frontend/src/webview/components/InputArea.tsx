import React, { useState, useRef, useEffect } from 'react';

interface InputAreaProps {
	onSendMessage: (text: string, model: string, files: string[]) => void;
	onFilesSelected: (files: string[]) => void;
	currentModel: string;
	onModelChange: (model: string) => void;
}

const MODELS = [
	{ id: 'auto', name: 'Auto', icon: '⚡', canAttachFiles: false },
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

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onFilesSelected, currentModel, onModelChange }) => {
	const [text, setText] = useState('');
	const [showModelDropdown, setShowModelDropdown] = useState(false);
	const [showSkillsDropdown, setShowSkillsDropdown] = useState(false);
	const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
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
		if (!text.trim()) return;
		
		// Add selected mode as a skill if not already present in the text
		let finalChatText = text;
		const modeSkill = `@${currentModel}`;
		if (!text.includes(modeSkill) && currentModel !== 'auto') {
			finalChatText = `${modeSkill} ${text}`;
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
		const newFiles = files.map(f => f.name);
		const updatedFiles = [...attachedFiles, ...newFiles];
		setAttachedFiles(updatedFiles);
		onFilesSelected(updatedFiles);
		e.target.value = '';
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
		const handleClickOutside = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.model-selector')) setShowModelDropdown(false);
			if (!(e.target as HTMLElement).closest('.skills-selector')) setShowSkillsDropdown(false);
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
							<button className="icon-btn" title="Attach file" onClick={() => fileInputRef.current?.click()}>
								<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
									<path d="M13 8.5V11a4 4 0 01-8 0V4.5a2.5 2.5 0 015 0V11a1 1 0 01-2 0V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</button>
						)}
						<input type="file" ref={fileInputRef} id="file-input" style={{ display: 'none' }} multiple onChange={handleFileChange} />

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
						<button className="send-btn" id="send-btn" onClick={handleSend} disabled={!text.trim()}>
							<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
								<path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
