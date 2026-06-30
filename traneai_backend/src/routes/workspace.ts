import express from 'express';
import { getWorkspaceFiles, getWorkspaceFolders, getWorkspaceBranches, getProjectConfig, updateProjectConfig, serveAdminPortalClient, uploadWorkspaceFile, getWorkspaceFileContent, deleteWorkspaceFile } from '../controllers/workspaceController.js';

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

/**
 * @swagger
 * /api/workspace/config:
 *   post:
 *     summary: Get project configuration by package.json name
 *     tags:
 *       - Workspace
 */
router.post('/config', getProjectConfig);

/**
 * @swagger
 * /api/workspace/config:
 *   put:
 *     summary: Update project configuration
 *     tags:
 *       - Workspace
 */
router.put('/config', updateProjectConfig);

/**
 * @swagger
 * /api/workspace/upload-file:
 *   post:
 *     summary: Upload and encrypt a workspace file
 *     tags:
 *       - Workspace
 */
router.post('/upload-file', uploadWorkspaceFile);

/**
 * @swagger
 * /api/workspace/file-content:
 *   post:
 *     summary: Get decrypted workspace file content
 *     tags:
 *       - Workspace
 */
router.post('/file-content', getWorkspaceFileContent);

/**
 * @swagger
 * /api/workspace/delete-file:
 *   post:
 *     summary: Delete a workspace file
 *     tags:
 *       - Workspace
 */
router.post('/delete-file', deleteWorkspaceFile);

/**
 * @swagger
 * /api/workspace/admin:
 *   get:
 *     summary: Serve the Admin Portal UI
 *     tags:
 *       - Workspace
 */
router.get('/admin', serveAdminPortalClient);

export default router;
