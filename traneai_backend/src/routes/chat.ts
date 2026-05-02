import { Router } from 'express';
import { handleChatMessage, handleQuickAction } from '../controllers/chatController.js';

const router = Router();

/**
 * POST /api/chat/message
 * @summary Send a chat message
 * @tags Chat
 * @param {object} request.body - Chat message request
 * @return {object} 200 - Success response
 * @return {object} 400 - Bad request
 * @return {object} 500 - Server error
 */
router.post('/message', handleChatMessage);

/**
 * POST /api/chat/quick-action
 * @summary Execute a quick action (explain, review, or generate tests)
 * @tags Quick Actions
 * @param {object} request.body - Quick action request
 * @return {object} 200 - Success response with code block
 * @return {object} 400 - Bad request
 * @return {object} 500 - Server error
 */
router.post('/quick-action', handleQuickAction);

/**
 * GET /api/chat/history
 * @summary Get chat history
 * @tags Chat
 * @return {object} 200 - Success response
 */
router.get('/history', (req, res) => {
  res.json({ messages: [], history: 'placeholder' });
});

export default router;