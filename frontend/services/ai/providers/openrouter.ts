import { AIProvider, ChatMessage, AIConfig } from '../types';

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

function resolveBaseUrl(config?: AIConfig): string {
  return config?.baseUrl || import.meta.env.VITE_OPENROUTER_BASE_URL || DEFAULT_BASE;
}

function resolveApiKey(config?: AIConfig): string {
  const fromConfig = config?.apiKey;
  if (fromConfig && fromConfig !== 'PLACEHOLDER_API_KEY') return fromConfig;

  const fromEnv =
    import.meta.env.VITE_OPENROUTER_API_KEY ||
    (process.env as any).VITE_OPENROUTER_API_KEY;
  if (fromEnv && fromEnv !== 'PLACEHOLDER_API_KEY') return fromEnv;

  return '';
}

function resolveModel(config?: AIConfig): string {
  return (
    config?.model ||
    import.meta.env.VITE_OPENROUTER_MODEL ||
    (process.env as any).VITE_OPENROUTER_MODEL ||
    'deepseek/deepseek-r1:free'
  );
}

function normalizeMessages(messages: ChatMessage[]) {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const other = messages.filter((m) => m.role !== 'system');

  const system = systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n');

  const normalized = other.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : m.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            }
            return { type: 'image_url', image_url: { url: part.image_url.url } };
          }),
  }));

  return { system, messages: normalized };
}

function buildRequestBody(messages: ChatMessage[], config?: AIConfig) {
  const { system, messages: normalized } = normalizeMessages(messages);
  return {
    model: resolveModel(config),
    messages: normalized,
    max_tokens: config?.maxTokens ?? 4096,
    temperature: config?.temperature ?? 0.7,
    ...(system ? { system } : {}),
  };
}

async function openRouterFetch(
  body: unknown,
  config?: AIConfig,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = resolveBaseUrl(config);
  const apiKey = resolveApiKey(config);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Prime ERP';
  }
  return fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
}

function parseJSON(fromText: string): any {
  const jsonMatch = fromText.match(/\{[\s\S]*\}/) || fromText.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

function extractContent(choice: any): string {
  const content = choice?.message?.content || choice?.delta?.content || '';
  return typeof content === 'string' ? content : '';
}

export const openRouterProvider: AIProvider = {
  async generateChat(messages, config) {
    const body = buildRequestBody(messages, config);
    const res = await openRouterFetch(body, config);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return extractContent(data.choices?.[0]) || '';
  },

  async *generateChatStream(messages, config) {
    const body = { ...buildRequestBody(messages, config), stream: true };
    const res = await openRouterFetch(body, config);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stream error ${res.status}: ${err}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield '';
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;
          try {
            const parsed = JSON.parse(payload);
            const content = extractContent(parsed.choices?.[0]);
            if (content) yield content;
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

export { parseJSON };
