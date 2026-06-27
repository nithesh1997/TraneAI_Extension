import { Router, Request, Response } from 'express';
import { handleLogout, handleGetCurrentUser, handleSignup, handleLogin } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/signup
 * @summary Create a new user account
 * @tags Auth
 * @return {object} 201 - Success response
 * @return {object} 400 - Bad request
 */
router.post('/signup', handleSignup);

/**
 * POST /api/auth/login
 * @summary Login to an existing account
 * @tags Auth
 * @return {object} 200 - Success response
 * @return {object} 401 - Unauthorized
 */
router.post('/login', handleLogin);

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
