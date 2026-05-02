export interface WebviewOptions {
	logoUri: string;
	styleUri: string;
	scriptUri: string;
	isPanel: boolean;
	isRedirected: boolean;
}

export function buildWebviewHtml(options: WebviewOptions): string {
	const { logoUri, styleUri, scriptUri, isPanel, isRedirected } = options;
	const bodyClass = (isPanel ? 'panel' : 'sidebar') + (isRedirected ? ' is-redirected' : '');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${styleUri}">
</head>
<body class="${bodyClass}">
	<div id="app"></div>
	<script>window.LOGO_URI = "${logoUri}";</script>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}
