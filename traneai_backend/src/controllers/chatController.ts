import { Request, Response } from 'express';
import fs from 'fs';
import { ChatRequest, QuickActionRequest } from '../types/index.js';
import { generateAIResponse, generateAIResponseStreaming } from '../services/aiService.js';
import { generateDeepExplanation, formatDeepExplanation, generateExplanation, generateReview, generateTests } from '../services/codeAnalysisService.js';

export async function handleChatMessage(req: Request, res: Response): Promise<void> {
  const isStream = req.query.stream === 'true';

  try {
    const uploadedFiles = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];

    let images: { base64: string; mimeType: string }[] | undefined;
    if (uploadedFiles.length > 0) {
      images = uploadedFiles.map(file => {
        const imageBuffer = fs.readFileSync(file.path);
        return { base64: imageBuffer.toString('base64'), mimeType: file.mimetype || 'image/jpeg' };
      });
    }

    const { message, model, context, workspaceRoot, pinnedFiles, modeRules } = req.body as ChatRequest;
    console.log(`[Backend] Received request. Model: ${model}, modeRules length: ${modeRules ? modeRules.length : 'undefined'}`);
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
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let fullContent = '';

      const onToken = (token: string) => {
        fullContent += token;
        try {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        } catch {}
      };

      const onStep = (step: string) => {
        try {
          res.write(`data: ${JSON.stringify({ type: 'step', content: step })}\n\n`);
        } catch {}
      };

      try {
        await generateAIResponseStreaming(
          message,
          history,
          context,
          workspaceRoot,
          model,
          onToken,
          onStep,
          pinnedFilesArray,
          images,
          modeRules
        );

        // Send final signal so the frontend knows streaming is complete
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      } catch (streamError: any) {
        console.error('Streaming error:', streamError);
        res.write(`data: ${JSON.stringify({ type: 'error', content: streamError.message || 'Stream failed' })}\n\n`);
      }

      res.end();
    } else {
      const reply = await generateAIResponse(message, history, context, workspaceRoot, model, undefined, pinnedFilesArray, images, modeRules);
      res.json({ message: reply });
    }

    // Clean up uploaded image files
    for (const file of uploadedFiles) {
      try { fs.unlinkSync(file.path); } catch {}
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
        const deepExplanation = generateDeepExplanation(fileName, language, content, lineCount);
        responseText = formatDeepExplanation(fileName, language, lineCount, deepExplanation);
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