import * as vscode from 'vscode';

export function getBrowserHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialUrl: string = 'http://localhost:3000'): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; img-src * data: blob:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * 'unsafe-inline' blob:; worker-src blob:;">
    <title>TraneAI Browser</title>
    <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .container { display: flex; flex-direction: column; height: 100%; background: var(--vscode-editor-background); }
        .toolbar { height: 40px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; padding: 0 10px; gap: 8px; flex-shrink: 0; }
        .toolbar input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px 10px; border-radius: 4px; outline: none; }
        .toolbar button { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
        .toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
        .toolbar button svg { width: 16px; height: 16px; fill: currentColor; }
        .main { display: flex; flex: 1; overflow: hidden; position: relative; }
        .iframe-container { flex: 1; position: relative; background: white; min-width: 0; }
        #browser-iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
        .ai-sidebar { width: 320px; border-left: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; background: var(--vscode-sideBar-background); flex-shrink: 0; }
        .chat-history { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .message { padding: 8px 12px; border-radius: 6px; font-size: 13px; line-height: 1.4; }
        .message.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
        .message.ai { background: var(--vscode-editor-inactiveSelectionBackground); color: var(--vscode-foreground); align-self: flex-start; }
        .chat-input { padding: 12px; border-top: 1px solid var(--vscode-panel-border); }
        .chat-input textarea { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; resize: none; padding: 8px; box-sizing: border-box; outline: none; }
        .status-bar { height: 24px; background: var(--vscode-statusBar-background); color: var(--vscode-statusBar-foreground); font-size: 11px; display: flex; align-items: center; padding: 0 10px; border-top: 1px solid var(--vscode-panel-border); }
        .status-dot { width: 8px; height: 8px; background: #4caf50; border-radius: 50%; margin-right: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <button id="back-btn" title="Back"><svg viewBox="0 0 16 16"><path d="M11 1L3 8l8 7V1z"/></svg></button>
            <button id="fwd-btn" title="Forward"><svg viewBox="0 0 16 16"><path d="M5 1l8 7-8 7V1z"/></svg></button>
            <button id="reload-btn" title="Reload"><svg viewBox="0 0 16 16"><path d="M8 2a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4V2z M8 0l4 4-4 4V0z"/></svg></button>
            <input type="text" id="url-bar" placeholder="Enter URL..." value="${initialUrl}" />
            <button id="go-btn" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 4px 12px;">Go</button>
        </div>
        <div class="main">
            <div class="iframe-container">
                <iframe id="browser-iframe" src="${initialUrl}" allow="autoplay; clipboard-read; clipboard-write; geolocation; microphone; camera; midi; encrypted-media; display-capture;"></iframe>
            </div>
            <div class="ai-sidebar">
                <div class="chat-history" id="chat-history">
                    <div class="message ai">AI: How can I help you with this page?</div>
                </div>
                <div class="chat-input">
                    <textarea id="ai-input" placeholder="Ask AI about this page..." rows="3"></textarea>
                </div>
            </div>
        </div>
        <div class="status-bar">
            <div class="status-dot"></div>
            <span id="sync-status">Sync Active</span>
            <span style="margin-left: auto; opacity: 0.7;">TraneAI Agent</span>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const iframe = document.getElementById('browser-iframe');
        const urlBar = document.getElementById('url-bar');
        const goBtn = document.getElementById('go-btn');
        const backBtn = document.getElementById('back-btn');
        const fwdBtn = document.getElementById('fwd-btn');
        const reloadBtn = document.getElementById('reload-btn');
        const aiInput = document.getElementById('ai-input');
        const chatHistory = document.getElementById('chat-history');

        function updateUrl(url) {
            if (!url.startsWith('http')) {
                url = 'http://' + url;
            }
            urlBar.value = url;
            iframe.src = url;
        }

        goBtn.onclick = () => updateUrl(urlBar.value);
        urlBar.onkeydown = (e) => { if (e.key === 'Enter') goBtn.onclick(); };

        backBtn.onclick = () => history.back();
        fwdBtn.onclick = () => history.forward();
        reloadBtn.onclick = () => {
            const currentSrc = iframe.src;
            iframe.src = 'about:blank';
            setTimeout(() => { iframe.src = currentSrc; }, 10);
        };

        aiInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = aiInput.value.trim();
                if (text) {
                    addMessage('user', text);
                    vscode.postMessage({ 
                        type: 'AI_REQUEST', 
                        payload: { prompt: text, context: { url: iframe.src } } 
                    });
                    aiInput.value = '';
                }
            }
        };

        function addMessage(role, text) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.textContent = text;
            chatHistory.appendChild(div);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'AI_RESPONSE':
                    if (!message.payload.isStreaming) {
                        addMessage('ai', message.payload.text);
                    }
                    break;
                case 'NAVIGATE':
                    updateUrl(message.payload.url);
                    break;
            }
        });
    </script>
</body>
</html>`;
}
