import React, { useState } from 'react';
import { useVatStore } from '../../stores/vatStore';
import { useData } from '../../context/DataContext';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
    FileText, Download, CheckCircle, AlertCircle, Plus, Calendar
} from 'lucide-react';
import { VatReturn } from '../../types';

export const VatReports: React.FC = () => {
    const { returns, generateReturn, fileReturn, isLoading } = useVatStore();
    const { companyConfig } = useData();
    const currency = companyConfig?.currencySymbol || 'MK';

    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedReturn, setSelectedReturn] = useState<VatReturn | null>(null);
    const [period, setPeriod] = useState({
        month: new Date().getMonth(),
        year: new Date().getFullYear()
    });

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const date = new Date(period.year, period.month, 1);
            const start = startOfMonth(date).toISOString();
            const end = endOfMonth(date).toISOString();

            await generateReturn(start, end);
        } catch (error) {
            console.error("Failed to generate return", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFileReturn = async (returnId: string) => {
        if (window.confirm('Are you sure you want to file this return? This action cannot be undone.')) {
            await fileReturn(returnId);
        }
    };

    const handleMarkPaid = async (returnId: string) => {
        const date = prompt('Enter payment date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (date) {
            await fileReturn(returnId, date);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">VAT returns</h2>

                <div className="flex items-center space-x-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <select
                        className="border-none bg-transparent focus:ring-0 text-sm font-medium"
                        value={period.month}
                        onChange={(e) => setPeriod(p => ({ ...p, month: parseInt(e.target.value) }))}
                    >
                        {Array.from({ length: 12 }).map((_, i) => (
                            <option key={i} value={i}>{format(new Date(2024, i, 1), 'MMMM')}</option>
                        ))}
                    </select>
                    <select
                        className="border-none bg-transparent focus:ring-0 text-sm font-medium"
                        value={period.year}
                        onChange={(e) => setPeriod(p => ({ ...p, year: parseInt(e.target.value) }))}
                    >
                        {[0, 1, 2].map(i => (
                            <option key={i} value={new Date().getFullYear() - i}>
                                {new Date().getFullYear() - i}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center hover:bg-blue-700"
                    >
                        <Plus size={16} className="mr-1" />
                        Generate return
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-[12px] font-bold text-slate-500 tracking-wide">Period</th>
                            <th className="px-6 py-3 text-right text-[12px] font-bold text-slate-500 tracking-wide">Total output</th>
                            <th className="px-6 py-3 text-right text-[12px] font-bold text-slate-500 tracking-wide">Total input</th>
                            <th className="px-6 py-3 text-right text-[12px] font-bold text-slate-500 tracking-wide">Net payable</th>
                            <th className="px-6 py-3 text-center text-[12px] font-bold text-slate-500 tracking-wide">Status</th>
                            <th className="px-6 py-3 text-right text-[12px] font-bold text-slate-500 tracking-wide">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {returns.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    No VAT returns found. Generate one to get started.
                                </td>
                            </tr>
                        ) : (
                            returns.map(ret => (
                                <tr key={ret.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <Calendar size={16} className="text-slate-400 mr-2" />
                                            <span className="font-medium text-slate-900">
                                                {format(parseISO(ret.periodStart), 'MMM yyyy')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 ml-6">
                                            {format(parseISO(ret.periodStart), 'dd MMM')} - {format(parseISO(ret.periodEnd), 'dd MMM')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-slate-900">
                                        {currency} {ret.totalOutputTax.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-slate-900">
                                        {currency} {ret.totalInputTax.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-bold">
                                        <span className={ret.netPayable >= 0 ? 'text-slate-900' : 'text-emerald-600'}>
                                            {currency} {Math.abs(ret.netPayable).toLocaleString()}
                                            {ret.netPayable < 0 && ' (CR)'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${ret.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                                                ret.status === 'Filed' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-amber-100 text-amber-800'}`}>
                                            {ret.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                                        {ret.status === 'Draft' && (
                                            <button
                                                onClick={() => handleFileReturn(ret.id)}
                                                className="text-blue-600 hover:text-blue-900"
                                            >
                                                File
                                            </button>
                                        )}
                                        {ret.status === 'Filed' && (
                                            <button
                                                onClick={() => handleMarkPaid(ret.id)}
                                                className="text-emerald-600 hover:text-emerald-900"
                                            >
                                                Mark paid
                                            </button>
                                        )}
                                        <button className="text-slate-400 hover:text-slate-600">
                                            <Download size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
