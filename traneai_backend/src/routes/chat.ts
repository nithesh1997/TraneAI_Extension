import express from 'express';
import multer from 'multer';
import { handleChatMessage, handleQuickAction } from '../controllers/chatController.js';

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

/**
 * @swagger
 * /api/chat/message:
 *   post:
 *     summary: Send message or image+text to TraneAI chatbot
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRequest'
 *         'multipart/form-data':
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: User text input (required for both text and vision)
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional image file for vision analysis
 *     responses:
 *       200:
 *         description: AI response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatResponse'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/message', upload.single('image'), handleChatMessage);

/**
 * @swagger
 * /api/chat/quick-action:
 *   post:
 *     summary: Run quick code action
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuickActionRequest'
 *     responses:
 *       200:
 *         description: Quick action response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuickActionResponse'
 */
router.post('/quick-action', handleQuickAction);

export default router;

