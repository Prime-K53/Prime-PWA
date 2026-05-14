
import React, { useState } from 'react';
import { X, Calendar, Filter, Eye, Printer, Download, Clock, TrendingUp, Scale, Activity, Target, CheckCircle2, History } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useDocumentStore } from '../stores/documentStore';
import { calculateAccountBalances, getAgedData } from '../services/reportService';
import { format, parseISO, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';

interface ReportOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportType: 'IncomeStatement' | 'BalanceSheet' | 'CashFlow' | 'TrialBalance' | 'Budget' | 'AgedAR' | 'AgedAP';
    reportLabel: string;
}

const ReportOptionsModal: React.FC<ReportOptionsModalProps> = ({ isOpen, onClose, reportType, reportLabel }) => {
    const { accounts, ledger, budgets, invoices, purchases, companyConfig, notify } = useData();
    const { safeOpenPreview } = useDocumentStore();
    const currency = companyConfig?.currencySymbol || '$';

    const [dateRange, setDateRange] = useState({
        start: startOfYear(new Date()).toISOString().split('T')[0],
        end: endOfYear(new Date()).toISOString().split('T')[0]
    });
    const [compareWithPrevious, setCompareWithPrevious] = useState(false);

    if (!isOpen) return null;

    const handlePreview = () => {
        const balances = calculateAccountBalances(accounts, ledger, dateRange, compareWithPrevious);

        let reportData: any = {
            reportName: reportLabel,
            period: `${format(parseISO(dateRange.start), 'MMMM d, yyyy')} - ${format(parseISO(dateRange.end), 'MMMM d, yyyy')}`,
            currency,
            sections: []
        };

        const getAccountRows = (types: string[]) => {
            return (accounts || [])
                .filter(a => types.includes(a.type))
                .map(a => ({
                    label: a.name,
                    subText: a.code,
                    amount: balances.current[a.id] || 0,
                    prevAmount: balances.previous[a.id] || 0
                }))
                .filter(a => Math.abs(a.amount) > 0.001 || Math.abs(a.prevAmount) > 0.001)
                .sort((a, b) => a.subText.localeCompare(b.subText));
        };

        if (reportType === 'IncomeStatement') {
            const revenue = getAccountRows(['Revenue']);
            const expenses = getAccountRows(['Expense']);
            const totalRev = revenue.reduce((s, a) => s + a.amount, 0);
            const totalExp = expenses.reduce((s, a) => s + a.amount, 0);
            const prevTotalRev = revenue.reduce((s, a) => s + (a.prevAmount || 0), 0);
            const prevTotalExp = expenses.reduce((s, a) => s + (a.prevAmount || 0), 0);

            reportData.sections = [
                { title: 'Operating Revenue', rows: [...revenue, { label: 'Total Revenue', amount: totalRev, prevAmount: prevTotalRev, isTotal: true }] },
                { title: 'Operating Expenses', rows: [...expenses, { label: 'Total Expenses', amount: totalExp, prevAmount: prevTotalExp, isTotal: true }] }
            ];
            reportData.netPerformance = { label: 'Net Profit / (Loss)', amount: totalRev - totalExp, prevAmount: prevTotalRev - prevTotalExp };
        }
        else if (reportType === 'BalanceSheet') {
            const assets = getAccountRows(['Asset']);
            const liabilities = getAccountRows(['Liability']);
            const equity = getAccountRows(['Equity']);

            const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
            const prevTotalAssets = assets.reduce((s, a) => s + (a.prevAmount || 0), 0);

            // Calculate Net Income for the period to balance the BS
            const revenue = getAccountRows(['Revenue']);
            const expenses = getAccountRows(['Expense']);
            const netIncome = revenue.reduce((s, a) => s + a.amount, 0) - expenses.reduce((s, a) => s + a.amount, 0);
            const prevNetIncome = revenue.reduce((s, a) => s + (a.prevAmount || 0), 0) - expenses.reduce((s, a) => s + (a.prevAmount || 0), 0);

            const totalLiaEqu = liabilities.reduce((s, a) => s + a.amount, 0) + equity.reduce((s, a) => s + a.amount, 0) + netIncome;
            const prevTotalLiaEqu = liabilities.reduce((s, a) => s + (a.prevAmount || 0), 0) + equity.reduce((s, a) => s + (a.prevAmount || 0), 0) + prevNetIncome;

            reportData.sections = [
                { title: 'Assets', rows: [...assets, { label: 'Total Assets', amount: totalAssets, prevAmount: prevTotalAssets, isTotal: true }] },
                {
                    title: 'Liabilities & Equity',
                    rows: [
                        ...liabilities,
                        ...equity,
                        { label: 'Net Profit / (Loss) for Period', amount: netIncome, prevAmount: prevNetIncome },
                        { label: 'Total Liabilities & Equity', amount: totalLiaEqu, prevAmount: prevTotalLiaEqu, isTotal: true }
                    ]
                }
            ];
        }
        else if (reportType === 'TrialBalance') {
            const allRows = (accounts || []).map(a => ({
                label: a.name,
                subText: a.code,
                balance: balances.current[a.id] || 0
            })).filter(a => Math.abs(a.balance) > 0.001);

            const debits = allRows.filter(a => a.balance > 0).map(a => ({ label: a.label, subText: a.subText, amount: a.balance }));
            const credits = allRows.filter(a => a.balance < 0).map(a => ({ label: a.label, subText: a.subText, amount: Math.abs(a.balance) }));

            reportData.sections = [
                { title: 'Debit Balances', rows: debits },
                { title: 'Credit Balances', rows: credits }
            ];
            reportData.netPerformance = {
                label: 'Trial Balance Totals (Debit / Credit)',
                amount: debits.reduce((s, a) => s + a.amount, 0),
                prevAmount: credits.reduce((s, a) => s + a.amount, 0)
            };
        }
        else if (reportType === 'AgedAR' || reportType === 'AgedAP') {
            const aged = getAgedData(invoices, purchases);
            const data = reportType === 'AgedAR' ? aged.ar : aged.ap;

            reportData.sections = [
                {
                    title: 'Aging Summary',
                    rows: Object.entries(data.buckets).map(([bucket, amount]) => ({ label: `${bucket} Days`, amount: amount as number }))
                },
                {
                    title: 'Top Outstanding Items',
                    rows: data.items.sort((a: any, b: any) => b.balance - a.balance).slice(0, 10).map((i: any) => ({
                        label: i.customerName || i.supplierId || 'Unknown',
                        subText: `Due: ${format(parseISO(i.date), 'MMM d, yyyy')}`,
                        amount: i.balance
                    }))
                }
            ];
        }
        else if (reportType === 'Budget') {
            const start = parseISO(dateRange.start);
            const end = parseISO(dateRange.end);
            const activeBudgets = (budgets || []).filter(b => {
                const bDate = parseISO(`${b.month}-01`);
                return (bDate >= start || b.month === format(start, 'yyyy-MM')) &&
                    (bDate <= end || b.month === format(end, 'yyyy-MM'));
            });

            const items = (accounts || [])
                .filter(a => a.type === 'Revenue' || a.type === 'Expense')
                .map(acc => {
                    const actual = balances.current[acc.id] || 0;
                    const budgetAmount = activeBudgets
                        .filter(b => b.accountId === acc.id)
                        .reduce((sum, b) => sum + b.amount, 0);
                    return { label: acc.name, subText: acc.code, amount: actual, prevAmount: budgetAmount };
                })
                .filter(item => Math.abs(item.amount) > 0 || Math.abs(item.prevAmount) > 0);

            reportData.sections = [{ title: 'Budget vs Actual Performance', rows: items }];
        }
        else if (reportType === 'CashFlow') {
            const revenue = getAccountRows(['Revenue']);
            const expenses = getAccountRows(['Expense']);
            const totalRev = revenue.reduce((s, a) => s + a.amount, 0);
            const totalExp = expenses.reduce((s, a) => s + a.amount, 0);

            reportData.sections = [
                { title: 'Operating Activities (Inflow)', rows: revenue },
                { title: 'Operating Activities (Outflow)', rows: expenses.map(e => ({ ...e, amount: -e.amount })) }
            ];
            reportData.netPerformance = { label: 'Net Cash Flow from Operations', amount: totalRev - totalExp };
        }

        const result = safeOpenPreview('FISCAL_REPORT', reportData);
        if (result.success) {
            onClose();
        } else {
            notify(result.error || "Failed to generate preview", "error");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{reportLabel}</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-0.5">Report Configuration & Advanced Options</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 rounded-2xl transition-all shadow-sm">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-10">
                    {/* Date Range Selection */}
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Reporting Period</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-50 rounded-[2rem] border border-slate-200/60">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                                <div className="relative group">
                                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                                <div className="relative group">
                                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-4">
                            {[
                                { label: 'This Year', start: startOfYear(new Date()), end: endOfYear(new Date()) },
                                { label: 'This Month', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
                                { label: 'Q1', start: new Date(new Date().getFullYear(), 0, 1), end: new Date(new Date().getFullYear(), 2, 31) },
                                { label: 'Full Year 2024', start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) }
                            ].map(opt => (
                                <button
                                    key={opt.label}
                                    onClick={() => setDateRange({ start: opt.start.toISOString().split('T')[0], end: opt.end.toISOString().split('T')[0] })}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all"
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Advanced Toggles */}
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Advanced Analysis</h3>
                        </div>
                        <div className="space-y-4">
                            <button
                                onClick={() => setCompareWithPrevious(!compareWithPrevious)}
                                className={`w-full p-6 rounded-[2rem] border transition-all flex items-center justify-between group ${compareWithPrevious ? 'bg-blue-50 border-blue-200 ring-4 ring-blue-50' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-6">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${compareWithPrevious ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                                        <Activity size={28} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Compare with Previous Period</p>
                                        <p className="text-[10px] font-medium text-slate-500 mt-1 max-w-sm">Enable side-by-side comparison with the immediately preceding date range of equal length.</p>
                                    </div>
                                </div>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${compareWithPrevious ? 'bg-blue-600' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${compareWithPrevious ? 'left-7' : 'left-1'}`} />
                                </div>
                            </button>
                        </div>
                    </section>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-400">
                        <Filter size={14} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Selection: {dateRange.start} — {dateRange.end}</span>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handlePreview}
                            className="px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center gap-3 active:scale-95"
                        >
                            <Eye size={20} />
                            Generate Preview
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportOptionsModal;
