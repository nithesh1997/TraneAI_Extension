import React from 'react';

interface HeroSectionProps {
	logoUri: string;
	onQuickSend: (action: string, text: string) => void;
	visible: boolean;
	currentModel: string;
}

const QUICK_ACTIONS: Record<string, any[]> = {
	'auto': [
		{ id: 'explain', label: 'Explain this file', desc: 'Get an overview of the current file', icon: <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />, text: 'Explain the current file' },
		{ id: 'review', label: 'Review my code', desc: 'Check for bugs and improvements', icon: <><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M6 8l1.5 1.5L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>, text: 'Review my code for bugs and improvements' },
		{ id: 'tests', label: 'Generate unit tests', desc: 'Create test coverage for your code', icon: <><path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 7l1.5 1.5L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>, text: 'Generate unit tests for this code' }
	],
	'new-joiner': [
		{ id: 'onboarding', label: 'Start Onboarding', desc: 'Understand the project structure and setup', icon: <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />, text: 'Help me with onboarding for this project' },
		{ id: 'architecture', label: 'Explain Architecture', desc: 'Learn about the tech stack and design patterns', icon: <><path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></>, text: 'Explain the architecture of this project' }
	],
	'developers': [
		{ id: 'refactor', label: 'Suggest Refactoring', desc: 'Improve code quality and maintainability', icon: <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />, text: 'Suggest some refactorings for the current code' },
		{ id: 'optimize', label: 'Optimize Performance', desc: 'Find and fix performance bottlenecks', icon: <><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4v4l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>, text: 'Optimize the performance of this code' }
	],
	'qa': [
		{ id: 'test-plan', label: 'Create Test Plan', desc: 'Generate a comprehensive testing strategy', icon: <><path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 6h4M6 8h4M6 10h4" stroke="currentColor" strokeWidth="1.4" /></>, text: 'Create a test plan for this feature' },
		{ id: 'bugs', label: 'Find Edge Cases', desc: 'Identify potential bugs and boundary conditions', icon: <><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M8 6v4M6 8h4" stroke="currentColor" strokeWidth="1.4" /></>, text: 'Help me find edge cases for this code' }
	],
	'eva': [
		{ id: 'chat', label: 'Chat with EVA', desc: 'Your personal AI companion', icon: <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />, text: 'Hello EVA!' }
	],
	'automated-testing': [
		{ id: 'e2e', label: 'Generate E2E Tests', desc: 'Create Playwright/Cypress test scripts', icon: <><path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" /></>, text: 'Generate E2E tests for this flow' }
	]
};

export const HeroSection: React.FC<HeroSectionProps> = ({ logoUri, onQuickSend, visible, currentModel }) => {
	if (!visible) return null;

	const actions = QUICK_ACTIONS[currentModel] || QUICK_ACTIONS['auto'];

	return (
		<div id="hero-section" className="hero-section">
			<div className="hero-logo-wrap"><img src={logoUri} alt="TraneAI" /></div>
			<div className="hero-title">Build with <span>TraneAI</span></div>
			<div className="hero-sub">Your AI coding assistant. Start a conversation or pick a quick action below.</div>
			<div className="quick-actions">
				{actions.map(action => (
					<button key={action.id} className="quick-action-btn" onClick={() => onQuickSend(action.id, action.text)}>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
							{action.icon}
						</svg>
						<div>
							<div className="quick-action-label">{action.label}</div>
							<div className="quick-action-desc">{action.desc}</div>
						</div>
					</button>
				))}
			</div>
		</div>
	);
};
