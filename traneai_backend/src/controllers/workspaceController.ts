import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function getWorkspaceFiles(req: Request, res: Response): Promise<void> {
    try {
        const root = req.query.root as string;
        if (!root || !fs.existsSync(root)) {
            res.status(400).json({ error: 'Valid workspace root is required' });
            return;
        }

        const files: string[] = [];
        const ignoreList = ['.git', 'node_modules', 'dist', '.angular', 'package-lock.json', '.gemini'];

        function walk(dir: string) {
            const list = fs.readdirSync(dir);
            for (const item of list) {
                if (ignoreList.includes(item)) continue;
                
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    walk(fullPath);
                } else {
                    files.push(path.relative(root, fullPath));
                }

                if (files.length > 3000) return;
            }
        }

        walk(root);
        res.json(files);
    } catch (error) {
        console.error('Workspace files error:', error);
        res.status(500).json({ error: 'Failed to retrieve files' });
    }
}

export async function getWorkspaceFolders(req: Request, res: Response): Promise<void> {
    try {
        const root = req.query.root as string;
        if (!root || !fs.existsSync(root)) {
            res.status(400).json({ error: 'Valid workspace root is required' });
            return;
        }

        const folders: string[] = [];
        const ignoreList = ['.git', 'node_modules', 'dist', '.angular', 'package-lock.json', '.gemini'];

        function walk(dir: string) {
            const list = fs.readdirSync(dir);
            for (const item of list) {
                if (ignoreList.includes(item)) continue;
                
                const fullPath = path.join(dir, item);
                if (!fs.existsSync(fullPath)) continue;
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    folders.push(path.relative(root, fullPath));
                    walk(fullPath);
                }

                if (folders.length > 1000) return;
            }
        }

        walk(root);
        res.json(folders);
    } catch (error) {
        console.error('Workspace folders error:', error);
        res.status(500).json({ error: 'Failed to retrieve folders' });
    }
}

