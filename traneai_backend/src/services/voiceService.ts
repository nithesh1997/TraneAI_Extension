import { OpenAI, AzureOpenAI } from 'openai';
import fs from 'fs';
import { transcribeAudioLocal, synthesizeSpeechLocal } from './localVoiceService';

let openaiInstance: OpenAI | AzureOpenAI | null = null;

function getOpenAIClient(): OpenAI | AzureOpenAI {
  if (openaiInstance) return openaiInstance;

  const isAzure = !!process.env.AZURE_OPENAI_API_KEY;
  
  if (isAzure) {
    openaiInstance = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: '2024-02-15-preview',
    });
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OpenAI API credentials. Please set OPENAI_API_KEY or AZURE_OPENAI_API_KEY in your environment.');
    }
    openaiInstance = new OpenAI({
      apiKey: apiKey,
    });
  }
  
  return openaiInstance;
}

/**
 * Transcribes audio file to text using OpenAI Whisper
 * @param audioPath Path to the audio file
 * @returns Transcribed text
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  const mode = (process.env.VOICE_MODE || 'cloud').trim().toLowerCase();
  console.log(`[voiceService] Current Voice Mode: ${mode}`);

  // Check for local mode
  if (mode === 'local') {
    return transcribeAudioLocal(audioPath);
  }

  try {
    const isAzure = !!process.env.AZURE_OPENAI_API_KEY;
    let openai;
    
    if (isAzure) {
      // For Azure, it's often safer to create a client specific to the deployment
      // if common clients are experiencing deployment name leakage.
      const whisperDep = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || 'whisper';
      const transcribe = async (name: string) => {
        const client = new AzureOpenAI({
          apiKey: process.env.AZURE_OPENAI_API_KEY, endpoint: process.env.AZURE_OPENAI_ENDPOINT,
          deployment: name, apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        });
        return await client.audio.transcriptions.create({ file: fs.createReadStream(audioPath), model: name });
      };
      try {
        const response = await transcribe(whisperDep);
        return response.text;
      } catch (e: any) {
        if (e.status === 404) {
          const fallback = whisperDep === 'whisper' ? 'whisper-1' : 'whisper';
          try {
            const resp = await transcribe(fallback);
            return resp.text;
          } catch (e2) { throw e; }
        }
        throw e;
      }
    } else {
      openai = getOpenAIClient();
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
      });
      return response.text;
    }
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
  // Check for local mode
  if (process.env.VOICE_MODE === 'local') {
    return synthesizeSpeechLocal(text);
  }

  try {
    const isAzure = !!process.env.AZURE_OPENAI_API_KEY;
    let openai;
    
    if (isAzure) {
      openai = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_TTS_DEPLOYMENT || 'tts',
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
      });

      const mp3 = await openai.audio.speech.create({
        model: '', // On Azure wi th specific deployment in constructor, model can be empty
        voice: 'alloy',
        input: text,
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    } else {
      openai = getOpenAIClient();
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    }
  } catch (error: any) {
    console.error('TTS error:', error);
    throw new Error(`Speech synthesis failed: ${error.message}`);
  }
}
