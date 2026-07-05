import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import zlib from 'zlib';
import crypto from 'crypto';
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

export async function getWorkspaceModes(req: Request, res: Response): Promise<void> {
    const modes = [
        { 
            id: 'auto', 
            name: 'Auto', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9 1L2 9h5l-1 6 7-8H8l1-6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'zenflow', 
            name: 'Zenflow', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#252525;color:#e6e6e6;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2C8 2 3 6.5 3 10C3 12.7614 5.23858 15 8 15C10.7614 15 13 12.7614 13 10C13 6.5 8 2 8 2Z" stroke="currentColor" stroke-width="1.5"/><path d="M5 11H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'new-joiner', 
            name: 'New joiner', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#043615;color:#22c55e;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 14V6M8 6C8 6 5.5 3.5 3.5 3.5C2 3.5 2 5.5 2 7.5C2 9.5 8 9.5 8 9.5M8 6C8 6 10.5 3.5 12.5 3.5C14 3.5 14 5.5 14 7.5C14 9.5 8 9.5 8 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'developers', 
            name: 'Developers', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#111d4a;color:#93c5fd;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5 4L2 8l3 4M11 4l3 4-3 4M9 2L7 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'qa', 
            name: 'QA', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#2e104f;color:#d8b4fe;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1L3 3v4c0 4 5 8 5 8s5-4 5-8V3L8 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'eva', 
            name: 'EVA', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#4a1010;color:#fca5a5;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="5" width="10" height="8" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 2v3M10 2v3M5 9h1M10 9h1M7 13v-2h2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>`,
            canAttachFiles: true
        },
        { 
            id: 'automated-testing', 
            name: 'Automated testing', 
            icon: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#282828;color:#e5e5e5;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5.5 2h5M8 2v5L4 13h8L8 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 10h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>`,
            canAttachFiles: true
        }
    ];
    res.json(modes);
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

export async function getAllProjects(req: Request, res: Response): Promise<void> {
    try {
        const { ProjectConfig } = await import('../models/ProjectConfig.js');
        const projects = await ProjectConfig.find({});
        res.json(projects);
    } catch (error) {
        console.error('Get all projects error:', error);
        res.status(500).json({ error: 'Failed to retrieve all projects' });
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

        if (req.body.rootPath && fs.existsSync(req.body.rootPath)) {
            try {
                const traneAIDir = path.join(req.body.rootPath, '.traneAI');
                if (!fs.existsSync(traneAIDir)) {
                    fs.mkdirSync(traneAIDir, { recursive: true });
                }
                const configPath = path.join(traneAIDir, 'config.json');
                fs.writeFileSync(configPath, JSON.stringify({ project: config.project, roles: config.roles }, null, 2), 'utf-8');
            } catch (fsError) {
                console.error('Failed to sync config.json to disk:', fsError);
            }
        }

        res.json({ success: true, project: config.project, roles: config.roles });
    } catch (error) {
        console.error('Update project config error:', error);
        res.status(500).json({ error: 'Failed to update project config' });
    }
}

export async function deleteWorkspaceFile(req: Request, res: Response): Promise<void> {
    try {
        const { rootPath, filePath } = req.body;
        if (!filePath) {
            res.status(400).json({ error: 'filePath is required' });
            return;
        }

        const { WorkspaceFile } = await import('../models/WorkspaceFile.js');
        await WorkspaceFile.deleteMany({ filePath: new RegExp(`^${filePath.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}`) });

        // Optionally delete physical if it exists just to be safe
        if (rootPath && fs.existsSync(rootPath)) {
            const fullPath = path.join(rootPath, filePath);
            if (fs.existsSync(fullPath)) {
                if (fs.statSync(fullPath).isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
}

export function getEncryptionKey(secret: string): Buffer {
    return crypto.scryptSync(secret || 'traneai-default-secret', 'traneai-salt', 32);
}

export async function uploadWorkspaceFile(req: Request, res: Response): Promise<void> {
    try {
        const { rootPath, mid, roleKey, filePath, content, fileName } = req.body;
        if (!filePath) {
            res.status(400).json({ error: 'filePath is required' });
            return;
        }

        // Checksum
        const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

        // Encrypt
        const compressed = zlib.deflateSync(content);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(mid), iv);
        const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
        const finalBuffer = Buffer.concat([iv, encrypted]);
        const contentBase64 = finalBuffer.toString('base64');

        // Store in DB instead of writing to disk
        const { WorkspaceFile } = await import('../models/WorkspaceFile.js');
        await WorkspaceFile.findOneAndUpdate(
            { filePath },
            {
                $set: {
                    content: contentBase64,
                    checksum,
                    encrypted: true
                }
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, checksum, encrypted: true });
    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({ error: 'Failed to upload and encrypt file to DB' });
    }
}

export async function getWorkspaceFileContent(req: Request, res: Response): Promise<void> {
    try {
        const { rootPath, mid, filePath, isEncrypted } = req.body;
        if (!filePath) {
            res.status(400).json({ error: 'filePath is required' });
            return;
        }

        // Fetch from DB first
        const { WorkspaceFile } = await import('../models/WorkspaceFile.js');
        const dbFile = await WorkspaceFile.findOne({ filePath });
        
        let buffer: Buffer;

        if (dbFile && dbFile.content) {
            buffer = Buffer.from(dbFile.content, 'base64');
        } else {
            // Fallback to local disk if not found in DB
            if (!rootPath || !fs.existsSync(rootPath)) {
                res.status(400).json({ error: 'Valid workspace root is required' });
                return;
            }
            const fullPath = path.join(rootPath, filePath);
            if (!fs.existsSync(fullPath)) {
                res.status(404).json({ error: 'File not found on disk or DB' });
                return;
            }
            buffer = fs.readFileSync(fullPath);
        }

        if (isEncrypted || (dbFile && dbFile.encrypted)) {
            if (buffer.length === 0) {
                res.json({ success: true, content: '' });
                return;
            }
            const iv = buffer.subarray(0, 16);
            const encryptedData = buffer.subarray(16);
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(mid), iv);
            const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
            const content = zlib.inflateSync(decrypted).toString('utf-8');
            res.json({ success: true, content });
        } else {
            const content = buffer.toString('utf-8');
            res.json({ success: true, content });
        }
    } catch (error) {
        console.error('Get file content error:', error);
        res.status(500).json({ error: 'Failed to decrypt file content' });
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
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}' https://cdnjs.cloudflare.com`,
      `style-src 'self' 'unsafe-inline' 'nonce-${nonce}' https://cdnjs.cloudflare.com`,
      "img-src 'self' data:",
      "connect-src 'self' ws: wss: http: https:",
      "font-src 'self' data: https://cdnjs.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "worker-src 'self' blob: data:"
    ].join('; ')
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const fs = require('fs');
  const path = require('path');
  
  const viewsDir = path.join(__dirname, '..', 'views', 'admin-grid');
  const htmlTemplate = fs.readFileSync(path.join(viewsDir, 'index.html'), 'utf8');
  const styleCss = fs.readFileSync(path.join(viewsDir, 'style.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(viewsDir, 'app.js'), 'utf8');
  
  const finalHtml = htmlTemplate
    .replace(/\$\{nonce\}/g, nonce)
    .replace(/\$\{projectName\}/g, projectName)
    .replace(/\$\{styleCss\}/g, styleCss)
    .replace(/\$\{appJs\}/g, appJs);
    
  res.send(finalHtml);}