export async function getWorkspaceBranches(req: Request, res: Response): Promise<void> {
    try {
        const root = req.query.root as string;
        if (!root || !fs.existsSync(root)) {
            res.status(400).json({ error: 'Valid workspace root is required' });
            return;
        }

        // Check if it's a git repo first to avoid noisy errors
        const gitDir = path.join(root, '.git');
        if (!fs.existsSync(gitDir)) {
            res.json([]);
            return;
        }

        const { stdout } = await execAsync('git branch -a', { cwd: root });
        const branches = stdout
            .split('\n')
            .map(b => b.trim().replace(/^\*\s*/, '').replace(/^remotes\/origin\//, ''))
            .filter(b => b && !b.includes('HEAD ->'))
            .filter((value, index, self) => self.indexOf(value) === index); // Unique

        res.json(branches);
    } catch (error) {
        console.error('Workspace branches error:', error);
        res.status(500).json({ error: 'Failed to retrieve branches' });
    }
}

export async function getProjectConfig(req: Request, res: Response): Promise<void> {
    try {
        console.log("req.body",req.body);
        
        const { projectName } = req.body;
        if (!projectName) {
            res.status(400).json({ error: 'projectName is required' });
            return;
        }

        // Dynamically import to avoid circular dependencies if any, or just import at top
        const { ProjectConfig } = await import('../models/ProjectConfig.js');
        const config = await ProjectConfig.findOne({ projectName });

        if (!config) {
            // Return empty structure if not found
            res.json({ project: { name: projectName }, roles: {} });
            return;
        }

        res.json({ 
            project: config.project, 
            roles: config.roles 
        });
    } catch (error) {
        console.error('Project config error:', error);
        res.status(500).json({ error: 'Failed to retrieve project config' });
    }
}

export async function updateProjectConfig(req: Request, res: Response): Promise<void> {
    try {
        const { projectName, project, roles } = req.body;
        
        if (!projectName) {
            res.status(400).json({ error: 'projectName is required' });
            return;
        }

        const { ProjectConfig } = await import('../models/ProjectConfig.js');
        
        const updateData: any = {};
        if (project) updateData.project = project;
        if (roles) updateData.roles = roles;

        const config = await ProjectConfig.findOneAndUpdate(
            { projectName },
            { $set: updateData },
            { new: true, upsert: true }
        );

        res.json({ success: true, project: config.project, roles: config.roles });
    } catch (error) {
        console.error('Update project config error:', error);
        res.status(500).json({ error: 'Failed to update project config' });
    }
}

export function serveAdminPortalClient(req: Request, res: Response): void {
  const nonce = (res.locals.cspNonce as string | undefined) || 'missing-nonce';
  const projectName = (req.query.projectName as string) || '';
  
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'nonce-${nonce}'`,
      `style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "connect-src 'self' ws: wss: http: https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const template = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>TraneAI Admin Grid</title>\n  <style nonce=\"${nonce}\">\n    :root {\n      color-scheme: dark;\n      --bg: #1c1d21;\n      --panel-bg: #222327;\n      --topbar-bg: #1e1f23;\n      --border: #33343a;\n      --text: #e0e0e0;\n      --text-muted: #9aa0a6;\n      --accent: #0078d4;\n      --highlight: rgba(255, 255, 255, 0.08);\n      --highlight-border: rgba(255, 255, 255, 0.15);\n      \n      --btn-blue: #0066b8;\n      --btn-blue-hover: #005a9e;\n      --btn-green: #107c41;\n      --btn-green-hover: #0f6c39;\n    }\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      height: 100vh;\n      display: flex;\n      flex-direction: column;\n      color: var(--text);\n      background: var(--bg);\n      font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;\n      overflow: hidden;\n      font-size: 13px;\n    }\n    \n    /* Top Bar */\n    .topbar {\n      display: flex;\n      align-items: center;\n      background: var(--topbar-bg);\n      padding: 8px 16px;\n      border-bottom: 1px solid var(--border);\n      height: 48px;\n    }\n    .back-btn {\n      background: transparent;\n      border: none;\n      color: var(--text);\n      font-size: 13px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      padding: 4px 8px;\n      border-radius: 4px;\n    }\n    .back-btn:hover { background: var(--highlight); }\n    \n    .breadcrumb {\n      display: flex;\n      align-items: center;\n      margin-left: 12px;\n      font-size: 13px;\n      color: var(--text);\n    }\n    .breadcrumb span { margin: 0 8px; color: var(--text-muted); }\n    \n    .search-container {\n      margin-left: auto;\n      margin-right: 20px;\n      position: relative;\n    }\n    .search-box {\n      background: #111;\n      border: 1px solid #333;\n      border-radius: 4px;\n      color: #fff;\n      padding: 6px 12px 6px 32px;\n      width: 300px;\n      font-size: 13px;\n      outline: none;\n    }\n    .search-box:focus { border-color: #555; }\n    .search-icon {\n      position: absolute;\n      left: 10px;\n      top: 50%;\n      transform: translateY(-50%);\n      width: 14px; height: 14px;\n      fill: var(--text-muted);\n    }\n    \n    .toolbar-btns {\n      display: flex;\n      gap: 8px;\n    }\n    .btn {\n      border: none;\n      border-radius: 4px;\n      padding: 6px 12px;\n      color: #fff;\n      font-size: 13px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n    }\n    .btn-blue { background: var(--btn-blue); }\n    .btn-blue:hover { background: var(--btn-blue-hover); }\n    .btn-green { background: var(--btn-green); }\n    .btn-green:hover { background: var(--btn-green-hover); }\n    .btn-dark { background: #333; border: 1px solid #444; }\n    .btn-dark:hover { background: #444; }\n\n    /* Layout Split */\n    .main-container {\n      display: flex;\n      flex: 1;\n      overflow: hidden;\n    }\n    \n    /* Left Pane - Explorer */\n    .explorer {\n      flex: 1;\n      overflow-y: auto;\n      padding: 16px 24px;\n    }\n    .section-title {\n      font-weight: 600;\n      color: #fff;\n      margin-top: 16px;\n      margin-bottom: 12px;\n    }\n    .section-title:first-child { margin-top: 0; }\n    \n    .grid {\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));\n      gap: 16px;\n      margin-bottom: 32px;\n    }\n    \n    .grid-item {\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      padding: 8px;\n      border-radius: 6px;\n      cursor: pointer;\n      border: 1px solid transparent;\n      user-select: none;\n    }\n    .grid-item:hover {\n      background: var(--highlight);\n    }\n    .grid-item.selected {\n      background: rgba(255, 255, 255, 0.12);\n      border-color: var(--highlight-border);\n    }\n    \n    .grid-item svg {\n      width: 48px;\n      height: 48px;\n      margin-bottom: 6px;\n    }\n    .item-label {\n      font-size: 11px;\n      text-align: center;\n      color: #ccc;\n      word-break: break-word;\n      display: -webkit-box;\n      -webkit-line-clamp: 2;\n      -webkit-box-orient: vertical;\n      overflow: hidden;\n      max-width: 100%;\n    }\n    \n    /* Right Pane - Details Sidebar */\n    .sidebar {\n      width: 320px;\n      background: var(--panel-bg);\n      border-left: 1px solid var(--border);\n      display: flex;\n      flex-direction: column;\n      overflow-y: auto;\n    }\n    .sidebar-header {\n      padding: 12px 16px;\n      border-bottom: 1px solid var(--border);\n      font-weight: 600;\n      color: #fff;\n    }\n    .sidebar-content {\n      padding: 16px;\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n      gap: 12px;\n    }\n    \n    .detail-row {\n      display: flex;\n      align-items: flex-start;\n      margin-bottom: 8px;\n    }\n    .detail-label {\n      width: 90px;\n      color: var(--text-muted);\n      font-weight: 600;\n      flex-shrink: 0;\n    }\n    .detail-value {\n      color: #fff;\n      flex: 1;\n      word-break: break-word;\n    }\n    \n    .sidebar-preview {\n      margin-top: 16px;\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n    }\n    .preview-title {\n      font-weight: 600;\n      color: #fff;\n      margin-bottom: 8px;\n    }\n    .preview-box {\n      flex: 1;\n      background: #1e1e1e;\n      border: 1px solid #333;\n      border-radius: 4px;\n      display: flex;\n      flex-direction: column;\n      padding: 8px;\n    }\n    .editor-input {\n      width: 100%;\n      background: #111;\n      border: 1px solid #333;\n      color: #eee;\n      padding: 6px 8px;\n      border-radius: 4px;\n      font-family: inherit;\n      font-size: 12px;\n      margin-bottom: 12px;\n      outline: none;\n    }\n    .editor-input:focus { border-color: #555; }\n    .editor-textarea {\n      width: 100%;\n      flex: 1;\n      background: #fff; /* Match screenshot white preview */\n      color: #000;\n      border: none;\n      padding: 12px;\n      border-radius: 2px;\n      font-family: monospace;\n      font-size: 11px;\n      resize: none;\n      outline: none;\n    }\n    \n    .sidebar-actions {\n      padding: 16px;\n      border-top: 1px solid var(--border);\n      display: flex;\n      gap: 8px;\n    }\n    .sidebar-actions button {\n      flex: 1;\n    }\n    \n    .empty-sidebar {\n      padding: 32px 16px;\n      text-align: center;\n      color: var(--text-muted);\n      font-style: italic;\n    }\n    \n    /* 3D Blue Folder SVG Colors */\n    .f-back { fill: #4884d4; }\n    .f-front { fill: #5c99e5; }\n    .f-highlight { fill: #79b0f2; }\n    .f-shadow { fill: rgba(0,0,0,0.15); }\n    \n  </style>\n</head>\n<body>\n  <div class=\"topbar\">\n    <button class=\"back-btn\" id=\"backBtn\" style=\"visibility:hidden;\">\n      <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"margin-right:4px;\"><path d=\"M15 18l-6-6 6-6\"/></svg>\n      Back\n    </button>\n    \n    <div class=\"breadcrumb\" id=\"breadcrumb\">\n      TraneAI <span>&gt;</span> roles\n    </div>\n    \n    <div class=\"search-container\">\n      <svg class=\"search-icon\" viewBox=\"0 0 24 24\"><path d=\"M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z\"/></svg>\n      <input type=\"text\" class=\"search-box\" id=\"searchInput\" placeholder=\"Search Documents or Files\" />\n    </div>\n    \n    <div class=\"toolbar-btns\">\n      <button class=\"btn btn-blue\" id=\"addFolderBtn\">\n        <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M12 5v14M5 12h14\"/></svg>\n        Add Folder\n      </button>\n      <button class=\"btn btn-green\" id=\"addFileBtn\">\n        <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12\"/></svg>\n        Upload File\n      </button>\n      <button class=\"btn btn-dark\" id=\"refreshBtn\">Refresh</button>\n    </div>\n  </div>\n  \n  <div class=\"main-container\">\n    <div class=\"explorer\" id=\"explorerView\">\n      <div style=\"text-align:center; margin-top:40px; color:var(--text-muted);\">Loading workspace...</div>\n    </div>\n    \n    <div class=\"sidebar\">\n      <div class=\"sidebar-header\">Details</div>\n      <div id=\"sidebarContent\" class=\"empty-sidebar\">\n        Select a file or folder to view details.\n      </div>\n    </div>\n  </div>\n\n  <svg style=\"display:none;\">\n    <defs>\n      <g id=\"icon-folder-3d\">\n        <!-- Back flap -->\n        <path class=\"f-back\" d=\"M2 8V4c0-1.1.9-2 2-2h5.5l2 2H20c1.1 0 2 .9 2 2v2H2z\" />\n        <!-- Inner shadow -->\n        <path class=\"f-shadow\" d=\"M2 8v2h20V8H2z\" />\n        <!-- Front flap -->\n        <path class=\"f-front\" d=\"M2 10l1.5 10c.1.6.6 1 1.2 1h14.6c.6 0 1.1-.4 1.2-1L22 10H2z\" />\n        <!-- Highlight -->\n        <path class=\"f-highlight\" d=\"M2 10h20v1H2z\" />\n      </g>\n      \n      <g id=\"icon-file-pdf\">\n        <path fill=\"#e2574c\" d=\"M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z\"/>\n        <path fill=\"#b53d33\" d=\"M14 2v6h6z\"/>\n        <text x=\"12\" y=\"16\" fill=\"#fff\" font-family=\"sans-serif\" font-size=\"7\" font-weight=\"bold\" text-anchor=\"middle\">.enc</text>\n      </g>\n      \n      <g id=\"icon-file-doc\">\n        <path fill=\"#4c8be2\" d=\"M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z\"/>\n        <path fill=\"#3366b5\" d=\"M14 2v6h6z\"/>\n        <text x=\"12\" y=\"16\" fill=\"#fff\" font-family=\"sans-serif\" font-size=\"7\" font-weight=\"bold\" text-anchor=\"middle\">.json</text>\n      </g>\n    </defs>\n  </svg>\n\n  <script nonce=\"${nonce}\">\n    const projectName = \"${projectName}\";\n    let configData = null;\n    \n    let currentPath = []; \n    let selectedItem = null; // { type: 'dir'|'file', name, node, roleKey, index }\n\n    const explorerView = document.getElementById('explorerView');\n    const breadcrumb = document.getElementById('breadcrumb');\n    const backBtn = document.getElementById('backBtn');\n    const searchInput = document.getElementById('searchInput');\n    const sidebarContent = document.getElementById('sidebarContent');\n\n    async function loadConfig() {\n      try {\n        const res = await fetch('/api/workspace/config', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({ projectName })\n        });\n        const json = await res.json();\n        if (json.project) {\n          configData = json;\n          renderExplorer();\n        } else {\n          explorerView.innerHTML = '<div style=\"color:var(--danger); text-align:center; margin-top:40px;\">Failed to load project config</div>';\n        }\n      } catch (e) {\n        explorerView.innerHTML = '<div style=\"color:var(--danger); text-align:center; margin-top:40px;\">Error connecting to backend API</div>';\n      }\n    }\n\n    async function saveConfig() {\n      try {\n        const res = await fetch('/api/workspace/config', {\n          method: 'PUT',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({\n            projectName,\n            project: configData.project,\n            roles: configData.roles\n          })\n        });\n        return res.ok;\n      } catch (e) {\n        return false;\n      }\n    }\n\n    function buildVfs() {\n      if (!configData || !configData.roles) return null;\n      const vfs = { type: 'dir', children: {} };\n      \n      for (const roleKey of Object.keys(configData.roles)) {\n        const role = configData.roles[roleKey];\n        if (!vfs.children[roleKey]) {\n          vfs.children[roleKey] = { type: 'dir', children: {} };\n        }\n        if (role.files) {\n          role.files.forEach((file, index) => {\n            let virtualPath = file.path || '';\n            const prefix = `.traneAI/${roleKey}/`;\n            if (virtualPath.startsWith(prefix)) {\n              virtualPath = virtualPath.substring(prefix.length);\n            }\n            const parts = virtualPath.split('/').filter(p => p);\n            let currentDir = vfs.children[roleKey];\n            for (let i = 0; i < parts.length - 1; i++) {\n              const p = parts[i];\n              if (!currentDir.children[p]) currentDir.children[p] = { type: 'dir', children: {} };\n              currentDir = currentDir.children[p];\n            }\n            const fileName = parts.length > 0 ? parts[parts.length - 1] : (file.name || 'unnamed');\n            currentDir.children[fileName] = { \n              type: 'file', roleKey: roleKey, fileIndex: index, fileRef: file \n            };\n          });\n        }\n      }\n      return vfs;\n    }\n\n    function renderExplorer() {\n      const vfs = buildVfs();\n      if (!vfs) return;\n\n      let currentDir = vfs;\n      for (const p of currentPath) {\n        if (currentDir.children[p] && currentDir.children[p].type === 'dir') {\n          currentDir = currentDir.children[p];\n        } else {\n          currentPath = [];\n          currentDir = vfs;\n          break;\n        }\n      }\n\n      if (currentPath.length === 0) {\n        breadcrumb.innerHTML = 'TraneAI <span>&gt;</span> roles';\n        backBtn.style.visibility = 'hidden';\n      } else {\n        breadcrumb.innerHTML = 'TraneAI <span>&gt;</span> roles <span>&gt;</span> ' + currentPath.join(' <span>&gt;</span> ');\n        backBtn.style.visibility = 'visible';\n      }\n\n      const query = searchInput.value.toLowerCase();\n      let folders = [];\n      let files = [];\n\n      for (const [name, node] of Object.entries(currentDir.children)) {\n        if (query && !name.toLowerCase().includes(query)) continue;\n        if (node.type === 'dir') folders.push({name, node});\n        else files.push({name, node});\n      }\n\n      let html = '';\n      \n      if (folders.length > 0) {\n        html += '<div class=\"section-title\">Folders:</div><div class=\"grid\">';\n        folders.forEach(f => {\n          const isSelected = selectedItem && selectedItem.type === 'dir' && selectedItem.name === f.name;\n          html += `\n            <div class=\"grid-item ${isSelected ? 'selected' : ''}\" onclick=\"selectItem('dir', '${escapeJs(f.name)}')\">\n              <svg viewBox=\"0 0 24 24\"><use href=\"#icon-folder-3d\"></use></svg>\n              <div class=\"item-label\" title=\"${escapeHtml(f.name)}\">${escapeHtml(f.name)}</div>\n            </div>`;\n        });\n        html += '</div>';\n      }\n\n      if (files.length > 0) {\n        html += '<div class=\"section-title\">Files:</div><div class=\"grid\">';\n        files.forEach(f => {\n          const isSelected = selectedItem && selectedItem.type === 'file' && selectedItem.name === f.name;\n          const fileName = f.node.fileRef.name || f.node.fileRef.id || f.name;\n          const isEnc = f.node.fileRef.encrypted || f.node.fileRef.fileName?.endsWith('.enc');\n          const iconId = isEnc ? '#icon-file-pdf' : '#icon-file-doc';\n          \n          html += `\n            <div class=\"grid-item ${isSelected ? 'selected' : ''}\" onclick=\"selectItem('file', '${escapeJs(f.name)}')\">\n              <svg viewBox=\"0 0 24 24\"><use href=\"${iconId}\"></use></svg>\n              <div class=\"item-label\" title=\"${escapeHtml(fileName)}\">${escapeHtml(fileName)}</div>\n            </div>`;\n        });\n        html += '</div>';\n      }\n      \n      if (folders.length === 0 && files.length === 0) {\n        html = '<div style=\"color:var(--text-muted); font-size:13px;\">No items found.</div>';\n      }\n\n      explorerView.innerHTML = html;\n      renderSidebar();\n    }\n\n    window.selectItem = (type, name) => {\n      // If folder, navigate inside immediately\n      if (type === 'dir') {\n        currentPath.push(name);\n        selectedItem = null;\n        renderExplorer();\n        return;\n      }\n      \n      const vfs = buildVfs();\n      let currentDir = vfs;\n      for (const p of currentPath) currentDir = currentDir.children[p];\n      \n      selectedItem = { type, name, node: currentDir.children[name] };\n      renderExplorer(); // re-render to update highlights\n    };\n\n    function renderSidebar() {\n      if (!selectedItem) {\n        sidebarContent.innerHTML = '<div class=\"empty-sidebar\">Select a file or folder to view details.</div>';\n        return;\n      }\n      \n      if (selectedItem.type === 'dir') {\n        sidebarContent.innerHTML = `\n          <div class=\"sidebar-content\">\n            <div class=\"detail-row\">\n              <div class=\"detail-label\">Folder Name:</div>\n              <div class=\"detail-value\">${escapeHtml(selectedItem.name)}</div>\n            </div>\n            <div class=\"detail-row\">\n              <div class=\"detail-label\">Type:</div>\n              <div class=\"detail-value\">System Folder</div>\n            </div>\n          </div>\n        `;\n        return;\n      }\n      \n      // File Details and Editor\n      const file = selectedItem.node.fileRef;\n      \n      sidebarContent.innerHTML = `\n        <div class=\"sidebar-content\">\n          <div class=\"detail-row\">\n            <div class=\"detail-label\">File Name:</div>\n            <div class=\"detail-value\">${escapeHtml(file.name || file.id)}</div>\n          </div>\n          <div class=\"detail-row\">\n            <div class=\"detail-label\">ID:</div>\n            <input type=\"text\" id=\"sbId\" class=\"editor-input\" value=\"${escapeHtml(file.id || '')}\" style=\"margin-bottom:0;\" />\n          </div>\n          <div class=\"detail-row\">\n            <div class=\"detail-label\">Path:</div>\n            <input type=\"text\" id=\"sbPath\" class=\"editor-input\" value=\"${escapeHtml(file.path || '')}\" style=\"margin-bottom:0;\" />\n          </div>\n          <div class=\"detail-row\" style=\"align-items:center; margin-top:8px;\">\n            <div class=\"detail-label\">Encrypted:</div>\n            <input type=\"checkbox\" id=\"sbEnc\" ${file.encrypted ? 'checked' : ''} />\n          </div>\n          \n          <div class=\"sidebar-preview\">\n            <div class=\"preview-title\">Preview:</div>\n            <div class=\"preview-box\">\n              <textarea id=\"sbContent\" class=\"editor-textarea\" spellcheck=\"false\">${escapeHtml(file.content || '')}</textarea>\n            </div>\n          </div>\n        </div>\n        \n        <div class=\"sidebar-actions\">\n          <button class=\"btn btn-dark\" style=\"color:var(--danger)\" onclick=\"deleteSelectedFile()\">Delete</button>\n          <button class=\"btn btn-blue\" onclick=\"saveSelectedFile()\">Save Details</button>\n        </div>\n      `;\n    }\n\n    window.saveSelectedFile = async () => {\n      if (!selectedItem || selectedItem.type !== 'file') return;\n      const { roleKey, fileIndex } = selectedItem.node;\n      const file = configData.roles[roleKey].files[fileIndex];\n      \n      file.id = document.getElementById('sbId').value;\n      file.path = document.getElementById('sbPath').value;\n      file.encrypted = document.getElementById('sbEnc').checked;\n      file.content = document.getElementById('sbContent').value;\n      file.updatedAt = new Date().toISOString();\n      \n      const success = await saveConfig();\n      if (success) {\n        renderExplorer();\n      } else {\n        alert('Failed to save file.');\n      }\n    };\n    \n    window.deleteSelectedFile = async () => {\n      if (!selectedItem || selectedItem.type !== 'file') return;\n      if (confirm('Are you sure you want to delete this file?')) {\n        const { roleKey, fileIndex } = selectedItem.node;\n        configData.roles[roleKey].files.splice(fileIndex, 1);\n        selectedItem = null;\n        const success = await saveConfig();\n        if (success) renderExplorer();\n      }\n    };\n\n    backBtn.addEventListener('click', () => {\n      if (currentPath.length > 0) {\n        currentPath.pop();\n        selectedItem = null;\n        renderExplorer();\n      }\n    });\n\n    searchInput.addEventListener('input', renderExplorer);\n\n    document.getElementById('addFolderBtn').addEventListener('click', async () => {\n      if (currentPath.length !== 0) {\n        alert('Nested folders are mapped automatically via file paths. Add a root folder here.');\n        return;\n      }\n      const roleName = prompt('Enter the name of the new Folder:');\n      if (!roleName) return;\n      const key = roleName.trim().toLowerCase();\n      if (!configData.roles[key]) {\n        configData.roles[key] = { enabled: true, files: [] };\n        await saveConfig();\n        renderExplorer();\n      }\n    });\n\n    document.getElementById('addFileBtn').addEventListener('click', async () => {\n      if (currentPath.length === 0) {\n        alert('Please enter a role folder first to add a file.');\n        return;\n      }\n      const roleKey = currentPath[0];\n      const subfolders = currentPath.slice(1).join('/');\n      let newPath = `.traneAI/${roleKey}/`;\n      if (subfolders) newPath += subfolders + '/';\n      newPath += 'new_file.json';\n\n      const newFile = {\n        id: 'new-file',\n        name: 'New File',\n        fileName: 'new_file.json',\n        path: newPath,\n        version: 1,\n        createdAt: new Date().toISOString(),\n        updatedAt: new Date().toISOString(),\n        checksum: '',\n        encrypted: false,\n        content: '# New file'\n      };\n\n      if (!configData.roles[roleKey].files) configData.roles[roleKey].files = [];\n      configData.roles[roleKey].files.push(newFile);\n      await saveConfig();\n      \n      // Auto select the new file\n      selectedItem = { type: 'file', name: 'new_file.json', node: { roleKey, fileIndex: configData.roles[roleKey].files.length - 1, fileRef: newFile } };\n      renderExplorer();\n    });\n\n    document.getElementById('refreshBtn').addEventListener('click', loadConfig);\n\n    function escapeHtml(unsafe) {\n      if (!unsafe) return '';\n      return String(unsafe).replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\").replace(/\"/g, \"&quot;\").replace(/'/g, \"&#039;\");\n    }\n    function escapeJs(unsafe) {\n      if (!unsafe) return '';\n      return String(unsafe).replace(/'/g, \"\\\\'\").replace(/\"/g, '&quot;');\n    }\n\n    loadConfig();\n  </script>\n</body>\n</html>\n";
  const finalHtml = template
    .replace(/\$\{nonce\}/g, nonce)
    .replace(/\$\{projectName\}/g, projectName);
  res.send(finalHtml);
}
