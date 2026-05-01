import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

declare const acquireVsCodeApi: any;
(window as any).vscode = acquireVsCodeApi();

const container = document.getElementById('app');
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}
