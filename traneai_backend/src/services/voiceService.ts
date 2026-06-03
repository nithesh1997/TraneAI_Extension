import { OpenAI } from 'openai';
import fs from 'fs';

let openaiInstance: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiInstance) return openaiInstance;

  const apiKey = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenAI API credentials. Please set OPENAI_API_KEY or AZURE_OPENAI_API_KEY in your environment.');
  }

  openaiInstance = new OpenAI({
    apiKey: apiKey,
  });
  
  return openaiInstance;
}

/**
 * Transcribes audio file to text using OpenAI Whisper
 * @param audioPath Path to the audio file
 * @returns Transcribed text
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
    });
    return response.text;
  } catch (error: any) {
    console.error('Transcription error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Synthesizes speech from text using OpenAI TTS
 * @param text Text to synthesize
 * @returns Audio buffer (MP3)
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  try {
    const openai = getOpenAIClient();
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
  } catch (error: any) {
    console.error('TTS error:', error);
    throw new Error(`Speech synthesis failed: ${error.message}`);
  }
}
