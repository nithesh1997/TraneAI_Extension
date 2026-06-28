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

function getEncryptionKey(secret: string): Buffer {
    return crypto.scryptSync(secret || 'traneai-default-secret', 'traneai-salt', 32);
}

export async function uploadWorkspaceFile(req: Request, res: Response): Promise<void> {
    try {
        const { rootPath, mid, roleKey, filePath, content, fileName } = req.body;
        if (!rootPath || !fs.existsSync(rootPath)) {
            res.status(400).json({ error: 'Valid workspace root is required' });
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

        // Ensure directory exists
        const fullPath = path.join(rootPath, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write
        fs.writeFileSync(fullPath, finalBuffer);

        res.json({ success: true, checksum, encrypted: true });
    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({ error: 'Failed to upload and encrypt file' });
    }
}

export async function getWorkspaceFileContent(req: Request, res: Response): Promise<void> {
    try {
        const { rootPath, mid, filePath, isEncrypted } = req.body;
        if (!rootPath || !fs.existsSync(rootPath)) {
            res.status(400).json({ error: 'Valid workspace root is required' });
            return;
        }

        const fullPath = path.join(rootPath, filePath);
        if (!fs.existsSync(fullPath)) {
            res.status(404).json({ error: 'File not found on disk' });
            return;
        }

        if (isEncrypted) {
            const buffer = fs.readFileSync(fullPath);
            const iv = buffer.subarray(0, 16);
            const encryptedData = buffer.subarray(16);
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(mid), iv);
            const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
            const content = zlib.inflateSync(decrypted).toString('utf-8');
            res.json({ success: true, content });
        } else {
            const content = fs.readFileSync(fullPath, 'utf-8');
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
