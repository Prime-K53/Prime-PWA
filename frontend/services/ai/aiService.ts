import { AIProvider, ChatMessage, ProviderName, AIConfig } from './types';
import { openRouterProvider, parseJSON } from './providers/openrouter';
import { geminiProvider } from './providers/gemini';
import * as P from './prompts';

/* ───────── Provider registry ───────── */

function getProvider(name: ProviderName): AIProvider {
  if (name === 'gemini') return geminiProvider;
  return openRouterProvider;
}

function selectProvider(): AIProvider {
  const name = (
    import.meta.env.VITE_AI_PROVIDER ||
    (process.env as any).VITE_AI_PROVIDER ||
    'openrouter'
  ) as ProviderName;
  return getProvider(name);
}

/* ───────── Helpers ───────── */

function buildImageMessages(imageBase64: string, prompt: string): ChatMessage[] {
  return [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageBase64 } }] }];
}

function buildMultiImageMessages(images: string[], prompt: string): ChatMessage[] {
  const parts: any[] = [{ type: 'text', text: prompt }];
  for (const img of images) parts.push({ type: 'image_url', image_url: { url: img } });
  return [{ role: 'user', content: parts }];
}

/* ───────── Service class ───────── */

class AIService {
  private provider: AIProvider;
  private currentApiKey = '';
  private currentModel = '';
  private currentBaseUrl = '';

