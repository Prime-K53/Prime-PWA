import React from 'react';
import { CompanyConfig } from '../../../types';
import { Cloud, Key, RefreshCw } from 'lucide-react';

interface CloudTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  api?: Record<string, any>;
}

export const CloudTab: React.FC<CloudTabProps> = ({ config, setConfig, notify, isProcessing, setIsProcessing, api }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3">
        <Cloud size={18} className="text-[#2CA01C]" />
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Cloud Sync (Stage 1)</h3>
      </div>
      <div className="grid grid-cols-2 gap-10">
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 shadow-sm space-y-10 group hover:border-[#2CA01C]/50 transition-all">
          <div className="flex justify-between items-center group/header">
            <div>
              <p className="font-black text-slate-900 uppercase text-lg group-hover/header:text-[#2CA01C] transition-colors">Sync Connectivity</p>
              <p className="text-[10px] text-slate-500 mt-1 italic font-medium">Last successful sync: {config.cloudSync?.lastSyncTimestamp || 'Never'}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.cloudSync?.enabled}
                onChange={e => setConfig({ ...config, cloudSync: { ...config.cloudSync, enabled: e.target.checked } as any })}
              />
              <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#2CA01C]"></div>
            </label>
          </div>
          <div className="space-y-8">
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-[#2CA01C] transition-colors">Cloud API Endpoint</label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-[#2CA01C]/5 focus:border-[#2CA01C] transition-all text-sm group-hover/field:border-[#2CA01C]/50"
                placeholder="https://api.prime-erp.cloud/v1"
                value={config.cloudSync?.apiUrl || ''}
                onChange={e => setConfig({ ...config, cloudSync: { ...config.cloudSync, apiUrl: e.target.value } as any })}
              />
            </div>
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-[#2CA01C] transition-colors">Cloud API Key</label>
              <div className="relative group/input">
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-[#2CA01C]/5 focus:border-[#2CA01C] transition-all text-sm pr-12 group-hover/input:border-[#2CA01C]/50"
                  placeholder="e.g. 43c...8f1"
                  value={config.cloudSync?.apiKey || ''}
                  onChange={e => setConfig({ ...config, cloudSync: { ...config.cloudSync, apiKey: e.target.value } as any })}
                />
                <Key className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-[#2CA01C] transition-colors" size={18} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#393A3D] p-6 rounded-lg shadow-lg text-white border border-white/5 space-y-8 relative overflow-hidden group/sync">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/sync:opacity-10 transition-opacity">
            <Cloud size={120} className="text-[#2CA01C]" />
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-black text-[#2CA01C] uppercase tracking-widest mb-8">Synchronization Logic</p>
            <div className="space-y-8">
              <div className="flex justify-between items-center group/item">
                <div>
                  <p className="font-bold text-base group-hover/item:text-[#2CA01C] transition-colors">Automated Background Sync</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium italic">Sync changes in real-time when online.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.cloudSync?.autoSyncEnabled}
                    onChange={e => setConfig({ ...config, cloudSync: { ...config.cloudSync, autoSyncEnabled: e.target.checked } as any })}
                  />
                  <div className="w-12 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
                </label>
              </div>
              <div className="h-px bg-white/5"></div>
              <div>
                <div className="flex justify-between items-center mb-6">
                  <label className="block text-[10px] font-black text-[#2CA01C] uppercase tracking-widest">Sync Frequency</label>
                  <span className="text-[10px] font-black text-white bg-[#2CA01C]/20 px-3 py-1 rounded-full border border-[#2CA01C]/20">{config.cloudSync?.syncIntervalMinutes || 15} MINUTES</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#2CA01C]"
                  value={config.cloudSync?.syncIntervalMinutes || 15}
                  onChange={e => setConfig({ ...config, cloudSync: { ...config.cloudSync, syncIntervalMinutes: parseInt(e.target.value) } as any })}
                />
                <div className="flex justify-between mt-4 text-[9px] font-black text-slate-500 tracking-widest uppercase">
                  <span>Real-time</span>
                  <span>Hourly</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  setIsProcessing(true);
                  try {
                    if (config.cloudSync?.enabled) {
                      if (api?.triggerCloudSync) {
                        await api.triggerCloudSync();
                        notify('Cloud reconciliation initiated successfully.', 'success');
                      } else {
                        notify('Cloud sync API not available.', 'warning');
                      }
                    } else {
                      notify('Cloud sync is not enabled. Please enable cloud sync first.', 'warning');
                    }
                  } catch (error) {
                    notify('Cloud reconciliation failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="w-full bg-[#2CA01C] hover:bg-green-700 text-white font-bold text-[10px] uppercase tracking-widest py-4 rounded-md shadow-md transition-all flex items-center justify-center gap-3 active:scale-95 group/btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={18} className={`group-hover/btn:rotate-180 transition-transform duration-500 ${isProcessing ? 'animate-spin' : ''}`} /> Force Cloud Reconciliation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
