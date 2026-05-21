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
