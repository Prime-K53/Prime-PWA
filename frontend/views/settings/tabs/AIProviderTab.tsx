import React, { useState, useEffect } from 'react';
import { Sparkles, Key, Cpu, Network, CheckCircle2, XCircle, Loader2, Eye, EyeOff, ExternalLink, Info, RefreshCw, Globe, PenLine, Monitor } from 'lucide-react';
import type { CompanyConfig } from '../../../types';
import type { ProviderName } from '../../../services/ai/types';
import { AI_PROVIDER_OPTIONS, fetchModels, setAIProvider, configureAI, type ModelEntry, type ProviderOption, detectLocalOpencodeServer, fetchLocalOpencodeModels } from '../../../services/geminiService';
import { openRouterProvider } from '../../../services/ai/providers/openrouter';
import { geminiProvider } from '../../../services/ai/providers/gemini';
import type { ChatMessage, AIProvider } from '../../../services/ai/types';

interface AIProviderTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify?: (msg: string, type: string) => void;
}

const testConnection = async (
  providerName: ProviderName, baseUrl: string, apiKey: string, model: string,
): Promise<{ ok: boolean; message: string }> => {
  const p: AIProvider = providerName === 'gemini' ? geminiProvider : openRouterProvider;
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Reply with exactly: OK' },
    { role: 'user', content: 'Confirm connection' },
  ];
  try {
    const result = await p.generateChat(messages, { apiKey, model, baseUrl: providerName === 'gemini' ? undefined : baseUrl });
    const trimmed = result.trim().toUpperCase();
    if (trimmed === 'OK' || trimmed.startsWith('OK')) return { ok: true, message: `Connected using ${model}` };
    return { ok: true, message: `Response: "${result.slice(0, 60)}..."` };
  } catch (err: any) {
    const msg = err?.message || 'Connection failed';
    if (msg.includes('400') || msg.includes('not a valid model')) return { ok: false, message: `Invalid model ID. Check the exact name at the provider's docs` };
    if (msg.includes('429')) return { ok: false, message: `Rate limited. Retry later or use a different model.` };
    return { ok: false, message: msg };
  }
};

