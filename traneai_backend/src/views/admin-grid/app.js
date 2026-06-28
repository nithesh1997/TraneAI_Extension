// Global State
const urlParams = new URLSearchParams(window.location.search);
const rootPath = urlParams.get('rootPath') || '';
const mid = urlParams.get('mid') || '';
let configData = null;
let currentPath = [];
let selectedItem = null;
let editorInstance = null;

// DOM Elements
const explorerGrid = document.getElementById('explorerGrid');
const breadcrumb = document.getElementById('breadcrumb');
const sidebarContent = document.getElementById('sidebarContent');
const searchInput = document.getElementById('searchInput');
const viewExplorer = document.getElementById('viewExplorer');
const viewEditor = document.getElementById('viewEditor');
const contextMenu = document.getElementById('contextMenu');

// Initialize
async function init() {
  await loadConfig();
  
  // Event delegation for grid items to handle single/double clicks reliably
  explorerGrid.addEventListener('click', handleGridClick);
  explorerGrid.addEventListener('dblclick', handleGridDblClick);
  explorerGrid.addEventListener('contextmenu', handleGridContextMenu);
  
  document.addEventListener('click', () => {
    contextMenu.classList.remove('show');
  });

  // Breadcrumb delegation
  breadcrumb.addEventListener('click', (e) => {
    const item = e.target.closest('.breadcrumb-item');
    if (!item) return;
    const pathStr = item.getAttribute('data-path');
    if (pathStr) navigateToPath(JSON.parse(pathStr));
  });

  // Context Menu delegation
  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-item');
    if (!item || item.classList.contains('disabled')) return;
    const action = item.getAttribute('data-action');
    if (action === 'open') handleGridDblClick({target: document.querySelector('.grid-item.selected')});
    else if (action === 'edit') openEditor();
    else if (action === 'deleteFolder') deleteSelectedFolder();
    else if (action === 'deleteFile') deleteSelectedFile();
  });

  // Sidebar delegation
  sidebarContent.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'deleteSidebarFile') deleteSelectedFile();
    else if (action === 'saveSidebarDetails') window.saveSidebarDetails();
  });

  searchInput.addEventListener('input', () => renderExplorer());
  
  document.getElementById('editorBackBtn').addEventListener('click', closeEditor);
  document.getElementById('editorSaveBtn').addEventListener('click', saveEditorContent);
  
  // Setup tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', (e) => {
      document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      const tabName = e.target.getAttribute('data-tab');
      document.getElementById('monacoContainer').style.display = tabName === 'edit' ? 'block' : 'none';
      document.getElementById('previewContainer').style.display = tabName === 'preview' ? 'block' : 'none';
      document.getElementById('historyContainer').style.display = tabName === 'history' ? 'block' : 'none';
      if (tabName === 'preview' && editorInstance) {
        document.getElementById('previewContainer').textContent = editorInstance.getValue();
      }
    });
  });

  // Buttons
  document.getElementById('addFolderBtn').addEventListener('click', addFolder);
  document.getElementById('addFileBtn').addEventListener('click', addFile);
  document.getElementById('refreshBtn').addEventListener('click', loadConfig);

  // Initialize Monaco Editor
  require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
  require(['vs/editor/editor.main'], function() {
    editorInstance = monaco.editor.create(document.getElementById('monacoContainer'), {
      value: "",
      language: "json",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      formatOnPaste: true,
      fontSize: 13,
      padding: { top: 16 }
    });
  });
}

// API Calls
async function loadConfig() {
  try {
    const res = await fetch('/api/workspace/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName })
    });
    const json = await res.json();
    if (json.project) {
      configData = json;
      renderExplorer();
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }
}

