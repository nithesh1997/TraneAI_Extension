import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/finsurge.local/godwinjoseph.devabal/Documents/Trane AI New/TraneAI_Extension/traneai_backend/.env' });

async function test() {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  try {
    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello, reply with YES" },
            { 
              type: "input_audio", 
              input_audio: {
                data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                format: "wav"
              }
            } as any
          ]
        }
      ]
    });
    console.log("Success:", response.choices[0].message.content);
  } catch (e: any) {
    console.error("Failed:", e.message);
  }
}
test();
