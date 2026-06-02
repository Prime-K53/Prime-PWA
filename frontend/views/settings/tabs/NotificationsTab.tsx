import React from 'react';
import { CompanyConfig } from '../../../types';
import { Bell, Mail, MessageSquare, ShieldAlert, CheckCircle2, Smartphone } from 'lucide-react';

interface NotificationsTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ config, setConfig, notify }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Bell size={18} className="text-blue-600" /> Channel Configuration
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm">
          <div className="grid grid-cols-2 gap-10">
            <div className="flex justify-between items-center p-6 bg-[#F4F5F8] rounded-lg border border-[#D4D7DC] group hover:border-[#2CA01C] transition-all">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-white rounded-2xl shadow-sm text-blue-600 border border-slate-100 group-hover:scale-110 transition-transform"><Mail size={24} /></div>
                <div>
                  <p className="font-black text-slate-800 uppercase text-sm tracking-tight group-hover:text-blue-600 transition-colors">Email Notifications</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium italic">Invoices, reports, and alerts.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.notificationSettings?.emailEnabled}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      emailEnabled: e.target.checked
                    }
                  })}
                />
                <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
              </label>
            </div>
            <div className="flex justify-between items-center p-6 bg-[#F4F5F8] rounded-lg border border-[#D4D7DC] group hover:border-[#2CA01C] transition-all">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-white rounded-2xl shadow-sm text-emerald-600 border border-slate-100 group-hover:scale-110 transition-transform"><MessageSquare size={24} /></div>
                <div>
                  <p className="font-black text-slate-800 uppercase text-sm tracking-tight group-hover:text-emerald-600 transition-colors">SMS Notifications</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium italic">Critical alerts and OTPs.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.notificationSettings?.smsEnabled}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      smsEnabled: e.target.checked
                    }
                  })}
                />
                <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <ShieldAlert size={18} className="text-rose-600" /> Alert Policy
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 space-y-8 shadow-sm">
          <div className="grid grid-cols-2 gap-10">
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-blue-600 transition-colors">Low Stock Threshold</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all group-hover/field:border-blue-100"
                  placeholder="e.g. 10"
                  value={config.notificationSettings?.lowStockThreshold || 10}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      lowStockThreshold: parseInt(e.target.value) || 0
                    }
                  })}
                />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Units</span>
              </div>
            </div>
            <div className="group/field">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 group-hover/field:text-blue-600 transition-colors">Large Transaction Alert</label>
              <div className="flex items-center gap-4">
                <span className="text-xs font-black text-slate-400">{config.currencySymbol}</span>
                <input
                  type="number"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all group-hover/field:border-blue-100"
                  placeholder="e.g. 5000"
                  value={config.notificationSettings?.largeTransactionThreshold || 5000}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      largeTransactionThreshold: parseInt(e.target.value) || 0
                    }
                  })}
                />
              </div>
            </div>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div className="flex justify-between items-center group">
            <div>
              <p className="font-black text-slate-800 uppercase text-base group-hover:text-blue-600 transition-colors">Daily Performance Summary</p>
              <p className="text-sm text-slate-500 mt-1 font-medium italic">Receive a consolidated report of sales and stock movements.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.notificationSettings?.dailySummaryEnabled || false}
                onChange={e => setConfig({
                  ...config,
                  notificationSettings: {
                    ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: false, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                    dailySummaryEnabled: e.target.checked
                  }
                })}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
            </label>
          </div>

          {config.notificationSettings?.dailySummaryEnabled && (
            <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Summary Time</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                  value={config.notificationSettings?.dailySummaryTime || "20:00"}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: true, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                      dailySummaryTime: e.target.value
                    }
                  })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Email Address</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                  placeholder="e.g. report@company.com"
                  value={config.notificationSettings?.dailySummaryEmail || ''}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: true, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                      dailySummaryEmail: e.target.value
                    }
                  })}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <MessageSquare size={18} className="text-purple-600" /> Customer Communication
        </h3>
        <div className="bg-white rounded-lg border border-[#D4D7DC] p-6 shadow-sm">
          <div className="flex justify-between items-center group/item hover:bg-slate-50 transition-all -mx-8 px-8 py-4">
            <div>
              <p className="font-bold text-slate-800 text-sm">Customer Activity Notifications</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Automatically prepare messages for quotations, invoices, approvals, and payments.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.notificationSettings?.customerActivityNotifications ?? true}
                onChange={e => {
                  const newValue = e.target.checked;
                  if (!newValue) {
                    if (window.confirm("Are you sure you want to disable customer activity notifications? This will stop automatic messaging app triggers for business activities.")) {
                      setConfig({
                        ...config,
                        notificationSettings: {
                          ...config.notificationSettings,
                          customerActivityNotifications: false
                        }
                      });
                      notify('Notifications disabled', 'info');
                    }
                  } else {
                    setConfig({
                      ...config,
                      notificationSettings: {
                        ...config.notificationSettings,
                        customerActivityNotifications: true
                      }
                    });
                    notify('Notifications enabled', 'success');
                  }
                }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2CA01C]"></div>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
};
