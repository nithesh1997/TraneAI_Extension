import express from 'express';
import { getWorkspaceFiles, getWorkspaceFolders, getWorkspaceBranches } from '../controllers/workspaceController.js';

const router = express.Router();

/**
 * @swagger
 * /api/workspace/files:
 *   get:
 *     summary: Get all files in the workspace for autocomplete
 *     tags:
 *       - Workspace
 */
router.get('/files', getWorkspaceFiles);

/**
 * @swagger
 * /api/workspace/folders:
 *   get:
 *     summary: Get all folders in the workspace
 *     tags:
 *       - Workspace
 */
router.get('/folders', getWorkspaceFolders);

/**
 * @swagger
 * /api/workspace/branches:
 *   get:
 *     summary: Get all git branches in the workspace
 *     tags:
 *       - Workspace
 */
router.get('/branches', getWorkspaceBranches);

export default router;