  constructor() {
    this.provider = selectProvider();
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem('nexus_company_config');
      if (!raw) return;
      const cfg = JSON.parse(raw)?.aiConfig;
      if (!cfg) return;
      if (cfg.apiKey) this.currentApiKey = cfg.apiKey;
      if (cfg.model) this.currentModel = cfg.model;
      if (cfg.baseUrl) this.currentBaseUrl = cfg.baseUrl;
      if (cfg.provider) {
        const name = cfg.provider as ProviderName;
        this.provider = getProvider(name);
      }
    } catch { /* ignore */ }
  }

  configure(opts: { apiKey?: string; model?: string; baseUrl?: string }) {
    if (opts.apiKey !== undefined) this.currentApiKey = opts.apiKey;
    if (opts.model !== undefined) this.currentModel = opts.model;
    if (opts.baseUrl !== undefined) this.currentBaseUrl = opts.baseUrl;
  }

  setProvider(name: ProviderName) {
    this.provider = getProvider(name);
  }

  private cfg(overrides?: Partial<AIConfig>): AIConfig {
    const { model: overrideModel, ...rest } = overrides || {};
    return {
      apiKey: this.currentApiKey || undefined,
      model: this.currentModel || overrideModel || 'deepseek/deepseek-r1:free',
      baseUrl: this.currentBaseUrl || undefined,
      ...rest,
    };
  }

  /* ───────── System Documentation ───────── */

  async *streamSystemDoc(prompt: string): AsyncGenerator<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.SYSTEM_DOC_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ];
      const stream = this.provider.generateChatStream(messages, this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      for await (const chunk of stream) yield chunk;
    } catch (error: any) {
      console.error('AI Streaming Error:', error);
      yield error?.message?.includes('402') ? 'AI error: Credits needed. Use a free model or add funds.' : 'Error generating stream. Check API key.';
    }
  }

  async generateSystemDoc(prompt: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.SYSTEM_DOC_SYSTEM_INSTRUCTION_SHORT },
        { role: 'user', content: prompt },
      ];
      return await this.provider.generateChat(messages, this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch (error: any) {
      console.error('AI API Error:', error);
      return error?.message?.includes('402') ? 'AI error: Add credits to your OpenRouter account or use a free model.' : 'Error generating documentation.';
    }
  }

  async generateAIResponse(prompt: string, systemInstruction?: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemInstruction || P.AI_ASSISTANT_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ];
      return await this.provider.generateChat(messages, this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch (error: any) {
      console.error('AI API Error:', error);
      const msg = error?.message || '';
      if (msg.includes('402') || msg.includes('Insufficient credits'))
        return 'AI service error: Your OpenRouter account needs credits or use a free model (append :free to model ID, e.g. deepseek/deepseek-r1:free).';
      if (msg.includes('429'))
        return 'AI service is rate-limited. Wait a moment and retry, or switch to a different model.';
      if (msg.includes('401'))
        return 'AI service error: Invalid API key. Check your key in Settings > AI Provider.';
      return `AI error: ${msg.slice(0, 200)}`;
    }
  }

  async extractInvoiceData(imageBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(imageBase64, P.INVOICE_EXTRACTION_PROMPT), this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      return parseJSON(text);
    } catch (error) {
      console.error('OCR Extraction Error:', error);
      return null;
    }
  }

  async extractPaymentProofData(imageBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(imageBase64, P.PAYMENT_PROOF_EXTRACTION_PROMPT), this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      return parseJSON(text);
    } catch (error) {
      console.error('Payment Proof Extraction Error:', error);
      return null;
    }
  }

  async extractDeliveryNoteData(fileBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(fileBase64, P.DELIVERY_NOTE_EXTRACTION_PROMPT), this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      return parseJSON(text);
    } catch (error) {
      console.error('DN Extraction Error:', error);
      return null;
    }
  }

  async performOCR(images: string[], prompt?: string): Promise<string> {
    try {
      return await this.provider.generateChat(buildMultiImageMessages(images, prompt || P.OCR_DEFAULT_PROMPT), this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch (error) {
      console.error('OCR Error:', error);
      return 'Failed to perform OCR.';
    }
  }

  async suggestRestock(inventoryData: any[], salesData: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat([{ role: 'user', content: P.buildRestockPrompt(inventoryData, salesData) }], this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      const result = parseJSON(text);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('Restock Suggestion Error:', error);
      return inventoryData.filter((item: any) => item.stock < 10).map((item: any) => ({
        sku: item.sku || item.id, name: item.name, reason: 'Fallback — low stock', suggestedQty: 50,
      }));
    }
  }

  async suggestProductPricing(productName: string, totalCost: number, category: string, wastePercentage = 0): Promise<any> {
    try {
      const text = await this.provider.generateChat([{ role: 'user', content: P.buildPricingPrompt(productName, totalCost, category, wastePercentage) }], this.cfg({ model: 'deepseek/deepseek-r1:free' }));
      const fb = { suggestedPrice: totalCost * 1.5, margin: 33.3, reasoning: 'Fallback', tiers: { small: totalCost * 1.5, medium: totalCost * 1.4, large: totalCost * 1.3 } };
      const parsed = parseJSON(text);
      return parsed ? { suggestedPrice: parsed.suggestedPrice ?? fb.suggestedPrice, margin: parsed.margin ?? fb.margin, reasoning: parsed.reasoning ?? fb.reasoning, tiers: parsed.tiers ?? fb.tiers } : fb;
    } catch {
      const bp = totalCost * 1.5;
      return { suggestedPrice: bp, margin: 33.3, reasoning: 'Fallback', tiers: { small: bp, medium: bp * 0.95, large: bp * 0.9 } };
    }
  }

  async generateBusinessHealthReport(financeData: any, salesData: any, inventoryData: any): Promise<string> {
    try {
      const snapshot = {
        summary: { totalInvoices: financeData.invoices.length, totalExpenses: financeData.expenses.length, totalCustomers: salesData.customers.length, inventoryItems: inventoryData.inventory.length },
        recentPerformance: { last10Invoices: financeData.invoices.slice(0, 10).map((i: any) => ({ date: i.date, amount: i.totalAmount, status: i.status })), last10Expenses: financeData.expenses.slice(0, 10).map((e: any) => ({ date: e.date, amount: e.amount, category: e.category })) },
        inventoryStatus: inventoryData.inventory.filter((i: any) => i.stock <= i.minStockLevel).slice(0, 10).map((i: any) => ({ name: i.name, stock: i.stock })),
      };
      return await this.provider.generateChat([
        { role: 'system', content: P.BUSINESS_HEALTH_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBusinessHealthPrompt(snapshot) },
      ], this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch {
      return '## Error Generating Report\nUnable to reach AI services.';
    }
  }

  async analyzeForecastingData(type: 'Inventory' | 'CashFlow', data: any): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.FORECASTING_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildForecastingPrompt(type, data) },
      ], this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch { return 'Error analyzing data.'; }
  }

  async analyzeExpenses(expenses: any[]): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.EXPENSE_ANALYSIS_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildExpenseAnalysisPrompt(expenses) },
      ], this.cfg({ model: 'deepseek/deepseek-r1:free' }));
    } catch { return 'Error analyzing expenses.'; }
  }

  async askBusinessQuestion(question: string, context: any): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.BUSINESS_QA_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBusinessQAPrompt(question, context) },
      ], this.cfg());
    } catch { return "Sorry, I'm having trouble."; }
  }

  /* ───────── Dashboard AI Features ───────── */

  async generateDailyBrief(data: {
    revenue: number; revenueTarget: number; unpaidInvoices: number; unpaidTotal: number;
    todaysCollection: number; expensesMonth: number; lowStockItems: number;
    activeJobs: number; customers: number; pendingOrders: number;
  }): Promise<{ bullets: string[] }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildDailyBriefPrompt(data) }], this.cfg()
      );
      const result = JSON.parse(text);
      return { bullets: Array.isArray(result?.bullets) ? result.bullets : [] };
    } catch {
      return { bullets: [] };
    }
  }

  async detectSalesOpportunities(customers: any[], invoices: any[]): Promise<any[]> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildSalesOpportunityPrompt(customers, invoices) }], this.cfg()
      );
      const result = JSON.parse(text);
      return Array.isArray(result) ? result : [];
    } catch { return []; }
  }

  async detectInventoryRisks(items: any[]): Promise<any[]> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildInventoryRiskPrompt(items) }], this.cfg()
      );
      const result = JSON.parse(text);
      return Array.isArray(result) ? result : [];
    } catch { return []; }
  }

  async analyzeCashFlow(data: {
    pendingInvoicesTotal: number; upcomingExpensesTotal: number; currentBalance: number;
    pendingInvoicesCount: number; upcomingExpensesCount: number;
  }): Promise<{ status: string; projectedBalance: number; message: string }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildCashFlowWarningPrompt(data) }], this.cfg()
      );
      return JSON.parse(text);
    } catch {
      return { status: 'cautious', projectedBalance: 0, message: 'Unable to analyze cash flow.' };
    }
  }

  async generateCustomerInsight(customer: any, invoices: any[], payments: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildCustomerInsightPrompt(customer, invoices, payments) }], this.cfg()
      );
      return JSON.parse(text);
    } catch {
      return { reliability: 'medium', totalSpent: 0, averageInvoice: 0, lastOrderDate: '', paymentPunctuality: 'average', insight: 'Data unavailable.' };
    }
  }

  async generateSupplierScorecard(supplier: any, purchases: any[], payments: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildSupplierScorecardPrompt(supplier, purchases, payments) }], this.cfg()
      );
      return JSON.parse(text);
    } catch {
      return { score: 50, reliability: 'average', totalSpend: 0, orderCount: 0, strengths: [], weaknesses: [], recommendation: 'Data unavailable.' };
    }
  }

  async summarizeDocument(docType: string, data: any): Promise<{ summary: string; keyNumbers: string[]; status: string }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildDocumentSummaryPrompt(docType, data) }], this.cfg()
      );
      return JSON.parse(text);
    } catch {
      return { summary: 'Unable to summarize.', keyNumbers: [], status: 'unknown' };
    }
  }
  }

export const aiService = new AIService();
