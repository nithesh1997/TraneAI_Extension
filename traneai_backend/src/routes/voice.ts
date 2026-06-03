import express from 'express';
import multer from 'multer';
import { handleTranscribe, handleTTS } from '../controllers/voiceController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

/**
 * @swagger
 * /api/voice/transcribe:
 *   post:
 *     summary: Transcribe audio file to text
 *     tags:
 *       - Voice
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Transcribed text
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 text:
 *                   type: string
 */
router.post('/transcribe', upload.single('audio'), handleTranscribe);

/**
 * @swagger
 * /api/voice/tts:
 *   post:
 *     summary: Convert text to speech
 *     tags:
 *       - Voice
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Audio file (MP3)
 *         content:
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/tts', handleTTS);

export default router;