export const AIProviderTab: React.FC<AIProviderTabProps> = ({ config, setConfig, notify }) => {
  const saved = config.aiConfig || {
    provider: 'openrouter' as ProviderName, baseUrl: '', apiKey: '', model: '',
    openrouterApiKey: '', openrouterModel: 'openai/gpt-4o',
    geminiApiKey: '', geminiModel: 'gemini-1.5-flash', customEndpoint: '',
  };

  const providerOpt: ProviderOption = AI_PROVIDER_OPTIONS.find(o => o.value === (saved.provider || 'openrouter')) || AI_PROVIDER_OPTIONS[0];

  const [provider, setProvider] = useState<ProviderName>(saved.provider || 'openrouter');
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl || providerOpt.defaultBaseUrl);
  const [apiKey, setApiKey] = useState(saved.apiKey || '');
  const [model, setModel] = useState(saved.model || '');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fetchedModels, setFetchedModels] = useState<ModelEntry[]>([]);
  const [fetching, setFetching] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [localServerDetected, setLocalServerDetected] = useState(false);
  const [localServerChecking, setLocalServerChecking] = useState(false);
  const [useLocalServer, setUseLocalServer] = useState(false);
  const [localModels, setLocalModels] = useState<ModelEntry[]>([]);

  const currentOpt = AI_PROVIDER_OPTIONS.find(o => o.value === provider) || AI_PROVIDER_OPTIONS[0];

  // When provider changes, update the baseUrl
  useEffect(() => {
    const opt = AI_PROVIDER_OPTIONS.find(o => o.value === provider);
    if (opt) {
      setBaseUrl(opt.defaultBaseUrl);
      setFetchedModels([]);
      setModel('');
      setModelInput('');
      setTestResult(null);
      setLocalServerDetected(false);
      setUseLocalServer(false);
      setLocalModels([]);
    }
  }, [provider]);

  // Auto-detect local opencode server
  useEffect(() => {
    if (provider !== 'opencode') return;
    let cancelled = false;
    (async () => {
      setLocalServerChecking(true);
      const detected = await detectLocalOpencodeServer();
      if (cancelled) return;
      setLocalServerDetected(detected);
      if (detected) {
        const models = await fetchLocalOpencodeModels();
        if (!cancelled) setLocalModels(models);
      }
      setLocalServerChecking(false);
    })();
    return () => { cancelled = true; };
  }, [provider]);

  // Populate model input from fetched list or saved model
  useEffect(() => {
    if (model && modelInput !== model) setModelInput(model);
  }, [model]);

  const handleFetchModels = async () => {
    setFetching(true);
    setTestResult(null);
    const models = await fetchModels(provider, baseUrl, apiKey || undefined);
    // Merge local models for opencode
    if (provider === 'opencode') {
      const local = useLocalServer ? models : await fetchLocalOpencodeModels();
      setFetchedModels([...local, ...models]);
    } else {
      setFetchedModels(models);
    }
    setFetching(false);
    if (models.length === 0) {
      setTestResult({ ok: false, message: 'No models returned — enter the model name manually' });
    }
  };

  const handleSave = () => {
    const finalModel = modelInput || model;
    const resolvedBaseUrl = useLocalServer ? 'http://localhost:4096/v1' : baseUrl;
    const newAiConfig = {
      ...saved,
      provider,
      baseUrl: resolvedBaseUrl,
      apiKey,
      model: finalModel,
      openrouterApiKey: apiKey,
      openrouterModel: finalModel,
      geminiApiKey: apiKey,
      geminiModel: finalModel,
    };
    setConfig({ ...config, aiConfig: newAiConfig });
    // Persist to localStorage so aiService.loadFromStorage() finds it on reload
    try {
      const raw = localStorage.getItem('nexus_company_config');
      if (raw) {
        const existing = JSON.parse(raw);
        existing.aiConfig = newAiConfig;
        localStorage.setItem('nexus_company_config', JSON.stringify(existing));
      }
    } catch { /* best-effort */ }
    // Apply to runtime
    setAIProvider(provider);
    configureAI({ apiKey, model: finalModel, baseUrl: provider === 'gemini' ? undefined : resolvedBaseUrl });
    notify?.('AI provider configuration saved', 'success');
  };

  const handleTest = async () => {
    const finalModel = modelInput || model;
    if (!finalModel) { setTestResult({ ok: false, message: 'Enter or fetch a model first' }); return; }
    const resolvedBaseUrl = useLocalServer ? 'http://localhost:4096/v1' : baseUrl;
    setTesting(true);
    setTestResult(null);
    // Apply to runtime so AI features work immediately after testing
    setAIProvider(provider);
    configureAI({ apiKey, model: finalModel, baseUrl: provider === 'gemini' ? undefined : resolvedBaseUrl });
    const result = await testConnection(provider, resolvedBaseUrl, apiKey, finalModel);
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      {/* Provider */}
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Cpu size={18} className="text-indigo-600" /> AI Provider
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 shadow-sm">
          <div className="group/field">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Provider</label>
            <select
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all appearance-none"
              value={provider}
              onChange={e => setProvider(e.target.value as ProviderName)}
            >
              {AI_PROVIDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
              ))}
            </select>
          </div>

          {/* Local opencode server detection */}
          {provider === 'opencode' && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Monitor size={16} className={localServerDetected ? 'text-emerald-500' : 'text-slate-400'} />
                  <span className="text-[11px] font-bold text-slate-500">Local Opencode Server</span>
                  {localServerChecking && <Loader2 size={14} className="animate-spin text-slate-400" />}
                  {!localServerChecking && localServerDetected && (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-200">
                      Detected
                    </span>
                  )}
                  {!localServerChecking && !localServerDetected && (
                    <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-bold">
                      Not found
                    </span>
                  )}
                </div>
                {localServerDetected && (
                  <button
                    onClick={() => {
                      setUseLocalServer(!useLocalServer);
                      setTestResult(null);
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                      useLocalServer
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {useLocalServer ? 'Using local' : 'Use local'}
                  </button>
                )}
              </div>
              {localServerDetected && localModels.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-2 px-1">
                  {localModels.length} model{localModels.length > 1 ? 's' : ''} available locally
                </p>
              )}
              {!localServerChecking && !localServerDetected && (
                <p className="text-[10px] text-slate-400 mt-2 px-1">
                  Run <code className="bg-slate-100 px-1 rounded">opencode serve</code> to use your local server.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Credentials */}
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Key size={18} className="text-amber-600" /> Endpoint & Credentials
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm">
          {/* Base URL */}
          <div className="group/field">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-indigo-600 transition-colors">
              API Base URL
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Globe size={16} /></div>
              <input
                type="text"
                className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all group-hover/field:border-indigo-200"
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); setTestResult(null); }}
                placeholder={currentOpt.defaultBaseUrl}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 px-1 italic">The base URL before <code className="bg-slate-100 px-1 rounded">/chat/completions</code>. Pre-filled for the selected provider.</p>
          </div>

          {/* API Key */}
          {currentOpt.needsApiKey && (
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-indigo-600 transition-colors">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all pr-14 group-hover/field:border-indigo-200"
                  placeholder={provider === 'openrouter' ? 'sk-or-...' : provider === 'openai' ? 'sk-...' : 'Enter API key'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {!currentOpt.needsApiKey && (
            <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 text-[11px] text-sky-700 font-medium">
              No API key needed for {currentOpt.label} — connects to your local service.
            </div>
          )}
        </div>
      </section>

      {/* Model */}
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Sparkles size={18} className="text-purple-600" /> Model
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 shadow-sm">
          {/* Fetch button */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={handleFetchModels}
              disabled={fetching}
              className="px-6 py-3 bg-purple-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-700 transition-all disabled:opacity-40 flex items-center gap-2 active:scale-95 shadow-lg shadow-purple-600/20"
            >
              <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
              {fetching ? 'Fetching...' : 'Fetch live models'}
            </button>
            {fetchedModels.length > 0 && (
              <span className="text-[10px] text-slate-500 font-bold">{fetchedModels.length} models available</span>
            )}
          </div>

          {/* Model dropdown from fetched list */}
          {fetchedModels.length > 0 && (
            <div className="group/field mb-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Select a model</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-purple-500/5 focus:border-purple-500 transition-all appearance-none"
                value={modelInput}
                onChange={e => { setModelInput(e.target.value); setModel(e.target.value); setTestResult(null); }}
              >
                <option value="">— Pick a model —</option>
                {fetchedModels.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.tier === 'free' ? '🆓 ' : m.tier === 'local' ? '💻 ' : '💳 '}{m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual entry — always shown */}
          <div className="group/field">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
              {fetchedModels.length > 0 ? 'Or type a model name' : 'Enter model name'}
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400"><PenLine size={16} /></div>
              <input
                type="text"
                className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-purple-500/5 focus:border-purple-500 transition-all"
                placeholder={provider === 'ollama' ? 'llama3.2' : provider === 'openrouter' ? 'openai/gpt-4o' : provider === 'openai' ? 'gpt-4o' : 'model-name'}
                value={modelInput}
                onChange={e => { setModelInput(e.target.value); setModel(e.target.value); setTestResult(null); }}
              />
            </div>
            {fetchedModels.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-2 px-1 italic">
                Click "Fetch live models" to load from the provider, or type any model name manually.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Test & Save */}
      <section>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 shadow-sm">
          <div className="flex items-center gap-6">
            <button
              onClick={handleTest}
              disabled={testing || !modelInput}
              className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3 active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Network size={16} />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              onClick={handleSave}
              className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-3 active:scale-95 shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 size={16} /> Save Configuration
            </button>

            {testResult && (
              <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-xs ${
                testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span className="max-w-[300px] truncate">{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Info */}
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Info size={18} className="text-sky-600" /> Provider Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {AI_PROVIDER_OPTIONS.map(opt => (
            <div key={opt.value} className={`p-5 rounded-2xl border transition-all ${provider === opt.value ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-white'}`}>
              <h4 className="font-black text-slate-800 text-sm mb-1">{opt.label}</h4>
              <p className="text-[11px] text-slate-500 mb-2">{opt.desc}</p>
              <code className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600">{opt.defaultBaseUrl}/chat/completions</code>
              {opt.needsApiKey && <span className="text-[10px] text-amber-600 ml-2 font-bold">🔑 API key required</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
