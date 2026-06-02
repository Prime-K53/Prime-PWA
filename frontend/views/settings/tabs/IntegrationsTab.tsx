import React from 'react';
import { CompanyConfig } from '../../../types';
import { Shield, ExternalLink, Globe, Plus, Trash2, Webhook } from 'lucide-react';

interface IntegrationsTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ config, setConfig }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Shield size={18} className="text-rose-600" /> Authorization & API Policy
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm group hover:border-rose-100 transition-all">
          <div className="flex justify-between items-center group/item">
            <div>
              <p className="font-black text-slate-800 uppercase text-base group-hover/item:text-rose-600 transition-colors">Force Multi-Factor Auth</p>
              <p className="text-[10px] text-slate-500 mt-1 italic font-medium">Require 6-digit TOTP for all administrative roles.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div className="grid grid-cols-2 gap-10">
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-rose-600 transition-colors">Min Password Length</label>
                <input
                type="number"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-rose-500/5 focus:border-rose-500 transition-all group-hover/field:border-rose-100"
                placeholder="e.g. 8"
                defaultValue="8"
              />
            </div>
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-rose-600 transition-colors">Complexity Requirement</label>
              <div className="flex gap-3">
                <span className="px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-[10px] font-black tracking-widest">NUMERIC</span>
                <span className="px-6 py-3 bg-[#2CA01C]/50 text-[#2CA01C] border border-[#2CA01C]/50 rounded-2xl text-[10px] font-black tracking-widest">SPECIAL CHAR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <ExternalLink size={18} className="text-[#2CA01C]" /> External API Connections
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm">
          {(config.integrationSettings?.externalApis || []).map((apiItem, index) => (
            <div key={apiItem.id} className="p-6 bg-[#F4F5F8] rounded-lg border border-[#D4D7DC] animate-in fade-in slide-in-from-bottom-4 group hover:border-[#2CA01C] transition-all">
              <div className="flex justify-between items-start mb-6 group/header">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-white rounded-md shadow-sm text-[#6B6C6F] border border-[#D4D7DC] group-hover/header:text-[#2CA01C] transition-colors">
                    <Globe size={28} />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="bg-transparent font-bold text-[#393A3D] uppercase text-xl outline-none border-b-2 border-transparent focus:border-[#2CA01C] mb-1 transition-all"
                      value={apiItem.name}
                      onChange={e => {
                        const newApis = [...(config.integrationSettings?.externalApis || [])];
                        newApis[index] = { ...apiItem, name: e.target.value };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } as any });
                      }}
                    />
                    <p className="text-[10px] text-slate-400 font-bold italic tracking-tight">Endpoint: {apiItem.baseUrl}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={apiItem.enabled}
                    onChange={e => {
                      const newApis = [...(config.integrationSettings?.externalApis || [])];
                      newApis[index] = { ...apiItem, enabled: e.target.checked };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } as any });
                    }}
                  />
                  <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-10">
                <div className="group/field">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-[#2CA01C] transition-colors">API Base URL</label>
                  <input
                    type="text"
                    placeholder="https://api.example.com"
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-[#2CA01C]/5 focus:border-[#2CA01C] transition-all group-hover/field:border-[#2CA01C]/50"
                    value={apiItem.baseUrl}
                    onChange={e => {
                      const newApis = [...(config.integrationSettings?.externalApis || [])];
                      newApis[index] = { ...apiItem, baseUrl: e.target.value };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } as any });
                    }}
                  />
                </div>
                <div className="group/field">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-[#2CA01C] transition-colors">Authorization Token</label>
                  <div className="relative">
                    <input
                      type="password"
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-[#2CA01C]/5 focus:border-[#2CA01C] pr-12 transition-all group-hover/field:border-[#2CA01C]/50"
                      placeholder="xxxxxxxxxxxx"
                      value={apiItem.apiKey || ''}
                      onChange={e => {
                        const newApis = [...(config.integrationSettings?.externalApis || [])];
                        newApis[index] = { ...apiItem, apiKey: e.target.value };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } as any });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              const newApis = [...(config.integrationSettings?.externalApis || []), { id: `api-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: 'New API Connection', enabled: false, baseUrl: 'https://' }];
              setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } as any });
            }}
            className="w-full py-6 border-2 border-dashed border-[#D4D7DC] rounded-lg text-[#6B6C6F] font-bold uppercase text-xs tracking-widest hover:border-[#2CA01C] hover:text-[#2CA01C] hover:bg-green-50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <Plus size={20} /> Register New API Endpoint
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Webhook size={18} className="text-emerald-600" /> Webhook Outlets
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm">
          {(config.integrationSettings?.webhooks || []).map((hook, index) => (
            <div key={hook.id} className="p-6 bg-slate-50/50 rounded-lg border border-slate-100 animate-in fade-in slide-in-from-bottom-4 group hover:border-emerald-100 transition-all">
              <div className="flex justify-between items-start mb-10 group/header">
                <div className="flex-1 group/field">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-emerald-600 transition-colors">Target Payload URL</label>
                  <input
                    type="text"
                    placeholder="https://your-webhook-endpoint.com"
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm group-hover/field:border-emerald-100"
                    value={hook.url}
                    onChange={e => {
                      const newHooks = [...(config.integrationSettings?.webhooks || [])];
                      newHooks[index] = { ...hook, url: e.target.value };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } as any });
                    }}
                  />
                </div>
                <div className="ml-10 flex items-center gap-6 pt-7">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={hook.enabled}
                      onChange={e => {
                        const newHooks = [...(config.integrationSettings?.webhooks || [])];
                        newHooks[index] = { ...hook, enabled: e.target.checked };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } as any });
                      }}
                    />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <button
                    onClick={() => {
                      const newHooks = (config.integrationSettings?.webhooks || []).filter(h => h.id !== hook.id);
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } as any });
                    }}
                    className="p-4 bg-white rounded-2xl border border-slate-200 text-slate-300 hover:text-rose-500 hover:border-rose-100 hover:bg-rose-50 transition-all shadow-sm active:scale-90"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
              <div className="group/events">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 px-1 group-hover/events:text-emerald-600 transition-colors">Trigger Events Pipeline</label>
                <div className="flex flex-wrap gap-4">
                  {['sale.created', 'inventory.low', 'customer.created', 'production.complete'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        const newEvents = (hook.events || []).includes(event)
                          ? (hook.events || []).filter(e => e !== event)
                          : [...(hook.events || []), event];
                        const newHooks = [...(config.integrationSettings?.webhooks || [])];
                        newHooks[index] = { ...hook, events: newEvents };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } as any });
                      }}
                      className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${(hook.events || []).includes(event) ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-600'}`}
                    >
                      {event.replace('.', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              const newHooks = [...(config.integrationSettings?.webhooks || []), { id: `hook-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, url: 'https://', events: [], enabled: false }];
              setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } as any });
            }}
            className="w-full py-6 border-2 border-dashed border-[#D4D7DC] rounded-lg text-[#6B6C6F] font-bold uppercase text-xs tracking-widest hover:border-[#2CA01C] hover:text-[#2CA01C] hover:bg-green-50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <Plus size={20} /> Configure New Webhook Outlet
          </button>
        </div>
      </section>
    </div>
  );
};
