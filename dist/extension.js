"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/ChatViewProvider.ts
var vscode = __toESM(require("vscode"));

// src/webview/WebviewTemplate.ts
function buildWebviewHtml(options) {
  const { logoUri, styleUri, scriptUri, isPanel, isRedirected } = options;
  const bodyClass = (isPanel ? "panel" : "sidebar") + (isRedirected ? " is-redirected" : "");
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

// src/ChatViewProvider.ts
var ChatViewProvider = class {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  static viewType = "traneai.chatView";
  _view;
  _panel;
  _isFullScreenActive = false;
  _messages = [];
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, false, this._isFullScreenActive);
    webviewView.webview.onDidReceiveMessage((data) => {
      this._handleMessage(data);
    });
    this._syncMessages();
  }
  setFullScreen(value) {
    this._isFullScreenActive = value;
    if (this._view) {
      this._view.webview.postMessage({ type: "setFullScreen", value });
    }
    if (!value && this._panel) {
      this._panel.dispose();
    }
  }
  refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview, false, this._isFullScreenActive);
    }
    if (this._panel) {
      this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, true, false);
    }
  }
  _handleMessage(data) {
    switch (data.command) {
      case "restore":
        vscode.commands.executeCommand("trane-ai.restoreToSidebar");
        break;
      case "sendMessage":
        this._addMessage("user", data.text);
        this._broadcastTyping(true);
        setTimeout(() => {
          this._broadcastTyping(false);
          this._addMessage("ai", "I am TraneAI. How can I help you today?");
        }, 1200);
        break;
      case "quickAction":
        this._handleQuickAction(data.action, data.text);
        break;
      case "clearChat":
        this._messages = [];
        this._syncMessages();
        break;
      case "copyMessage":
        vscode.env.clipboard.writeText(data.text);
        break;
      case "filesSelected":
        break;
    }
  }
  _broadcastTyping(isTyping) {
    const msg = { type: "typing", value: isTyping };
    if (this._view) {
      this._view.webview.postMessage(msg);
    }
    if (this._panel) {
      this._panel.webview.postMessage(msg);
    }
  }
  _addMessage(role, text) {
    this._messages.push({ role, text, timestamp: Date.now() });
    this._syncMessages();
  }
  _syncMessages() {
    const message = { type: "syncMessages", messages: this._messages };
    if (this._view) {
      this._view.webview.postMessage(message);
    }
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }
  renderFullScreen() {
    this._panel = vscode.window.createWebviewPanel(
      "traneai.chatFullScreen",
      "TraneAI Chat",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri]
      }
    );
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, true, false);
    this._panel.webview.onDidReceiveMessage((data) => {
      this._handleMessage(data);
    });
    this._panel.onDidDispose(() => {
      this._panel = void 0;
    });
    this._syncMessages();
    return this._panel;
  }
  async _handleQuickAction(action, text) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._addMessage("user", text);
      this._broadcastTyping(true);
      setTimeout(() => {
        this._broadcastTyping(false);
        this._addMessage("ai", "No file is currently open. Please open a file in the editor and try again.");
      }, 800);
      return;
    }
    const document = editor.document;
    const fileName = document.fileName.split(/[\\/]/).pop() ?? "file";
    const language = document.languageId;
    const fileContent = document.getText();
    const lineCount = document.lineCount;
    this._addMessage("user", text);
    this._broadcastTyping(true);
    setTimeout(() => {
      this._broadcastTyping(false);
      let response = "";
      if (action === "explain") {
        response = this._generateExplanation(fileName, language, fileContent, lineCount);
      } else if (action === "review") {
        response = this._generateReview(fileName, language, fileContent, lineCount);
      } else if (action === "tests") {
        response = this._generateTests(fileName, language, fileContent, lineCount);
      }
      this._addMessage("ai", response);
    }, 1500);
  }
  _extractSymbols(content, language) {
    const functions = [];
    const classes = [];
    const imports = [];
    if (["typescript", "javascript", "typescriptreact", "javascriptreact"].includes(language)) {
      const fnMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w[\w<>, |[\]]*?)?\s*\{)/gm);
      for (const m of fnMatches) {
        const name = m[1] || m[2] || m[3];
        if (name && name !== "if" && name !== "for" && name !== "while" && name !== "switch" && !functions.includes(name)) {
          functions.push(name);
        }
      }
      const classMatches = content.matchAll(/class\s+(\w+)/gm);
      for (const m of classMatches) {
        if (!classes.includes(m[1])) {
          classes.push(m[1]);
        }
      }
      const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/gm);
      for (const m of importMatches) {
        if (!imports.includes(m[1])) {
          imports.push(m[1]);
        }
      }
    } else if (language === "python") {
      const fnMatches = content.matchAll(/def\s+(\w+)\s*\(/gm);
      for (const m of fnMatches) {
        if (!functions.includes(m[1])) {
          functions.push(m[1]);
        }
      }
      const classMatches = content.matchAll(/class\s+(\w+)/gm);
      for (const m of classMatches) {
        if (!classes.includes(m[1])) {
          classes.push(m[1]);
        }
      }
      const importMatches = content.matchAll(/(?:import|from)\s+([\w.]+)/gm);
      for (const m of importMatches) {
        if (!imports.includes(m[1])) {
          imports.push(m[1]);
        }
      }
    } else if (["java", "csharp", "cpp", "c"].includes(language)) {
      const fnMatches = content.matchAll(/(?:public|private|protected|static|void|int|string|bool|double|float|async)[\s\w<>[\],]*?\s+(\w+)\s*\(/gm);
      for (const m of fnMatches) {
        const name = m[1];
        if (name && name !== "if" && name !== "for" && name !== "while" && !functions.includes(name)) {
          functions.push(name);
        }
      }
      const classMatches = content.matchAll(/class\s+(\w+)/gm);
      for (const m of classMatches) {
        if (!classes.includes(m[1])) {
          classes.push(m[1]);
        }
      }
    }
    return { functions: functions.slice(0, 10), classes: classes.slice(0, 5), imports: imports.slice(0, 8) };
  }
  _generateExplanation(fileName, language, content, lineCount) {
    const { functions, classes, imports } = this._extractSymbols(content, language);
    const langLabel = language === "typescriptreact" ? "TypeScript (React)" : language === "javascriptreact" ? "JavaScript (React)" : language.charAt(0).toUpperCase() + language.slice(1);
    let response = `**File:** \`${fileName}\`
**Language:** ${langLabel}
**Lines:** ${lineCount}

`;
    if (classes.length > 0) {
      response += `**Classes:**
${classes.map((c) => `- \`${c}\``).join("\n")}

`;
    }
    if (functions.length > 0) {
      response += `**Functions / Methods:**
${functions.map((f) => `- \`${f}\``).join("\n")}

`;
    }
    if (imports.length > 0) {
      response += `**Dependencies:**
${imports.map((i) => `- \`${i}\``).join("\n")}

`;
    }
    if (content.trim().length === 0) {
      response += "_The file appears to be empty._";
    } else if (functions.length === 0 && classes.length === 0) {
      response += "_No top-level functions or classes detected. The file may contain configuration, styles, or data definitions._";
    } else {
      response += `This file defines **${classes.length} class${classes.length !== 1 ? "es" : ""}** and **${functions.length} function${functions.length !== 1 ? "s" : ""}**. Review the symbols above to understand its responsibilities.`;
    }
    return response;
  }
  _generateReview(fileName, language, content, lineCount) {
    const issues = [];
    const suggestions = [];
    if (content.includes("console.log") || content.includes("console.error") || content.includes("print(")) {
      issues.push("Debug logging statements detected \u2014 consider removing before production.");
    }
    if (content.includes("TODO") || content.includes("FIXME") || content.includes("HACK")) {
      issues.push("Unresolved `TODO` / `FIXME` / `HACK` comments found in the code.");
    }
    if (/password|secret|apikey|api_key|token/i.test(content) && /['"][A-Za-z0-9+/=]{8,}['"]/.test(content)) {
      issues.push("Possible hardcoded credentials or secrets detected \u2014 use environment variables instead.");
    }
    if (content.includes("any") && ["typescript", "typescriptreact"].includes(language)) {
      issues.push("Usage of `any` type found \u2014 prefer explicit types for better type safety.");
    }
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(content)) {
      issues.push("Empty or comment-only `catch` blocks detected \u2014 ensure errors are handled or logged.");
    }
    const { functions } = this._extractSymbols(content, language);
    if (lineCount > 300) {
      suggestions.push(`File is **${lineCount} lines** \u2014 consider splitting into smaller, focused modules.`);
    }
    if (functions.length > 15) {
      suggestions.push(`**${functions.length} functions** detected \u2014 consider grouping related logic into classes or separate files.`);
    }
    if (!content.includes("test") && !content.includes("spec") && !content.includes("describe")) {
      suggestions.push("No test coverage detected in this file \u2014 consider adding unit tests.");
    }
    let response = `**Code Review \u2014 \`${fileName}\`**

`;
    if (issues.length > 0) {
      response += `**Issues Found:**
${issues.map((i) => `- \u26A0\uFE0F ${i}`).join("\n")}

`;
    } else {
      response += `**Issues Found:** \u2705 No obvious issues detected.

`;
    }
    if (suggestions.length > 0) {
      response += `**Suggestions:**
${suggestions.map((s) => `- \u{1F4A1} ${s}`).join("\n")}

`;
    }
    response += `**Summary:** ${lineCount} lines of ${language} code reviewed. ${issues.length} issue${issues.length !== 1 ? "s" : ""} and ${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} found.`;
    return response;
  }
  _generateTests(fileName, language, content, lineCount) {
    const { functions, classes } = this._extractSymbols(content, language);
    const baseName = fileName.replace(/\.[^.]+$/, "");
    let testCode = "";
    let framework = "";
    if (["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(language)) {
      framework = "Jest";
      const ext = language.startsWith("typescript") ? "ts" : "js";
      const imports = classes.length > 0 ? `import { ${[...classes, ...functions].slice(0, 5).join(", ")} } from './${baseName}';` : `import { ${functions.slice(0, 5).join(", ")} } from './${baseName}';`;
      const testBlocks = functions.slice(0, 5).map((fn) => `  describe('${fn}', () => {
    it('should work correctly', () => {
      // TODO: implement test
      expect(${fn}).toBeDefined();
    });
  });`).join("\n\n");
      testCode = `// ${baseName}.test.${ext}
${imports}

describe('${baseName}', () => {
${testBlocks || "  it('should be defined', () => {\n    // TODO: implement test\n  });"}
});`;
    } else if (language === "python") {
      framework = "pytest";
      const importLine = `from ${baseName} import ${functions.slice(0, 5).join(", ") || "*"}`;
      const testFns = functions.slice(0, 5).map((fn) => `def test_${fn}():
    # TODO: implement test
    assert ${fn} is not None`).join("\n\n");
      testCode = `# test_${baseName}.py
${importLine}

${testFns || "def test_placeholder():\n    # TODO: implement test\n    pass"}`;
    } else if (language === "java") {
      framework = "JUnit 5";
      const className = classes[0] ?? baseName;
      const testMethods = functions.slice(0, 5).map((fn) => `  @Test
  void test${fn.charAt(0).toUpperCase() + fn.slice(1)}() {
    // TODO: implement test
  }`).join("\n\n");
      testCode = `// ${className}Test.java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className}Test {
${testMethods || "  @Test\n  void testPlaceholder() {\n    // TODO: implement test\n  }"}
}`;
    } else {
      return `**Generate Unit Tests \u2014 \`${fileName}\`**

Unit test generation for **${language}** is not yet supported. Detected **${functions.length} function${functions.length !== 1 ? "s" : ""}**:
${functions.map((f) => `- \`${f}\``).join("\n") || "_No functions detected._"}`;
    }
    let response = `**Generated Unit Tests \u2014 \`${fileName}\`** (${framework})

`;
    response += `Detected **${functions.length} function${functions.length !== 1 ? "s" : ""}** and **${classes.length} class${classes.length !== 1 ? "es" : ""}**.

`;
    response += `\`\`\`${language}
${testCode}
\`\`\`

`;
    response += `_Tests generated as stubs \u2014 fill in the assertions and edge cases based on your implementation._`;
    return response;
  }
  _getHtmlForWebview(webview, isPanel, isRedirected) {
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "resources", "logo.svg"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "resources", "webview", "style.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "resources", "webview", "main.js"));
    const cacheBuster = `?t=${Date.now()}`;
    return buildWebviewHtml({
      logoUri: logoUri.toString(),
      styleUri: styleUri.toString() + cacheBuster,
      scriptUri: scriptUri.toString() + cacheBuster,
      isPanel,
      isRedirected
    });
  }
};

