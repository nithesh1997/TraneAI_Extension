import { Router, Request, Response } from 'express';
import { handleLogout, handleGetCurrentUser } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/logout
 * @summary Logout current user
 * @tags Auth
 * @security BearerAuth
 * @return {object} 200 - Success response
 */
router.post('/logout', authenticateToken, handleLogout);

/**
 * GET /api/auth/me
 * @summary Get current authenticated user
 * @tags Auth
 * @security BearerAuth
 * @return {object} 200 - Success response with user data
 * @return {object} 401 - Unauthorized
 */
router.get('/me', authenticateToken, handleGetCurrentUser);

export default router;
