/**
 * AI Service — Backward-Compatible Facade
 *
 * All exports match the original Gemini-only service so consuming components
 * work without changes. Under the hood it delegates to the provider-agnostic
 * AI service layer.
 *
 * Providers: openrouter (default), ollama, openai, zai, opencode, gemini, custom
 */

import { aiService } from './ai/aiService';
import type { ProviderName } from './ai/types';

export function setAIProvider(name: ProviderName) {
  aiService.setProvider(name);
}

export function configureAI(config: { apiKey?: string; model?: string; baseUrl?: string }) {
  aiService.configure(config);
}

/* ───────── Provider presets ───────── */

export interface ProviderOption {
  value: ProviderName;
  label: string;
  desc: string;
  defaultBaseUrl: string;
  needsApiKey: boolean;
}

export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  { value: 'openrouter', label: 'OpenRouter', desc: 'Routes to 300+ models — paid & free', defaultBaseUrl: 'https://openrouter.ai/api/v1', needsApiKey: true },
  { value: 'openai', label: 'OpenAI', desc: 'Direct OpenAI API (GPT-4o, o3, etc.)', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true },
  { value: 'ollama', label: 'Ollama', desc: 'Local LLMs (Llama, Mistral, Qwen, etc.)', defaultBaseUrl: 'http://localhost:11434/v1', needsApiKey: false },
  { value: 'zai', label: 'Z.AI', desc: 'Z.AI API (includes free GLM models)', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', needsApiKey: true },
  { value: 'opencode', label: 'Opencode', desc: 'Opencode AI service', defaultBaseUrl: 'https://api.opencode.ai/v1', needsApiKey: true },
  { value: 'gemini', label: 'Google Gemini', desc: 'Google Gemini native API', defaultBaseUrl: '', needsApiKey: true },
  { value: 'custom', label: 'Custom', desc: 'Any OpenAI-compatible API endpoint', defaultBaseUrl: 'https://', needsApiKey: false },
];

/* ───────── Live model fetching ───────── */

export interface ModelEntry {
  value: string;
  label: string;
  tier: 'paid' | 'free' | 'local';
}

