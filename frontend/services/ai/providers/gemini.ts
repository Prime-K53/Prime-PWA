import { GoogleGenAI } from '@google/genai';
import { AIProvider, ChatMessage, AIConfig } from '../types';

function resolveApiKey(config?: AIConfig): string {
  const fromConfig = config?.apiKey;
  if (fromConfig && fromConfig !== 'PLACEHOLDER_API_KEY') return fromConfig;

  const fromEnv =
    import.meta.env.VITE_GEMINI_API_KEY ||
    (process.env as any).VITE_GEMINI_API_KEY;
  return fromEnv || '';
}

const getMimeType = (base64String: string, defaultType = 'image/jpeg'): string => {
  if (base64String.startsWith('data:')) {
    const match = base64String.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/,
    );
    if (match) return match[1];
  }
  if (base64String.startsWith('/9j/')) return 'image/jpeg';
  if (base64String.startsWith('iVBORw0KGgo')) return 'image/png';
  return defaultType;
};

const getCleanBase64 = (base64String: string): string =>
  base64String.includes('base64,')
    ? base64String.split('base64,')[1]
    : base64String;

function toGeminiContents(messages: ChatMessage[]): {
  contents: any[];
  systemInstruction?: string;
} {
  const contents: any[] = [];
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      const parts = typeof msg.content === 'string' ? [msg.content] : msg.content.map((p) => ('text' in p ? p.text : ''));
      systemInstruction = parts.filter(Boolean).join('\n');
      continue;
    }

    const parts: any[] = [];
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else {
      for (const part of msg.content) {
        if (part.type === 'text') {
          parts.push({ text: part.text || '' });
        } else if (part.type === 'image_url') {
          const url = part.image_url?.url || '';
          if (url.startsWith('data:')) {
            parts.push({
              inlineData: { data: getCleanBase64(url), mimeType: getMimeType(url) },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  return { contents, systemInstruction };
}

function getResponseText(response: any): string {
  const t = response?.text;
  if (typeof t === 'string') return t;
  if (typeof t === 'function') return t() || '';
  const legacy = response?.response?.text;
  if (typeof legacy === 'function') return legacy() || '';
  if (typeof legacy === 'string') return legacy;
  return '';
}

export const geminiProvider: AIProvider = {
  async generateChat(messages, config) {
    const apiKey = resolveApiKey(config);
    if (!apiKey) throw new Error('Gemini API key not configured');

    const genAI = new GoogleGenAI({ apiKey });
    const { contents, systemInstruction } = toGeminiContents(messages);

    const response: any = await genAI.models.generateContent({
      model: config?.model || 'gemini-1.5-flash',
      contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: '' }] }],
      config: {
        systemInstruction:
          config?.systemInstruction || systemInstruction,
        maxOutputTokens: config?.maxTokens,
        temperature: config?.temperature,
      },
    });

    return getResponseText(response) || '';
  },

  async *generateChatStream(messages, config) {
    const apiKey = resolveApiKey(config);
    if (!apiKey) throw new Error('Gemini API key not configured');

    const genAI = new GoogleGenAI({ apiKey });
    const { contents, systemInstruction } = toGeminiContents(messages);

    const result: any = await genAI.models.generateContentStream({
      model: config?.model || 'gemini-1.5-pro',
      contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: '' }] }],
      config: {
        systemInstruction:
          config?.systemInstruction || systemInstruction,
        maxOutputTokens: config?.maxTokens,
        temperature: config?.temperature,
      },
    });

    const stream: any = result?.stream ?? result;
    for await (const chunk of stream) {
      const chunkText =
        typeof chunk?.text === 'function' ? chunk.text() : chunk?.text ?? '';
      if (chunkText) yield chunkText;
    }
  },
};
