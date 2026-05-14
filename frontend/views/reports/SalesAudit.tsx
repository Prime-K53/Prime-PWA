import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { format, parseISO, startOfWeek, startOfMonth, isWithinInterval, isSameDay } from 'date-fns';
import {
    DollarSign, CreditCard, Wallet, Banknote, Smartphone, ArrowDownUp,
    TrendingUp, ChevronDown, ChevronUp, Clock,
    Calendar, Printer, BarChart3, Users,
    Receipt, XCircle, CheckCircle, RefreshCw
} from 'lucide-react';
import { Sale, CustomerPayment } from '../../types';

type DateRangeFilter = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

interface SalesAuditData {
    totalSales: number;
    totalTransactions: number;
    byPaymentMethod: Record<string, { count: number; amount: number }>;
    byStatus: Record<string, { count: number; amount: number }>;
    byCashier: Record<string, { count: number; amount: number }>;
    dailyBreakdown: { date: string; sales: number; count: number; byMethod: Record<string, number> }[];
    voidedAmount: number;
    refundedAmount: number;
    averageTransaction: number;
    topTransactions: Sale[];
    recentPayments: CustomerPayment[];
}

const SalesAudit: React.FC = () => {
    const { sales = [], invoices = [], examinationBatches = [], customerPayments = [], companyConfig, allUsers = [] } = useData();
    const currency = companyConfig?.currencySymbol || '$';
    const [dateRange, setDateRange] = useState<DateRangeFilter>('today');
    const [expandedSection, setExpandedSection] = useState<string | null>('daily');

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null || isNaN(val)) return `${currency}0.00`;
        return `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const filterByDateRange = (dateStr: string): boolean => {
        if (dateRange === 'all') return true;
        const date = parseISO(dateStr);
        const now = new Date();

        switch (dateRange) {
            case 'today':
                return isSameDay(date, now);
            case 'week': {
                const weekStart = startOfWeek(now, { weekStartsOn: 1 });
                return isWithinInterval(date, { start: weekStart, end: now });
            }
            case 'month':
                return isWithinInterval(date, { start: startOfMonth(now), end: now });
            case 'quarter': {
                const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                return isWithinInterval(date, { start: quarterStart, end: now });
            }
            case 'year':
                return date.getFullYear() === now.getFullYear();
            default:
                return true;
        }
    };

    const auditData: SalesAuditData = useMemo(() => {
        const filteredSales = (sales || []).filter(s => filterByDateRange(s.date));
        const filteredPayments = (customerPayments || []).filter(p => filterByDateRange(p.date));

        // Include posted invoices (non-cancelled, non-draft)
        const filteredInvoices = (invoices || []).filter((inv: any) => {
            const status = String(inv?.status || '').toLowerCase();
            if (status === 'cancelled' || status === 'draft') return false;
            return filterByDateRange(inv.date);
        });

        // Separate POS-mirror, examination, and pure invoices
        const recognizedSaleIds = new Set<string>(
            filteredSales.map((s: any) => String(s?.id || '').trim()).filter(Boolean)
        );
        const isPosMirrorInv = (inv: any) => {
            const origin = String(inv?.originModule || inv?.origin_module || '').toLowerCase();
            const convType = String(inv?.conversionDetails?.sourceType || '').toLowerCase();
            const note = String(inv?.notes || '').toLowerCase();
            return origin === 'pos' || convType === 'sale' ||
                note.includes('pos sale') || note.includes('source: pos') ||
                (!!String(inv?.reference || '') && recognizedSaleIds.has(String(inv?.reference || '')));
        };
        const isExamInv = (inv: any) => {
            const origin = String(inv?.originModule || inv?.origin_module || '').toLowerCase();
            const batchId = String(inv?.batchId || inv?.linkedBatchId || inv?.originBatchId || inv?.origin_batch_id || '').trim();
            const ref = String(inv?.reference || '').toUpperCase();
            return origin === 'examination' || batchId.length > 0 || ref.startsWith('EXM-BATCH-');
        };
        const pureInvoices = filteredInvoices.filter((inv: any) => !isPosMirrorInv(inv) && !isExamInv(inv));
        const examInvoices = filteredInvoices.filter((inv: any) => isExamInv(inv));

        // ── Totals ───────────────────────────────────────────────────────
        const posSalesTotal = filteredSales.reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const invoiceRevenue = pureInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
        const examRevenue = examInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
        const totalSales = posSalesTotal + invoiceRevenue + examRevenue;
        const totalTransactions = filteredSales.length + pureInvoices.length + examInvoices.length;

        // By payment method
        const byPaymentMethod: Record<string, { count: number; amount: number }> = {};
        filteredSales.forEach(sale => {
            const total = sale.totalAmount || sale.total || 0;

            // For split payments, allocate to underlying methods only to avoid double-counting.
            if (sale.paymentMethod === 'Split' && sale.payments && sale.payments.length > 0) {
                sale.payments.forEach(p => {
                    const subMethod = p.method || 'Cash';
                    if (!byPaymentMethod[subMethod]) {
                        byPaymentMethod[subMethod] = { count: 0, amount: 0 };
                    }
                    byPaymentMethod[subMethod].count++;
                    byPaymentMethod[subMethod].amount += p.amount || 0;
                });
                return;
            }

            const method = sale.paymentMethod || 'Cash';
            if (!byPaymentMethod[method]) {
                byPaymentMethod[method] = { count: 0, amount: 0 };
            }
            byPaymentMethod[method].count++;
            byPaymentMethod[method].amount += total;
        });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => {
            const method = inv.paymentMethod || 'Invoice';
            if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, amount: 0 };
            byPaymentMethod[method].count++;
            byPaymentMethod[method].amount += (inv.totalAmount || 0);
        });

        // By status
        const byStatus: Record<string, { count: number; amount: number }> = {};
        [...filteredSales, ...pureInvoices, ...examInvoices].forEach((rec: any) => {
            const status = rec.status || 'Unknown';
            if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
            byStatus[status].count++;
            byStatus[status].amount += (rec.totalAmount || rec.total || 0);
        });

        // By cashier (POS) / creator (invoices)
        const byCashier: Record<string, { count: number; amount: number }> = {};
        filteredSales.forEach(sale => {
            const cashierId = sale.cashierId || 'Unknown';
            if (!byCashier[cashierId]) byCashier[cashierId] = { count: 0, amount: 0 };
            byCashier[cashierId].count++;
            byCashier[cashierId].amount += (sale.totalAmount || sale.total || 0);
        });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => {
            const creator = inv.createdBy || 'System';
            if (!byCashier[creator]) byCashier[creator] = { count: 0, amount: 0 };
            byCashier[creator].count++;
            byCashier[creator].amount += (inv.totalAmount || 0);
        });

        // Daily breakdown — combine all sources
        const dailyMap = new Map<string, { sales: number; count: number; byMethod: Record<string, number> }>();
        filteredSales.forEach(sale => {
            const dateKey = sale.date.split('T')[0];
            const existing = dailyMap.get(dateKey) || { sales: 0, count: 0, byMethod: {} };
            const total = sale.totalAmount || sale.total || 0;
            existing.sales += total;
            existing.count++;

            if (sale.paymentMethod === 'Split' && sale.payments && sale.payments.length > 0) {
                sale.payments.forEach(p => {
                    const method = p.method || 'Cash';
                    existing.byMethod[method] = (existing.byMethod[method] || 0) + (p.amount || 0);
                });
            } else {
                const method = sale.paymentMethod || 'Cash';
                existing.byMethod[method] = (existing.byMethod[method] || 0) + total;
            }
            dailyMap.set(dateKey, existing);
        });
        [...pureInvoices, ...examInvoices].forEach((inv: any) => {
            const dateKey = String(inv.date || '').split('T')[0];
            if (!dateKey) return;
            const existing = dailyMap.get(dateKey) || { sales: 0, count: 0, byMethod: {} };
            const total = inv.totalAmount || 0;
            existing.sales += total;
            existing.count++;
            const method = inv.paymentMethod || 'Invoice';
            existing.byMethod[method] = (existing.byMethod[method] || 0) + total;
            dailyMap.set(dateKey, existing);
        });

        const dailyBreakdown = Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => b.date.localeCompare(a.date));

        // Voided and refunded amounts (POS only — invoices are cancelled)
        const voidedAmount = filteredSales
            .filter(s => s.status === 'Cancelled' || s.status === 'Refunded')
            .reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const refundedAmount = filteredSales
            .filter(s => s.status === 'Refunded')
            .reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);

        // Average transaction
        const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

        // Top transactions — all sources combined
        const allTransactions = [
            ...filteredSales,
            ...pureInvoices.map((inv: any) => ({ ...inv, total: inv.totalAmount || 0 })),
            ...examInvoices.map((inv: any) => ({ ...inv, total: inv.totalAmount || 0 }))
        ];
        const topTransactions = [...allTransactions]
            .sort((a, b) => (b.totalAmount || b.total || 0) - (a.totalAmount || a.total || 0))
            .slice(0, 10);

        // Recent payments
        const recentPayments = [...filteredPayments]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        return {
            totalSales,
            totalTransactions,
            byPaymentMethod,
            byStatus,
            byCashier,
            dailyBreakdown,
            voidedAmount,
            refundedAmount,
            averageTransaction,
            topTransactions,
            recentPayments
        };
    }, [sales, invoices, examinationBatches, customerPayments, dateRange]);

    const getPaymentMethodIcon = (method: string) => {
        switch (method) {
            case 'Cash': return <Banknote size={18} className="text-emerald-500" />;
            case 'Card': return <CreditCard size={18} className="text-blue-500" />;
            case 'Mobile Money': return <Smartphone size={18} className="text-purple-500" />;
            case 'Wallet': return <Wallet size={18} className="text-amber-500" />;
            case 'Split': return <ArrowDownUp size={18} className="text-slate-500" />;
            default: return <DollarSign size={18} className="text-slate-400" />;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Paid': return <CheckCircle size={16} className="text-emerald-500" />;
            case 'Partial': return <Clock size={16} className="text-amber-500" />;
            case 'Cancelled': return <XCircle size={16} className="text-rose-500" />;
            case 'Refunded': return <RefreshCw size={16} className="text-rose-500" />;
            default: return <Clock size={16} className="text-slate-400" />;
        }
    };

    const getCashierName = (cashierId: string) => {
        const user = allUsers.find(u => u.id === cashierId);
        return user?.fullName || user?.name || cashierId;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header with Date Filter */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Sales Audit Report</h2>
                    <p className="text-sm text-slate-500 font-medium">Reconciliation and transaction analysis</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        {(['today', 'week', 'month', 'quarter', 'year', 'all'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateRange === range
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                            >
                                {range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                    >
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Total Revenue</p>
                            <h3 className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{formatCurrency(auditData.totalSales)}</h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">{auditData.totalTransactions} transactions</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <DollarSign size={24} className="text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Avg Transaction</p>
                            <h3 className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{formatCurrency(auditData.averageTransaction)}</h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">Per sale average</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <TrendingUp size={24} className="text-emerald-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Voided/Cancelled</p>
                            <h3 className="text-2xl font-black text-rose-600 mt-1 tabular-nums">{formatCurrency(auditData.voidedAmount)}</h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">Non-collected revenue</p>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl">
                            <XCircle size={24} className="text-rose-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Payments Received</p>
                            <h3 className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">{auditData.recentPayments.length}</h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">Payment records</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <Receipt size={24} className="text-amber-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Method & Status Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                        <Wallet size={18} className="text-blue-500" />
                        Revenue by Payment Method
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(auditData.byPaymentMethod)
                            .sort((a, b) => b[1].amount - a[1].amount)
                            .map(([method, data]) => (
                                <div key={method} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        {getPaymentMethodIcon(method)}
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{method}</p>
                                            <p className="text-[11px] text-slate-500">{data.count} transactions</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-slate-900 tabular-nums">{formatCurrency(data.amount)}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {auditData.totalSales > 0 ? ((data.amount / auditData.totalSales) * 100).toFixed(1) : 0}%
                                        </p>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                        <BarChart3 size={18} className="text-emerald-500" />
                        Transaction Status Breakdown
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(auditData.byStatus)
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([status, data]) => (
                                <div key={status} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        {getStatusIcon(status)}
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{status}</p>
                                            <p className="text-[11px] text-slate-500">{data.count} transactions</p>
                                        </div>
                                    </div>
                                    <p className="font-bold text-slate-900 tabular-nums">{formatCurrency(data.amount)}</p>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {/* Cashier Performance */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <button
                    onClick={() => setExpandedSection(expandedSection === 'cashier' ? null : 'cashier')}
                    className="w-full flex items-center justify-between"
                >
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                        <Users size={18} className="text-purple-500" />
                        Cashier Performance
                    </h3>
                    {expandedSection === 'cashier' ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </button>
                {expandedSection === 'cashier' && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100">
                                    <th className="px-4 py-3">Cashier</th>
                                    <th className="px-4 py-3 text-right">Transactions</th>
                                    <th className="px-4 py-3 text-right">Total Sales</th>
                                    <th className="px-4 py-3 text-right">Avg per Transaction</th>
                                    <th className="px-4 py-3 text-right">% of Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {Object.entries(auditData.byCashier)
                                    .sort((a, b) => b[1].amount - a[1].amount)
                                    .map(([cashierId, data]) => (
                                        <tr key={cashierId} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-700">{getCashierName(cashierId)}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{data.count}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(data.amount)}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(data.amount / (data.count || 1))}</td>
                                            <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                                                {auditData.totalSales > 0 ? ((data.amount / auditData.totalSales) * 100).toFixed(1) : 0}%
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Daily Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <button
                    onClick={() => setExpandedSection(expandedSection === 'daily' ? null : 'daily')}
                    className="w-full flex items-center justify-between"
                >
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                        <Calendar size={18} className="text-blue-500" />
                        Daily Reconciliation
                    </h3>
                    {expandedSection === 'daily' ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </button>
                {expandedSection === 'daily' && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100">
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3 text-right">Transactions</th>
                                    <th className="px-4 py-3 text-right">Total Sales</th>
                                    <th className="px-4 py-3 text-right">Cash</th>
                                    <th className="px-4 py-3 text-right">Card</th>
                                    <th className="px-4 py-3 text-right">Mobile</th>
                                    <th className="px-4 py-3 text-right">Other</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {auditData.dailyBreakdown.slice(0, 30).map(day => (
                                    <tr key={day.date} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-semibold text-slate-700">
                                            {format(parseISO(day.date), 'EEE, MMM dd, yyyy')}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600 font-mono">{day.count}</td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(day.sales)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(day.byMethod['Cash'] || 0)}</td>
                                        <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{formatCurrency(day.byMethod['Card'] || 0)}</td>
                                        <td className="px-4 py-3 text-right text-purple-600 tabular-nums">{formatCurrency(day.byMethod['Mobile Money'] || 0)}</td>
                                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                                            {formatCurrency((day.byMethod['Wallet'] || 0) + (day.byMethod['Bank Transfer'] || 0) + (day.byMethod['Split'] || 0))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Top Transactions & Recent Payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-500" />
                        Top 10 Transactions
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100">
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">Customer</th>
                                    <th className="px-3 py-2">Method</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {auditData.topTransactions.map(sale => (
                                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{sale.id.slice(-8)}</td>
                                        <td className="px-3 py-2 font-semibold text-slate-700">{sale.customerName || 'Walk-in'}</td>
                                        <td className="px-3 py-2">
                                            <span className="flex items-center gap-1.5">
                                                {getPaymentMethodIcon(sale.paymentMethod)}
                                                <span className="text-slate-600 text-xs">{sale.paymentMethod}</span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(sale.totalAmount || sale.total || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                        <Receipt size={18} className="text-amber-500" />
                        Recent Customer Payments
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100">
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Customer</th>
                                    <th className="px-3 py-2">Method</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {auditData.recentPayments.map(payment => (
                                    <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 text-slate-500">{format(parseISO(payment.date), 'MMM dd')}</td>
                                        <td className="px-3 py-2 font-semibold text-slate-700">{payment.customerName}</td>
                                        <td className="px-3 py-2 text-slate-600 text-xs">{payment.paymentMethod}</td>
                                        <td className="px-3 py-2 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(payment.amount)}</td>
                                    </tr>
                                ))}
                                {auditData.recentPayments.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic text-xs">No payments recorded</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesAudit;
