import { Request, Response } from 'express';
import fs from 'fs';
import { transcribeAudio, synthesizeSpeech } from '../services/voiceService.js';

/**
 * Handles audio transcription request
 */
export async function handleTranscribe(req: Request, res: Response): Promise<void> {
  console.log('Received transcription request');
  try {
    const file = req.file;
    if (!file) {
      console.error('No file received in transcription request');
      res.status(400).json({ error: 'Audio file is required' });
      return;
    }

    console.log('Transcribing file:', file.path, 'size:', file.size);
    const text = await transcribeAudio(file.path);
    console.log('Transcription successful:', text);
    
    // Clean up uploaded file
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error('Failed to delete temp audio file:', e);
    }
    
    res.json({ text });
  } catch (error: any) {
    console.error('Voice transcription error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handles text-to-speech request
 */
export async function handleTTS(req: Request, res: Response): Promise<void> {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const buffer = await synthesizeSpeech(text);
    
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error: any) {
    console.error('Voice TTS error:', error);
    res.status(500).json({ error: error.message });
  }
}