export async function fetchModels(provider: ProviderName, baseUrl: string, apiKey?: string): Promise<ModelEntry[]> {
  const staticList = STATIC_MODELS[provider] || [];

  try {
    if (provider === 'ollama') {
      const ollamaBase = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
      const res = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return (data.models || []).map((m: any) => ({
          value: m.name,
          label: m.name + (m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''),
          tier: 'local' as const,
        }));
      }
      return staticList;
    }

    if (provider === 'gemini') {
      return [
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', tier: 'paid' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'paid' },
        { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)', tier: 'free' },
        { value: 'gemini-2.0-pro-exp-02-05', label: 'Gemini 2.0 Pro (Exp)', tier: 'free' },
      ];
    }

    if (provider === 'custom') return staticList;

    // OpenAI-compatible models endpoint
    const base = baseUrl.replace(/\/+$/, '');
    const modelsUrl = `${base}/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return staticList;
    const data = await res.json();
    const list: any[] = data?.data || data?.models || [];
    if (list.length === 0) return staticList;

    const live = list.map((m: any) => {
      const id = m.id || m.name || '';
      const pricing = m.pricing || {};
      const isFree = pricing.prompt === 0 || pricing.prompt === '0';
      return { value: id, label: m.name || m.id || '', tier: isFree ? 'free' as const : 'paid' as const };
    }).filter((m: ModelEntry) => m.value);

    // Merge: live models take priority, append any static models not in the live list
    const liveIds = new Set(live.map(m => m.value));
    return [...live, ...staticList.filter(m => !liveIds.has(m.value))];
  } catch {
    return staticList.length > 0 ? staticList : [];
  }
}

/* ───────── Static model lists (fallback) ───────── */

const STATIC_MODELS: Record<string, ModelEntry[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', tier: 'paid' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'paid' },
    { value: 'gpt-4o-audio-preview', label: 'GPT-4o Audio', tier: 'paid' },
    { value: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime', tier: 'paid' },
    { value: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime', tier: 'paid' },
    { value: 'gpt-4.1', label: 'GPT-4.1', tier: 'paid' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'paid' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', tier: 'paid' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'paid' },
    { value: 'gpt-4', label: 'GPT-4', tier: 'paid' },
    { value: 'o3-mini', label: 'o3 Mini', tier: 'paid' },
    { value: 'o3', label: 'o3', tier: 'paid' },
    { value: 'o1', label: 'o1', tier: 'paid' },
    { value: 'o1-mini', label: 'o1 Mini', tier: 'paid' },
    { value: 'o1-pro', label: 'o1 Pro', tier: 'paid' },
  ],
  zai: [
    { value: 'glm-4-plus', label: 'GLM-4-Plus', tier: 'paid' },
    { value: 'glm-4-air', label: 'GLM-4-Air', tier: 'free' },
    { value: 'glm-4-airx', label: 'GLM-4-AirX', tier: 'free' },
    { value: 'glm-4-flash', label: 'GLM-4-Flash', tier: 'free' },
    { value: 'glm-4-flashx', label: 'GLM-4-FlashX', tier: 'free' },
    { value: 'glm-4-long', label: 'GLM-4-Long', tier: 'paid' },
    { value: 'glm-4', label: 'GLM-4', tier: 'paid' },
    { value: 'glm-4v-plus', label: 'GLM-4V-Plus (vision)', tier: 'paid' },
    { value: 'glm-4v', label: 'GLM-4V (vision)', tier: 'paid' },
    { value: 'cogview-3-plus', label: 'CogView-3-Plus (image gen)', tier: 'paid' },
  ],
  opencode: [
    { value: 'opencode-default', label: 'Opencode Default (Cloud)', tier: 'paid' },
    { value: 'opencode-fast', label: 'Opencode Fast (Cloud)', tier: 'free' },
    { value: 'local-opencode', label: 'Local Opencode Server', tier: 'local' },
  ],
  openrouter: [
    { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o', tier: 'paid' },
    { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini', tier: 'paid' },
    { value: 'openai/o3-mini', label: 'OpenAI o3 Mini', tier: 'paid' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'paid' },
    { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', tier: 'paid' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', tier: 'paid' },
    { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (Free)', tier: 'free' },
    { value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3 (Free)', tier: 'free' },
    { value: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick (Free)', tier: 'free' },
    { value: 'meta-llama/llama-4-scout:free', label: 'Llama 4 Scout (Free)', tier: 'free' },
    { value: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B (Free)', tier: 'free' },
    { value: 'x-ai/grok-3-mini-beta:free', label: 'Grok 3 Mini (Free)', tier: 'free' },
    { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (Free)', tier: 'free' },
    { value: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 (Free)', tier: 'free' },
  ],
  ollama: [
    { value: 'llama3.2', label: 'Llama 3.2', tier: 'local' },
    { value: 'llama3.1', label: 'Llama 3.1', tier: 'local' },
    { value: 'llama3', label: 'Llama 3', tier: 'local' },
    { value: 'mistral', label: 'Mistral', tier: 'local' },
    { value: 'mixtral', label: 'Mixtral', tier: 'local' },
    { value: 'qwen2.5', label: 'Qwen 2.5', tier: 'local' },
    { value: 'qwen2', label: 'Qwen 2', tier: 'local' },
    { value: 'deepseek-r1', label: 'DeepSeek R1', tier: 'local' },
    { value: 'codellama', label: 'Code Llama', tier: 'local' },
    { value: 'gemma2', label: 'Gemma 2', tier: 'local' },
    { value: 'phi3', label: 'Phi-3', tier: 'local' },
    { value: 'nemotron-mini', label: 'Nemotron Mini', tier: 'local' },
  ],
};

/* ───────── Local Opencode server detection ───────── */

export async function detectLocalOpencodeServer(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:4096/global/health', {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLocalOpencodeModels(): Promise<ModelEntry[]> {
  try {
    const res = await fetch('http://localhost:4096/project/current', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models: string[] = data?.models || data?.config?.models || [];
    return models.map(m => ({ value: m, label: m, tier: 'local' as const }));
  } catch {
    return [];
  }
}

export const FALLBACK_OPENROUTER_MODELS: ModelEntry[] = [
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o', tier: 'paid' },
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini', tier: 'paid' },
  { value: 'openai/o3-mini', label: 'OpenAI o3 Mini', tier: 'paid' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'paid' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', tier: 'paid' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', tier: 'paid' },
  { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (Free)', tier: 'free' },
  { value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3 (Free)', tier: 'free' },
  { value: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick 1M ctx (Free)', tier: 'free' },
  { value: 'meta-llama/llama-4-scout:free', label: 'Llama 4 Scout (Free)', tier: 'free' },
  { value: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B (Free)', tier: 'free' },
  { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Free)', tier: 'free' },
  { value: 'x-ai/grok-3-mini-beta:free', label: 'Grok 3 Mini (Free)', tier: 'free' },
  { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (Free)', tier: 'free' },
  { value: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 24B (Free)', tier: 'free' },
];

export function getCurrentProvider(): ProviderName {
  return (
    (import.meta.env.VITE_AI_PROVIDER as ProviderName) ||
    (process.env as any).VITE_AI_PROVIDER ||
    'openrouter'
  );
}

/* ───────── Exported functions (backward-compatible) ───────── */

export async function* streamSystemDoc(prompt: string) {
  yield* aiService.streamSystemDoc(prompt);
}

export async function generateSystemDoc(prompt: string): Promise<string> {
  return aiService.generateSystemDoc(prompt);
}

export async function generateAIResponse(prompt: string, systemInstruction?: string): Promise<string> {
  return aiService.generateAIResponse(prompt, systemInstruction);
}

export async function extractInvoiceData(imageBase64: string): Promise<any> {
  return aiService.extractInvoiceData(imageBase64);
}

export async function extractPaymentProofData(imageBase64: string): Promise<any> {
  return aiService.extractPaymentProofData(imageBase64);
}

export async function extractDeliveryNoteData(fileBase64: string): Promise<any> {
  return aiService.extractDeliveryNoteData(fileBase64);
}

export async function performOCR(images: string[], prompt?: string): Promise<string> {
  return aiService.performOCR(images, prompt);
}

export async function suggestRestock(inventoryData: any[], salesData: any[]): Promise<any> {
  return aiService.suggestRestock(inventoryData, salesData);
}

export async function suggestProductPricing(
  productName: string, totalCost: number, category: string, wastePercentage: number = 0,
): Promise<{ suggestedPrice: number; margin: number; reasoning: string; tiers: { small: number; medium: number; large: number } }> {
  return aiService.suggestProductPricing(productName, totalCost, category, wastePercentage);
}

export async function generateBusinessHealthReport(
  financeData: { invoices: any[]; expenses: any[]; income: any[]; accounts: any[] },
  salesData: { sales: any[]; customers: any[] },
  inventoryData: { inventory: any[] },
): Promise<string> {
  return aiService.generateBusinessHealthReport(financeData, salesData, inventoryData);
}

export async function analyzeForecastingData(type: 'Inventory' | 'CashFlow', data: any): Promise<string> {
  return aiService.analyzeForecastingData(type, data);
}

export async function analyzeExpenses(expenses: any[]): Promise<string> {
  return aiService.analyzeExpenses(expenses);
}

export async function askBusinessQuestion(question: string, context: any): Promise<string> {
  return aiService.askBusinessQuestion(question, context);
}

/* ───────── Dashboard AI Features ───────── */

export async function generateDailyBrief(data: Parameters<typeof aiService.generateDailyBrief>[0]) {
  return aiService.generateDailyBrief(data);
}

export async function detectSalesOpportunities(customers: any[], invoices: any[]) {
  return aiService.detectSalesOpportunities(customers, invoices);
}

export async function detectInventoryRisks(items: any[]) {
  return aiService.detectInventoryRisks(items);
}

export async function analyzeCashFlow(data: Parameters<typeof aiService.analyzeCashFlow>[0]) {
  return aiService.analyzeCashFlow(data);
}

export async function generateCustomerInsight(customer: any, invoices: any[], payments: any[]) {
  return aiService.generateCustomerInsight(customer, invoices, payments);
}

export async function generateSupplierScorecard(supplier: any, purchases: any[], payments: any[]) {
  return aiService.generateSupplierScorecard(supplier, purchases, payments);
}

export async function summarizeDocument(docType: string, data: any) {
  return aiService.summarizeDocument(docType, data);
}