async function saveConfig() {
  try {
    const res = await fetch('/api/workspace/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, rootPath, project: configData.project, roles: configData.roles })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// VFS logic
function buildVfs() {
  if (!configData || !configData.roles) return null;
  const vfs = { type: 'dir', children: {} };
  
  for (const roleKey of Object.keys(configData.roles)) {
    const role = configData.roles[roleKey];
    if (!vfs.children[roleKey]) vfs.children[roleKey] = { type: 'dir', children: {} };
    if (role.files) {
      role.files.forEach((file, index) => {
        let virtualPath = file.path || '';
        const prefix = `.traneAI/${roleKey}/`;
        if (virtualPath.startsWith(prefix)) virtualPath = virtualPath.substring(prefix.length);
        const parts = virtualPath.split('/').filter(p => p);
        let currentDir = vfs.children[roleKey];
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          if (!currentDir.children[p]) currentDir.children[p] = { type: 'dir', children: {} };
          currentDir = currentDir.children[p];
        }
        const fileName = parts.length > 0 ? parts[parts.length - 1] : (file.name || 'unnamed');
        currentDir.children[fileName] = { type: 'file', roleKey, fileIndex: index, fileRef: file };
      });
    }
  }
  return vfs;
}

// Rendering
function renderBreadcrumb() {
  let html = `<div class="breadcrumb-item" data-path="[]">Home</div>`;
  let pathBuilder = [];
  for (let p of currentPath) {
    pathBuilder.push(p);
    const pbStr = JSON.stringify(pathBuilder).replace(/"/g, '&quot;');
    html += `<span class="breadcrumb-separator">/</span><div class="breadcrumb-item" data-path="${pbStr}">${escapeHtml(p)}</div>`;
  }
  breadcrumb.innerHTML = html;
}

window.navigateToPath = (pathArr) => {
  currentPath = pathArr;
  selectedItem = null;
  renderExplorer();
};

function renderExplorer() {
  renderBreadcrumb();
  const vfs = buildVfs();
  if (!vfs) return;

  let currentDir = vfs;
  for (const p of currentPath) {
    if (currentDir.children[p] && currentDir.children[p].type === 'dir') {
      currentDir = currentDir.children[p];
    } else {
      currentPath = [];
      currentDir = vfs;
      break;
    }
  }

  const query = searchInput.value.toLowerCase();
  let folders = [];
  let files = [];

  for (const [name, node] of Object.entries(currentDir.children)) {
    if (query && !name.toLowerCase().includes(query)) continue;
    if (node.type === 'dir') folders.push({name, node});
    else files.push({name, node});
  }

  // Icons
  const folderIcon = `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  const fileIcon = `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

  if (folders.length === 0 && files.length === 0) {
    explorerGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        <p>This folder is empty.</p>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-dark" onclick="document.getElementById('addFolderBtn').click()">Add Folder</button>
          <button class="btn btn-blue" onclick="document.getElementById('addFileBtn').click()">New File</button>
        </div>
      </div>`;
    renderSidebar();
    return;
  }

  let html = '<div class="explorer-grid">';
  folders.forEach(f => {
    const isSelected = selectedItem && selectedItem.type === 'dir' && selectedItem.name === f.name;
    html += `
      <div class="grid-item ${isSelected ? 'selected' : ''}" data-type="dir" data-name="${escapeHtml(f.name)}">
        <div class="icon folder-icon">${folderIcon}</div>
        <div class="item-label" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
      </div>`;
  });
  files.forEach(f => {
    const isSelected = selectedItem && selectedItem.type === 'file' && selectedItem.name === f.name;
    const fileName = f.node.fileRef.name || f.node.fileRef.id || f.name;
    html += `
      <div class="grid-item ${isSelected ? 'selected' : ''}" data-type="file" data-name="${escapeHtml(f.name)}">
        <div class="icon file-icon">${fileIcon}</div>
        <div class="item-label" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
      </div>`;
  });
  html += '</div>';
  explorerGrid.innerHTML = html;
  renderSidebar();
}

// Interactions
function handleGridClick(e) {
  const item = e.target.closest('.grid-item');
  if (!item) return;
  const type = item.getAttribute('data-type');
  const name = item.getAttribute('data-name');
  
  // Find node
  const vfs = buildVfs();
  let currentDir = vfs;
  for (const p of currentPath) currentDir = currentDir.children[p];
  selectedItem = { type, name, node: currentDir.children[name] };
  
  document.querySelectorAll('.grid-item').forEach(el => el.classList.remove('selected'));
  item.classList.add('selected');
  renderSidebar();
}

function handleGridDblClick(e) {
  const item = e.target.closest('.grid-item');
  if (!item) return;
  const type = item.getAttribute('data-type');
  const name = item.getAttribute('data-name');
  
  if (type === 'dir') {
    currentPath.push(name);
    selectedItem = null;
    renderExplorer();
  } else if (type === 'file') {
    openEditor();
  }
}

function handleGridContextMenu(e) {
  const item = e.target.closest('.grid-item');
  if (!item) return;
  e.preventDefault();
  
  const type = item.getAttribute('data-type');
  const name = item.getAttribute('data-name');
  handleGridClick(e); // Select it
  
  let html = '';
  if (type === 'dir') {
    html = `
      <div class="context-item" data-action="open">Open</div>
      <div class="context-divider"></div>
      <div class="context-item danger" data-action="deleteFolder">Delete</div>
    `;
  } else {
    html = `
      <div class="context-item" data-action="edit">Edit</div>
      <div class="context-divider"></div>
      <div class="context-item danger" data-action="deleteFile">Delete</div>
    `;
  }
  
  contextMenu.innerHTML = html;
  contextMenu.style.left = e.pageX + 'px';
  contextMenu.style.top = e.pageY + 'px';
  contextMenu.classList.add('show');
}

// Sidebar Details
function renderSidebar() {
  if (!selectedItem) {
    sidebarContent.innerHTML = '<div class="details-empty">Select a file or folder<br>to view details.</div>';
    return;
  }
  
  if (selectedItem.type === 'dir') {
    const childrenCount = Object.keys(selectedItem.node.children).length;
    sidebarContent.innerHTML = `
      <div class="details-panel">
        <h2 style="margin-bottom:20px; word-break:break-word; display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          ${escapeHtml(selectedItem.name)}
        </h2>
        <div class="meta-card">
          <div class="meta-row"><div class="meta-label">Type</div><div class="meta-value">Folder</div></div>
          <div class="meta-row"><div class="meta-label">Contains</div><div class="meta-value">${childrenCount} items</div></div>
        </div>
      </div>
    `;
    return;
  }
  
  const file = selectedItem.node.fileRef;
  const dateStr = file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : 'Unknown';
  
  sidebarContent.innerHTML = `
    <div class="details-panel">
      <h2 style="margin-bottom:20px; word-break:break-word; display:flex; align-items:center; gap:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        ${escapeHtml(file.name || file.id)}
      </h2>
      <div class="meta-card">
        <div class="meta-row"><div class="meta-label">File</div><div class="meta-value">${escapeHtml(file.fileName || file.id)}</div></div>
        <div class="meta-row"><div class="meta-label">Version</div><div class="meta-value">${file.version || 1}</div></div>
        <div class="meta-row"><div class="meta-label">Encrypted</div><div class="meta-value">${file.encrypted ? 'Yes' : 'No'}</div></div>
        <div class="meta-row"><div class="meta-label">Updated</div><div class="meta-value">${dateStr}</div></div>
      </div>
      
      <div style="margin-top:20px;">
        <label class="meta-label">File ID</label>
        <input type="text" class="sidebar-input" id="sbId" value="${escapeHtml(file.id || '')}" />
      </div>
      <div style="margin-top:12px;">
        <label class="meta-label">Path</label>
        <input type="text" class="sidebar-input" id="sbPath" value="${escapeHtml(file.path || '')}" />
      </div>
      
      <div style="display:flex; gap:8px; margin-top:24px;">
        <button class="btn btn-dark danger" style="flex:1;" data-action="deleteSidebarFile">Delete</button>
        <button class="btn btn-blue" style="flex:1;" data-action="saveSidebarDetails">Save Details</button>
      </div>
    </div>
  `;
}

window.saveSidebarDetails = async () => {
  if (!selectedItem || selectedItem.type !== 'file') return;
  const { roleKey, fileIndex } = selectedItem.node;
  const file = configData.roles[roleKey].files[fileIndex];
  file.id = document.getElementById('sbId').value;
  file.path = document.getElementById('sbPath').value;
  file.updatedAt = new Date().toISOString();
  if (await saveConfig()) renderExplorer();
};

window.deleteSelectedFile = async () => {
  if (!selectedItem || selectedItem.type !== 'file') return;
  if (confirm('Are you sure you want to delete this file?')) {
    const { roleKey, fileIndex } = selectedItem.node;
    const file = configData.roles[roleKey].files[fileIndex];
    
    // Delete physical file first
    try {
      await fetch('/api/workspace/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath, filePath: file.path })
      });
    } catch (e) {
      console.error('Failed to delete physical file', e);
    }
    configData.roles[roleKey].files.splice(fileIndex, 1);
    selectedItem = null;
    if (await saveConfig()) renderExplorer();
  }
};

window.deleteSelectedFolder = async () => {
  if (!selectedItem || selectedItem.type !== 'dir') return;
  if (confirm('Are you sure you want to delete this folder and ALL its contents?')) {
    // If it's a root folder (roleKey)
    if (currentPath.length === 0) {
      delete configData.roles[selectedItem.name];
    } else {
      alert('Deleting subfolders is not directly supported yet (they are path-based).');
      return;
    }
    selectedItem = null;
    if (await saveConfig()) renderExplorer();
  }
};

// Editor Logic
window.openEditor = async () => {
  if (!selectedItem || selectedItem.type !== 'file') return;
  const file = selectedItem.node.fileRef;
  
  viewExplorer.classList.remove('active');
  viewEditor.classList.add('active');
  
  document.getElementById('editorFileName').textContent = file.name || file.id;
  document.getElementById('editorVersion').textContent = file.version || 1;
  
  let contentToEdit = '';
  try {
    const res = await fetch('/api/workspace/file-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath, mid, filePath: file.path, isEncrypted: file.encrypted })
    });
    const json = await res.json();
    if (json.success) {
      contentToEdit = json.content;
    }
  } catch (e) {
    console.error('Failed to load file content', e);
  }

  if (editorInstance) {
    editorInstance.setValue(contentToEdit);
    const model = editorInstance.getModel();
    if (model) {
      const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
      let lang = 'plaintext';
      if (ext === 'json') lang = 'json';
      else if (ext === 'md') lang = 'markdown';
      else if (ext === 'js' || ext === 'ts') lang = 'javascript';
      monaco.editor.setModelLanguage(model, lang);
    }
  } else {
    // If Monaco failed to load
    document.getElementById('monacoContainer').innerHTML = '<textarea id="fallbackEditor" style="width:100%;height:100%;background:#1e1e1e;color:#fff;border:none;padding:20px;font-family:monospace;"></textarea>';
    document.getElementById('fallbackEditor').value = contentToEdit;
  }
};

window.closeEditor = () => {
  viewEditor.classList.remove('active');
  viewExplorer.classList.add('active');
};

window.saveEditorContent = async () => {
  if (!selectedItem || selectedItem.type !== 'file') return;
  const { roleKey, fileIndex } = selectedItem.node;
  const file = configData.roles[roleKey].files[fileIndex];
  
  let newContent = '';
  if (editorInstance) {
    newContent = editorInstance.getValue();
  } else {
    newContent = document.getElementById('fallbackEditor').value;
  }

  try {
    const res = await fetch('/api/workspace/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath, mid, roleKey, filePath: file.path, content: newContent, fileName: file.name })
    });
    const json = await res.json();
    if (json.success) {
      file.checksum = json.checksum;
      file.encrypted = json.encrypted;
      file.version = (file.version || 1) + 1;
      file.updatedAt = new Date().toISOString();
      
      document.getElementById('editorVersion').textContent = file.version;
      document.getElementById('editorSaveBtn').textContent = 'Saved!';
      setTimeout(() => document.getElementById('editorSaveBtn').textContent = 'Save', 2000);
      
      await saveConfig();
    }
  } catch (e) {
    console.error('Failed to save file', e);
  }
};

// Global Actions
async function addFolder() {
  if (currentPath.length !== 0) {
    alert('Nested folders are mapped automatically via file paths. Add a root folder here.');
    return;
  }
  const roleName = prompt('Enter the name of the new Root Folder (Role):');
  if (!roleName) return;
  const key = roleName.trim().toLowerCase();
  if (!configData.roles[key]) {
    configData.roles[key] = { enabled: true, files: [] };
    await saveConfig();
    renderExplorer();
  }
}

async function addFile() {
  if (currentPath.length === 0) {
    alert('Please enter a role folder first to add a file.');
    return;
  }
  const fileInput = document.getElementById('fileUploadInput');
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const roleKey = currentPath[0];
    const subfolders = currentPath.slice(1).join('/');
    let newPath = `.traneAI/${roleKey}/`;
    if (subfolders) newPath += subfolders + '/';
    newPath += file.name;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      
      try {
        const uploadRes = await fetch('/api/workspace/upload-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootPath, mid, roleKey, filePath: newPath, content, fileName: file.name })
        });
        const uploadJson = await uploadRes.json();
        
        if (uploadJson.success) {
          const newFile = {
            id: file.name.replace(/\.[^/.]+$/, ""),
            name: file.name,
            fileName: file.name,
            path: newPath,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            checksum: uploadJson.checksum,
            encrypted: uploadJson.encrypted
          };

          if (!configData.roles[roleKey].files) configData.roles[roleKey].files = [];
          configData.roles[roleKey].files.push(newFile);
          await saveConfig();
          
          selectedItem = { type: 'file', name: file.name, node: { roleKey, fileIndex: configData.roles[roleKey].files.length - 1, fileRef: newFile } };
          renderExplorer();
        } else {
          alert('Failed to upload file');
        }
      } catch (e) {
        console.error('Upload error', e);
        alert('Upload error');
      }
      
      e.target.value = '';
    };
    reader.readAsText(file);
  };
  fileInput.click();
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

init();
