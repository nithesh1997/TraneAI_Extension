import { Request, Response } from 'express';
import fs from 'fs';
import { ChatRequest, QuickActionRequest } from '../types/index.js';
import { generateAIResponse, generateVisionResponse } from '../services/aiService.js';
import { generateExplanation, generateReview, generateTests } from '../services/codeAnalysisService.js';

export async function handleChatMessage(req: Request, res: Response): Promise<void> {
  const isStream = req.query.stream === 'true';

  try {
    const uploadedFiles = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (uploadedFiles.length > 0) {
      const userInput = req.body.message;
      if (!userInput) {
        res.status(400).json({ error: 'Message required with image' });
        return;
      }
      const images = uploadedFiles.map(file => {
        const imageBuffer = fs.readFileSync(file.path);
        return { base64: imageBuffer.toString('base64'), mimeType: file.mimetype || 'image/jpeg' };
      });
      const reply = await generateVisionResponse(userInput, images);
      for (const file of uploadedFiles) { fs.unlinkSync(file.path); }
      res.json({ message: reply });
      return;
    }

    const { message, model, context, workspaceRoot, pinnedFiles } = req.body as ChatRequest;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const pinnedFilesArray = Array.isArray(pinnedFiles) ? pinnedFiles : [];

    let history: { role: 'user' | 'assistant'; content: string }[] | undefined;
    if (req.body.history) {
      try {
        history = typeof req.body.history === 'string' ? JSON.parse(req.body.history) : req.body.history;
      } catch {}
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const onStep = (step: string) => {
        res.write(`data: ${JSON.stringify({ type: 'step', content: step })}\n\n`);
      };

      const reply = await generateAIResponse(message, history, context, workspaceRoot, model, onStep, pinnedFilesArray);
      res.write(`data: ${JSON.stringify({ type: 'final', content: reply })}\n\n`);
      res.end();
    } else {
      const reply = await generateAIResponse(message, history, context, workspaceRoot, model, undefined, pinnedFilesArray);
      res.json({ message: reply });
    }
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process message' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Process failed' })}\n\n`);
      res.end();
    }
  }
}

export async function handleQuickAction(req: Request, res: Response): Promise<void> {
  try {
    const { action, fileName, language, content, lineCount } = req.body as QuickActionRequest;

    if (!action || !fileName || !language || !content) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    let responseText = '';
    let codeBlock: string | undefined;
    let codeLanguage: string | undefined;

    switch (action) {
      case 'explain':
        responseText = generateExplanation(fileName, language, content, lineCount);
        break;
      case 'review':
        responseText = generateReview(fileName, language, content, lineCount);
        break;
      case 'tests': {
        const result = generateTests(fileName, language, content, lineCount);
        responseText = result.text;
        codeBlock = result.code;
        codeLanguage = result.language;
        break;
      }
      default:
        res.status(400).json({ error: 'Invalid action' });
        return;
    }

    res.json({
      message: responseText,
      codeBlock,
      language: codeLanguage,
    });
  } catch (error) {
    console.error('Quick action error:', error);
    res.status(500).json({ error: 'Failed to process quick action' });
  }
}