// src/extension.ts
function activate(context) {
  let chatPanel;
  if (context.extensionMode === vscode2.ExtensionMode.Development) {
    const watcher = vscode2.workspace.createFileSystemWatcher(
      new vscode2.RelativePattern(context.extensionUri, "dist/extension.js")
    );
    watcher.onDidChange(() => {
      vscode2.commands.executeCommand("workbench.action.reloadWindow");
    });
    context.subscriptions.push(watcher);
  }
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode2.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
  );
  if (context.extensionMode === vscode2.ExtensionMode.Development) {
    const webviewWatcher = vscode2.workspace.createFileSystemWatcher(
      new vscode2.RelativePattern(context.extensionUri, "resources/webview/{main.js,style.css}")
    );
    let debounceTimer;
    const triggerRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        provider.refresh();
      }, 100);
    };
    webviewWatcher.onDidChange(triggerRefresh);
    webviewWatcher.onDidCreate(triggerRefresh);
    webviewWatcher.onDidDelete(triggerRefresh);
    context.subscriptions.push(webviewWatcher);
  }
  context.subscriptions.push(
    vscode2.commands.registerCommand("trane-ai.openChatFullScreen", () => {
      if (chatPanel) {
        chatPanel.reveal();
      } else {
        chatPanel = provider.renderFullScreen();
        vscode2.commands.executeCommand("setContext", "traneai.isFullScreen", true);
        provider.setFullScreen(true);
        if (chatPanel) {
          chatPanel.onDidDispose(() => {
            chatPanel = void 0;
            vscode2.commands.executeCommand("setContext", "traneai.isFullScreen", false);
            vscode2.commands.executeCommand("setContext", "activeWebviewPanelId", void 0);
            provider.setFullScreen(false);
          });
        }
        vscode2.commands.executeCommand("setContext", "activeWebviewPanelId", "traneai.chatFullScreen");
      }
    })
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("trane-ai.restoreToSidebar", () => {
      if (chatPanel) {
        chatPanel.dispose();
        chatPanel = void 0;
        vscode2.commands.executeCommand("setContext", "traneai.isFullScreen", false);
        vscode2.commands.executeCommand("setContext", "activeWebviewPanelId", void 0);
        provider.setFullScreen(false);
      }
      vscode2.commands.executeCommand("traneai.chatView.focus");
    })
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("trane-ai.newChat", () => {
      vscode2.window.showInformationMessage("New Chat");
    }),
    vscode2.commands.registerCommand("trane-ai.showHistory", () => {
      vscode2.window.showInformationMessage("Show History");
    }),
    vscode2.commands.registerCommand("trane-ai.openSettings", () => {
      vscode2.window.showInformationMessage("Open Settings");
    }),
    vscode2.commands.registerCommand("trane-ai.moreActions", () => {
      vscode2.window.showInformationMessage("More Actions");
    }),
    vscode2.commands.registerCommand("trane-ai.closeChat", () => {
      vscode2.commands.executeCommand("workbench.action.closeSidebarPane");
    })
  );
  const disposable = vscode2.commands.registerCommand("trane-ai.helloWorld", () => {
    vscode2.window.showInformationMessage("Hello World from TraneAI!");
  });
  context.subscriptions.push(disposable);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
