import React, { useEffect, useState } from 'react';
import { useVatStore } from '../../stores/vatStore';
import { useFinanceStore } from '../../stores/financeStore';
import { VATConfig } from '../../types';
import { Save } from 'lucide-react';

export const VatSettings: React.FC = () => {
    const { config, updateConfig, isLoading } = useVatStore();
    const { accounts, fetchFinanceData } = useFinanceStore();
    const [localConfig, setLocalConfig] = useState<VATConfig>(config);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        fetchFinanceData();
    }, []);

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const handleChange = (field: keyof VATConfig, value: any) => {
        setLocalConfig(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        await updateConfig(localConfig);
        setIsDirty(false);
    };

    // Filter for liability/asset accounts
    const liabilityAccounts = accounts.filter(a => a.type === 'Liability');
    const assetAccounts = accounts.filter(a => a.type === 'Asset');

    return (
        <div className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
            <h2 className="font-semibold text-slate-800 tracking-tighter text-[16px] mb-6">VAT settings</h2>

            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Standard rate (%)</label>
                        <input
                            type="number"
                            value={localConfig.rate}
                            onChange={(e) => handleChange('rate', parseFloat(e.target.value))}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Malawi standard rate: 17.5%</p>
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Registration number (TPIN)</label>
                        <input
                            type="text"
                            value={localConfig.registrationNumber || ''}
                            onChange={(e) => handleChange('registrationNumber', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g. 100012345"
                        />
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Filing frequency</label>
                        <select
                            value={localConfig.filingFrequency}
                            onChange={(e) => handleChange('filingFrequency', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Annually">Annually</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Default tax category</label>
                        <select
                            value={localConfig.defaultTaxCategory || 'Standard'}
                            onChange={(e) => handleChange('defaultTaxCategory', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="Standard">Standard rate</option>
                            <option value="Zero">Zero rated</option>
                            <option value="Exempt">Exempt</option>
                        </select>
                    </div>
                </div>

                <h3 className="font-semibold text-slate-800 tracking-tighter text-[16px] mt-6 mb-2 pb-2 border-b border-slate-100">GL account mapping</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Output tax account (collected)</label>
                        <select
                            value={localConfig.outputTaxAccount || ''}
                            onChange={(e) => handleChange('outputTaxAccount', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Select liability account</option>
                            {liabilityAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Account for VAT collected on sales</p>
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Input tax account (paid)</label>
                        <select
                            value={localConfig.inputTaxAccount || ''}
                            onChange={(e) => handleChange('inputTaxAccount', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Select asset account</option>
                            {assetAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Account for VAT paid on purchases</p>
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 tracking-wide mb-1">Market adjustment account</label>
                        <select
                            value={localConfig.marketAdjustmentAccount || ''}
                            onChange={(e) => handleChange('marketAdjustmentAccount', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Select revenue/other account</option>
                            {accounts.filter(a => a.type === 'Revenue').map(a => (
                                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Account for tracking market adjustments</p>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isLoading}
                        className={`px-6 py-2 rounded-xl font-bold text-white transition-colors flex items-center gap-2
                            ${isDirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 cursor-not-allowed'}`}
                    >
                        <Save size={16} />
                        {isLoading ? 'Saving...' : 'Save configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
};
