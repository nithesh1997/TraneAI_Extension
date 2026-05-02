import { Request, Response } from 'express';
import { Message, ChatRequest, ChatResponse, QuickActionRequest, QuickActionResponse } from '../types/index.js';
import { generateAIResponse } from '../services/aiService.js';
import { generateExplanation, generateReview, generateTests } from '../services/codeAnalysisService.js';

function createMessage(role: 'user' | 'ai', text: string): Message {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role,
    text,
    timestamp: Date.now()
  };
}

export async function handleChatMessage(req: Request, res: Response): Promise<void> {
  try {
    const { message, model, context } = req.body as ChatRequest;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const aiResponse = await generateAIResponse(message, model, context);
    const responseMessage = createMessage('ai', aiResponse);

    const chatResponse: ChatResponse = {
      message: responseMessage
    };

    res.json(chatResponse);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
}

export async function handleQuickAction(req: Request, res: Response): Promise<void> {
  try {
    const { action, fileName, language, content, lineCount } = req.body as QuickActionRequest;

    if (!action || !fileName || !language || !content) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    let responseText: string;
    let codeBlock: string | undefined;
    let codeLanguage: string | undefined;

    switch (action) {
      case 'explain':
        responseText = generateExplanation(fileName, language, content, lineCount);
        break;
      case 'review':
        responseText = generateReview(fileName, language, content, lineCount);
        break;
      case 'tests':
        const result = generateTests(fileName, language, content, lineCount);
        responseText = result.text;
        codeBlock = result.code;
        codeLanguage = result.language;
        break;
      default:
        res.status(400).json({ error: 'Invalid action' });
        return;
    }

    const responseMessage = createMessage('ai', responseText);

    const quickActionResponse: QuickActionResponse = {
      message: responseMessage,
      codeBlock,
      language: codeLanguage
    };

    res.json(quickActionResponse);
  } catch (error) {
    console.error('Quick action error:', error);
    res.status(500).json({ error: 'Failed to process quick action' });
  }
}