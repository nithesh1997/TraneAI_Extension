import { pipeline } from '@xenova/transformers';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

let sttPipeline: any = null;

/**
 * Transcribes audio file locally using Transformers.js (Whisper)
 */
export async function transcribeAudioLocal(audioPath: string): Promise<string> {
  try {
    const modelName = process.env.LOCAL_WHISPER_MODEL || 'tiny.en';
    const xenovaModel = `Xenova/whisper-${modelName}`;

    if (!sttPipeline) {
      console.log(`Loading local Whisper model (${xenovaModel})...`);
      sttPipeline = await pipeline('automatic-speech-recognition', xenovaModel);
    }

    // 1. Convert audio to 16kHz mono WAV using ffmpeg (transformers.js requirement)
    const tempWavPath = `${audioPath}.temp.wav`;
    await execAsync(`ffmpeg -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWavPath}" -y`);

    // 2. Read the WAV file
    const audioBuffer = fs.readFileSync(tempWavPath);
    
    // 3. Simple WAV decoding (extract PCM data after 44-byte header)
    // For a more robust solution, use a wav decoder library
    const pcmData = new Int16Array(audioBuffer.buffer, 44);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768.0;
    }

    // 4. Transcription
    console.log('Running local transcription...');
    const output = await sttPipeline(float32Data);
    
    // Cleanup
    if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

    return output.text;
  } catch (error: any) {
    console.error('Local transcription error:', error);
    throw new Error(`Local transcription failed: ${error.message}`);
  }
}

/**
 * Synthesizes speech locally using espeak or piper (if available)
 */
export async function synthesizeSpeechLocal(text: string): Promise<Buffer> {
  try {
    const engine = process.env.LOCAL_TTS_ENGINE || 'espeak';
    const tempOutputPath = path.join(process.cwd(), 'uploads', `tts_${Date.now()}.wav`);

    if (engine === 'piper') {
      // Assuming piper is in PATH and a model is available
      // Example call: piper --model voice.onnx --output_file out.wav
      // This part requires a model file to be present.
      throw new Error('Piper local TTS requires a model file. Defaulting to cloud or falling back.');
    } else {
      // Fallback to espeak if available
      await execAsync(`espeak "${text}" -w "${tempOutputPath}"`);
    }

    const buffer = fs.readFileSync(tempOutputPath);
    if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    
    return buffer;
  } catch (error: any) {
    console.error('Local TTS error:', error);
    // If local fails, maybe we should return a clear error or fallback
    throw new Error(`Local TTS failed: ${error.message}`);
  }
}
