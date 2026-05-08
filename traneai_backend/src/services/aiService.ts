import { AzureOpenAI } from 'openai';

export async function generateAIResponse(
  message: string,
  context?: any
): Promise<string> {

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      { role: 'system', content: 'You are TraneAI assistant.' },
      { role: 'user', content: message }
    ],
  });

  return response.choices[0]?.message?.content || 'No response';
}

export async function generateVisionResponse(
  message: string,
  images: { base64: string; mimeType: string }[]
): Promise<string> {

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-02-15-preview',
  });

  const imageContent = images.map(img => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }));

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: message },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content || 'No vision response';
}
