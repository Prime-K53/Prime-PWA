import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Users, Printer, AlertTriangle, Clock, FileText } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';

interface AgingBucket {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
}

const ClientLedger: React.FC = () => {
    const {
        customers = [], ledger = [], invoices = [], customerPayments = [],
        sales = [], companyConfig
    } = useData();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const currency = companyConfig?.currencySymbol || '$';
    const gl = companyConfig?.glMapping || {};
    const arAccId = gl.accountsReceivable || '1100';

    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedSubAccountNames, setSelectedSubAccountNames] = useState<string[]>([]);

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null || isNaN(val)) return `${currency}0.00`;
        return `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const selectedCustomer = useMemo(() => {
        return customers.find(c => c.id === selectedCustomerId);
    }, [customers, selectedCustomerId]);

    useEffect(() => {
        const routeState = (location.state as { customerId?: string; selectedId?: string; customerName?: string } | null) || null;
        const queryCustomerId = String(searchParams.get('customerId') || '').trim();
        const stateCustomerId = String(routeState?.customerId || routeState?.selectedId || '').trim();
        const stateCustomerName = String(routeState?.customerName || '').trim();

        let nextCustomerId = queryCustomerId || stateCustomerId;
        if (!nextCustomerId && stateCustomerName) {
            nextCustomerId = customers.find(c => c.name === stateCustomerName)?.id || '';
        }

        if (nextCustomerId && customers.some(c => c.id === nextCustomerId) && nextCustomerId !== selectedCustomerId) {
            setSelectedCustomerId(nextCustomerId);
            setSelectedSubAccountNames([]);
        }
    }, [searchParams, location.state, customers, selectedCustomerId]);

    useEffect(() => {
        if (!selectedCustomerId) return;
        if (customers.some(c => c.id === selectedCustomerId)) return;
        setSelectedCustomerId('');
        setSelectedSubAccountNames([]);
    }, [customers, selectedCustomerId]);

    const customerStats = useMemo(() => {
        if (!selectedCustomerId) return null;

        const customerInvoices = (invoices || []).filter((invoice: any) => {
            if (invoice.customerId !== selectedCustomerId) return false;
            if (selectedSubAccountNames.length === 0) return true;
            return selectedSubAccountNames.includes(invoice.subAccountName || 'Main');
        });
        const customerPaymentRows = (customerPayments || []).filter((payment: any) => {
            if (payment.customerId !== selectedCustomerId) return false;
            if (selectedSubAccountNames.length === 0) return true;
            return selectedSubAccountNames.includes(payment.subAccountName || 'Main');
        });

        // Get POS sales with outstanding balances for this customer
        const customerSales = (sales || []).filter((sale: any) => {
            if (sale.customerId !== selectedCustomerId) return false;
            // Only include sales with outstanding balances (credit sales)
            const totalAmount = sale.totalAmount || sale.total || 0;
            const paidAmount = sale.paidAmount || 0;
            const outstanding = totalAmount - paidAmount;
            return outstanding > 0.01; // Has outstanding balance
        });

        // Calculate aging
        const now = new Date();
        const aging: AgingBucket = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };

        customerInvoices
            .filter((i: any) => i.status !== 'Paid' && i.status !== 'Cancelled')
            .forEach((inv: any) => {
                const invoiceDate = inv.dueDate || inv.date;
                const days = differenceInDays(now, parseISO(invoiceDate));
                const balance = (inv.totalAmount || 0) - (inv.paidAmount || 0);

                if (days <= 0) aging.current += balance;
                else if (days <= 30) aging.days1to30 += balance;
                else if (days <= 60) aging.days31to60 += balance;
                else if (days <= 90) aging.days61to90 += balance;
                else aging.over90 += balance;
            });

        // Add POS sales with outstanding balances to aging
        customerSales.forEach((sale: any) => {
            const saleDate = sale.date;
            const days = differenceInDays(now, parseISO(saleDate));
            const totalAmount = sale.totalAmount || sale.total || 0;
            const paidAmount = sale.paidAmount || 0;
            const balance = totalAmount - paidAmount;

            if (days <= 0) aging.current += balance;
            else if (days <= 30) aging.days1to30 += balance;
            else if (days <= 60) aging.days31to60 += balance;
            else if (days <= 90) aging.days61to90 += balance;
            else aging.over90 += balance;
        });

        // Total outstanding
        const totalOutstanding = aging.current + aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.over90;

        // Total paid
        const totalPaid = customerPaymentRows.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

        // Credit utilization
        const creditLimit = selectedCustomer?.creditLimit || 0;
        const creditUtilization = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;

        // Create unified transaction list (invoices + sales + payments)
        const unifiedTransactions: any[] = [
            ...customerInvoices.map((inv: any) => ({
                ...inv,
                transactionType: 'Invoice',
                transactionDate: inv.date,
                description: `Invoice #${inv.id}`,
                amount: inv.totalAmount || 0,
                balance: (inv.totalAmount || 0) - (inv.paidAmount || 0),
                status: inv.status
            })),
            ...customerSales.map((sale: any) => ({
                ...sale,
                transactionType: 'POS Sale',
                transactionDate: sale.date,
                description: `POS Sale #${sale.id}`,
                amount: sale.totalAmount || sale.total || 0,
                balance: (sale.totalAmount || sale.total || 0) - (sale.paidAmount || 0),
                status: sale.status || 'Partial'
            })),
            ...customerPaymentRows.map((payment: any) => ({
                ...payment,
                transactionType: 'Payment',
                transactionDate: payment.date,
                description: `Payment - ${payment.paymentMethod || 'Cash'}`,
                amount: -(payment.amount || 0), // Negative for payments
                balance: 0,
                status: 'Cleared'
            }))
        ].sort((a: any, b: any) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

        // Ledger entries
        const customerLedgerEntries = ledger
            .filter((entry: any) => {
                const matchesCustomer = entry.customerId === selectedCustomerId;
                const matchesSubAccount = selectedSubAccountNames.length === 0 || selectedSubAccountNames.includes(entry.subAccountName || 'Main');
                return matchesCustomer && matchesSubAccount;
            })
            .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = 0;
        const entriesWithBalance = customerLedgerEntries.map((entry: any) => {
            const isDebit = entry.debitAccountId === arAccId || entry.debitAccountId === '1100';
            const isCredit = entry.creditAccountId === arAccId || entry.creditAccountId === '1100';

            if (isDebit) runningBalance += entry.amount;
            if (isCredit) runningBalance -= entry.amount;

            return { ...entry, balance: runningBalance, isDebit, isCredit };
        });

        return {
            aging,
            totalOutstanding,
            totalPaid,
            creditUtilization,
            ledgerEntries: entriesWithBalance,
            unifiedTransactions,
            invoiceCount: customerInvoices.length,
            paymentCount: customerPaymentRows.length,
            salesCount: customerSales.length
        };
    }, [selectedCustomerId, selectedSubAccountNames, invoices, customerPayments, sales, ledger, selectedCustomer, arAccId]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Customer Selection */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[300px]">
                        <label className="text-[11px] font-bold text-slate-400 tracking-widest uppercase block mb-2">Select Customer</label>
                        <select
                            value={selectedCustomerId}
                            onChange={(e) => {
                                setSelectedCustomerId(e.target.value);
                                setSelectedSubAccountNames([]);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="">-- Choose a customer --</option>
                            {customers.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedCustomer?.subAccounts && selectedCustomer.subAccounts.length > 0 && (
                        <div className="flex-1 min-w-[250px]">
                            <label className="text-[11px] font-bold text-slate-400 tracking-widest uppercase block mb-2">Filter Sub-Accounts</label>
                            <div className="flex flex-wrap gap-2">
                                {['Main', ...selectedCustomer.subAccounts.map((s: any) => s.name)].map((sub: string) => (
                                    <button
                                        key={sub}
                                        onClick={() => {
                                            if (selectedSubAccountNames.includes(sub)) {
                                                setSelectedSubAccountNames(selectedSubAccountNames.filter(s => s !== sub));
                                            } else {
                                                setSelectedSubAccountNames([...selectedSubAccountNames, sub]);
                                            }
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                            selectedSubAccountNames.includes(sub)
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => window.print()}
                        className="p-3 bg-slate-100 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    >
                        <Printer size={20} />
                    </button>
                </div>
            </div>

            {/* Empty State */}
            {!selectedCustomerId && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Users size={48} className="mb-4 opacity-20" />
                    <p className="font-semibold text-lg">Select a customer to view their ledger</p>
                    <p className="text-sm mt-1">Choose a customer from the dropdown above</p>
                </div>
            )}

            {/* Customer Details */}
            {selectedCustomerId && customerStats && (
                <>
                    {/* Customer Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Customer</p>
                            <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedCustomer?.name}</h3>
                            <p className="text-xs text-slate-500 mt-1">{selectedCustomer?.email || selectedCustomer?.phone || 'No contact info'}</p>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Total Outstanding</p>
                            <h3 className={`text-2xl font-black mt-1 tabular-nums ${customerStats.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {formatCurrency(Math.abs(customerStats.totalOutstanding))}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">{customerStats.invoiceCount} invoices</p>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Total Paid</p>
                            <h3 className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">{formatCurrency(customerStats.totalPaid)}</h3>
                            <p className="text-xs text-slate-500 mt-1">{customerStats.paymentCount} payments</p>
                        </div>

                        <div className={`p-5 rounded-2xl shadow-lg ${
                            customerStats.creditUtilization > 80 ? 'bg-gradient-to-br from-rose-600 to-rose-700 text-white' :
                            customerStats.creditUtilization > 50 ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white' :
                            'bg-gradient-to-br from-slate-800 to-slate-900 text-white'
                        }`}>
                            <p className="text-[11px] font-bold opacity-70 tracking-widest uppercase">Credit Limit</p>
                            <h3 className="text-2xl font-black mt-1 tabular-nums">{formatCurrency(selectedCustomer?.creditLimit || 0)}</h3>
                            <p className="text-xs opacity-70 mt-1">
                                {customerStats.creditUtilization.toFixed(0)}% utilized
                                {customerStats.creditUtilization > 80 && <AlertTriangle size={12} className="inline ml-1" />}
                            </p>
                        </div>
                    </div>

                    {/* Aging Breakdown */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
                            <Clock size={18} className="text-amber-500" />
                            Receivables Aging
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="p-4 bg-emerald-50 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Current</p>
                                <p className="text-lg font-black text-emerald-700 mt-1 tabular-nums">{formatCurrency(customerStats.aging.current)}</p>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">1-30 Days</p>
                                <p className="text-lg font-black text-blue-700 mt-1 tabular-nums">{formatCurrency(customerStats.aging.days1to30)}</p>
                            </div>
                            <div className="p-4 bg-amber-50 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">31-60 Days</p>
                                <p className="text-lg font-black text-amber-700 mt-1 tabular-nums">{formatCurrency(customerStats.aging.days31to60)}</p>
                            </div>
                            <div className="p-4 bg-orange-50 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">61-90 Days</p>
                                <p className="text-lg font-black text-orange-700 mt-1 tabular-nums">{formatCurrency(customerStats.aging.days61to90)}</p>
                            </div>
                            <div className="p-4 bg-rose-50 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Over 90</p>
                                <p className="text-lg font-black text-rose-700 mt-1 tabular-nums">{formatCurrency(customerStats.aging.over90)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Ledger Statement */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                                <FileText size={18} className="text-blue-500" />
                                Ledger Statement
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100 bg-slate-50">
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Description</th>
                                        <th className="px-4 py-3">Reference</th>
                                        <th className="px-4 py-3">Sub-Account</th>
                                        <th className="px-4 py-3 text-right">Debit (+)</th>
                                        <th className="px-4 py-3 text-right">Credit (-)</th>
                                        <th className="px-4 py-3 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {customerStats.ledgerEntries.map((entry: any) => (
                                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-slate-500 font-medium">{format(parseISO(entry.date), 'MMM dd, yyyy')}</td>
                                            <td className="px-4 py-3">
                                                <span className="font-semibold text-slate-700">{entry.description}</span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.referenceId || entry.id?.slice(-8)}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">{entry.subAccountName || 'Main'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-rose-600 tabular-nums">
                                                {entry.isDebit ? formatCurrency(entry.amount) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">
                                                {entry.isCredit ? formatCurrency(entry.amount) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                                {formatCurrency(entry.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                    {customerStats.ledgerEntries.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center text-slate-400 italic">
                                                No ledger entries found for this customer
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ClientLedger;
