import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { format, parseISO, differenceInDays, subMonths } from 'date-fns';
import {
  Users, Printer, AlertTriangle, Clock, FileText, Eye,
  Search, X, ChevronDown, CreditCard, TrendingDown, TrendingUp,
  Building2, Phone, Mail
} from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';

interface AgingBucket {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
}

interface LedgerTransaction {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'POS_SALE';
  reference: string;
  description: string;
  subAccount: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
}

interface PreviewData {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  transactions: LedgerTransaction[];
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  aging: AgingBucket;
  totalOutstanding: number;
}

const ClientLedger: React.FC = () => {
  const { companyConfig } = useAuth();
  const { customers = [], customerPayments = [], sales = [] } = useSales();
  const { ledger = [], invoices = [] } = useFinance();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const currency = companyConfig?.currencySymbol || '$';
  const gl = companyConfig?.glMapping || {};
  const arAccId = gl.accountsReceivable || '1100';
  const companyName = companyConfig?.companyName || 'Prime ERP';

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSubAccountNames, setSelectedSubAccountNames] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<'all' | '3m' | '6m' | '12m'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const formatCurrency = useCallback((val: number) => {
    if (val === undefined || val === null || isNaN(val)) return `${currency}0.00`;
    return `${currency}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currency]);

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

  const dateCutoff = useMemo(() => {
    if (dateRange === 'all') return null;
    const months = { '3m': 3, '6m': 6, '12m': 12 }[dateRange];
    return subMonths(new Date(), months);
  }, [dateRange]);

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

    const customerSales = (sales || []).filter((sale: any) => {
      if (sale.customerId !== selectedCustomerId) return false;
      const totalAmount = sale.totalAmount || sale.total || 0;
      const paidAmount = sale.paidAmount || 0;
      return (totalAmount - paidAmount) > 0.01;
    });

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

    const totalOutstanding = aging.current + aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.over90;
    const totalPaid = customerPaymentRows.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const creditLimit = selectedCustomer?.creditLimit || 0;
    const creditUtilization = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;

    let customerLedgerEntries = ledger
      .filter((entry: any) => {
        const matchesCustomer = entry.customerId === selectedCustomerId;
        const matchesSubAccount = selectedSubAccountNames.length === 0 || selectedSubAccountNames.includes(entry.subAccountName || 'Main');
        return matchesCustomer && matchesSubAccount;
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (dateCutoff) {
      customerLedgerEntries = customerLedgerEntries.filter(
        (e: any) => new Date(e.date) >= dateCutoff
      );
    }

    let openingBalance = 0;
    if (dateCutoff) {
      const allEntriesBeforeCutoff = ledger
        .filter((entry: any) => {
          const matchesCustomer = entry.customerId === selectedCustomerId;
          const matchesSubAccount = selectedSubAccountNames.length === 0 || selectedSubAccountNames.includes(entry.subAccountName || 'Main');
          return matchesCustomer && matchesSubAccount && new Date(entry.date) < dateCutoff;
        })
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      allEntriesBeforeCutoff.forEach((entry: any) => {
        const isDebit = entry.debitAccountId === arAccId || entry.debitAccountId === '1100';
        const isCredit = entry.creditAccountId === arAccId || entry.creditAccountId === '1100';
        if (isDebit) openingBalance += entry.amount;
        if (isCredit) openingBalance -= entry.amount;
      });
    }

    let runningBalance = openingBalance;
    const entriesWithBalance = customerLedgerEntries.map((entry: any) => {
      const isDebit = entry.debitAccountId === arAccId || entry.debitAccountId === '1100';
      const isCredit = entry.creditAccountId === arAccId || entry.creditAccountId === '1100';

      if (isDebit) runningBalance += entry.amount;
      if (isCredit) runningBalance -= entry.amount;

      return { ...entry, balance: runningBalance, isDebit, isCredit };
    });

    const transactions: LedgerTransaction[] = [
      ...customerInvoices
        .filter((inv: any) => !dateCutoff || new Date(inv.date) >= dateCutoff)
        .map((inv: any) => ({
        id: inv.id,
        date: inv.date,
        type: 'INVOICE' as const,
        reference: inv.id,
        description: `Invoice #${inv.id}`,
        subAccount: inv.subAccountName || 'Main',
        debit: (inv.totalAmount || 0) - (inv.paidAmount || 0),
        credit: 0,
        balance: 0,
        status: inv.status
      })),
      ...customerPaymentRows
        .filter((p: any) => !dateCutoff || new Date(p.date) >= dateCutoff)
        .map((payment: any) => ({
        id: payment.id,
        date: payment.date,
        type: 'PAYMENT' as const,
        reference: payment.id,
        description: `Payment - ${payment.paymentMethod || 'Cash'}`,
        subAccount: payment.subAccountName || 'Main',
        debit: 0,
        credit: payment.amount || 0,
        balance: 0,
        status: 'Cleared'
      })),
      ...customerSales
        .filter((sale: any) => !dateCutoff || new Date(sale.date) >= dateCutoff)
        .map((sale: any) => ({
        id: sale.id,
        date: sale.date,
        type: 'POS_SALE' as const,
        reference: sale.id,
        description: `POS Sale #${sale.id}`,
        subAccount: sale.subAccountName || 'Main',
        debit: (sale.totalAmount || sale.total || 0) - (sale.paidAmount || 0),
        credit: 0,
        balance: 0,
        status: sale.status || 'Partial'
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let txRunningBalance = openingBalance;
    const transactionsWithBalance = transactions.map(tx => {
      txRunningBalance = txRunningBalance + tx.debit - tx.credit;
      return { ...tx, balance: txRunningBalance };
    });

    const totalDebits = transactionsWithBalance.reduce((s, t) => s + t.debit, 0);
    const totalCredits = transactionsWithBalance.reduce((s, t) => s + t.credit, 0);

    return {
      aging,
      totalOutstanding,
      totalPaid,
      creditUtilization,
      creditLimit,
      ledgerEntries: entriesWithBalance,
      transactions: transactionsWithBalance,
      invoiceCount: customerInvoices.length,
      paymentCount: customerPaymentRows.length,
      salesCount: customerSales.length,
      openingBalance,
      totalDebits,
      totalCredits
    };
  }, [selectedCustomerId, selectedSubAccountNames, invoices, customerPayments, sales, ledger, selectedCustomer, arAccId, dateCutoff]);

  const filteredLedgerEntries = useMemo(() => {
    if (!customerStats) return [];
    if (!searchQuery) return customerStats.ledgerEntries;
    const q = searchQuery.toLowerCase();
    return customerStats.ledgerEntries.filter((e: any) =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.referenceId || e.id || '').toLowerCase().includes(q)
    );
  }, [customerStats, searchQuery]);

  const getAgingColor = (days: number) => {
    if (days <= 0) return 'from-emerald-500 to-green-600';
    if (days <= 30) return 'from-blue-500 to-indigo-600';
    if (days <= 60) return 'from-amber-500 to-orange-500';
    if (days <= 90) return 'from-orange-500 to-red-500';
    return 'from-rose-600 to-red-700';
  };

  const getAgingLabel = (bucket: keyof AgingBucket) => {
    const labels: Record<keyof AgingBucket, string> = {
      current: 'Current',
      days1to30: '1-30 Days',
      days31to60: '31-60 Days',
      days61to90: '61-90 Days',
      over90: 'Over 90'
    };
    return labels[bucket];
  };

  const getAgingBg = (bucket: keyof AgingBucket) => {
    const bgs: Record<keyof AgingBucket, string> = {
      current: 'bg-emerald-50 border-emerald-200',
      days1to30: 'bg-blue-50 border-blue-200',
      days31to60: 'bg-amber-50 border-amber-200',
      days61to90: 'bg-orange-50 border-orange-200',
      over90: 'bg-rose-50 border-rose-200'
    };
    return bgs[bucket];
  };

  const getAgingTextColor = (bucket: keyof AgingBucket) => {
    const colors: Record<keyof AgingBucket, string> = {
      current: 'text-emerald-700',
      days1to30: 'text-blue-700',
      days31to60: 'text-amber-700',
      days61to90: 'text-orange-700',
      over90: 'text-rose-700'
    };
    return colors[bucket];
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s === 'paid' || s === 'cleared') return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-bold border border-emerald-200">Paid</span>;
    if (s === 'partial') return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[10px] font-bold border border-amber-200">Partial</span>;
    if (s === 'overdue') return <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[10px] font-bold border border-rose-200">Overdue</span>;
    if (s === 'cancelled' || s === 'voided') return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold border border-slate-200">Cancelled</span>;
    return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold border border-slate-200">{status}</span>;
  };

  const previewData = useMemo((): PreviewData | null => {
    if (!customerStats || !selectedCustomer) return null;
    return {
      customerName: selectedCustomer.name,
      customerEmail: selectedCustomer.email,
      customerPhone: selectedCustomer.phone,
      customerAddress: selectedCustomer.address,
      statementDate: format(new Date(), 'yyyy-MM-dd'),
      periodStart: dateCutoff ? format(dateCutoff, 'yyyy-MM-dd') : format(subMonths(new Date(), 12), 'yyyy-MM-dd'),
      periodEnd: format(new Date(), 'yyyy-MM-dd'),
      openingBalance: customerStats.openingBalance,
      transactions: customerStats.transactions,
      totalDebits: customerStats.totalDebits,
      totalCredits: customerStats.totalCredits,
      closingBalance: customerStats.totalOutstanding,
      aging: customerStats.aging,
      totalOutstanding: customerStats.totalOutstanding,
    };
  }, [customerStats, selectedCustomer, dateCutoff]);

  const renderPreviewModal = () => {
    if (!showPreview || !previewData) return null;
    const d = previewData;

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowPreview(false)}>
        <div
          className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          style={{ maxHeight: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
                <FileText size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Account Statement</h2>
                <p className="text-[10px] text-slate-500 font-medium">{d.customerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-[11px] font-bold transition-colors"
              >
                <Printer size={14} />
                Print
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 bg-white">
            <div className="max-w-4xl mx-auto">
              {/* Company Header */}
              <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-slate-100">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">{companyName}</h1>
                  <p className="text-sm text-slate-500 mt-1">Account Statement</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Statement Date</p>
                  <p className="text-sm font-bold text-slate-800">{format(parseISO(d.statementDate), 'MMMM dd, yyyy')}</p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-8 mb-8 p-5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Customer</p>
                  <h3 className="text-lg font-bold text-slate-900">{d.customerName}</h3>
                  {d.customerEmail && (
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                      <Mail size={13} /> {d.customerEmail}
                    </p>
                  )}
                  {d.customerPhone && (
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                      <Phone size={13} /> {d.customerPhone}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Statement Period</p>
                  <p className="text-sm font-semibold text-slate-700">
                    {format(parseISO(d.periodStart), 'MMM dd, yyyy')} — {format(parseISO(d.periodEnd), 'MMM dd, yyyy')}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Balance</p>
                    <p className={`text-lg font-black ${d.openingBalance >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(d.openingBalance)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="mb-8">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" />
                  Transaction History
                </h3>
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="py-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="py-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reference</th>
                      <th className="py-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                      <th className="py-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Debit (K)</th>
                      <th className="py-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Credit (K)</th>
                      <th className="py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Balance (K)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-slate-50 font-semibold">
                      <td className="py-2.5 pr-4 text-slate-600" colSpan={5}>Opening Balance</td>
                      <td className={`py-2.5 text-right font-black ${d.openingBalance >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatCurrency(d.openingBalance)}
                      </td>
                    </tr>
                    {d.transactions.map((tx, idx) => (
                      <tr key={`${tx.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 pr-4 text-slate-600 font-medium">{format(parseISO(tx.date), 'MMM dd, yyyy')}</td>
                        <td className="py-2.5 pr-4 font-mono text-slate-400 text-[11px]">{tx.reference.slice(-10)}</td>
                        <td className="py-2.5 pr-4">
                          <span className="font-semibold text-slate-700">{tx.description}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            tx.type === 'INVOICE' ? 'bg-blue-100 text-blue-700' :
                            tx.type === 'PAYMENT' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {tx.type === 'INVOICE' ? 'INV' : tx.type === 'PAYMENT' ? 'PAY' : 'POS'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-rose-600 tabular-nums">
                          {tx.debit > 0 ? formatCurrency(tx.debit) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-emerald-600 tabular-nums">
                          {tx.credit > 0 ? formatCurrency(tx.credit) : '—'}
                        </td>
                        <td className="py-2.5 text-right font-bold text-slate-900 tabular-nums">
                          {formatCurrency(tx.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td className="py-3 pr-4 text-slate-700" colSpan={3}>Period Totals</td>
                      <td className="py-3 pr-4 text-right text-rose-700 tabular-nums">{formatCurrency(d.totalDebits)}</td>
                      <td className="py-3 pr-4 text-right text-emerald-700 tabular-nums">{formatCurrency(d.totalCredits)}</td>
                      <td className="py-3 text-right text-slate-900 tabular-nums">{formatCurrency(d.closingBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Aging Summary */}
              <div className="border-t-2 border-slate-100 pt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  Aging Summary
                </h3>
                <div className="grid grid-cols-5 gap-3">
                  {(Object.keys(d.aging) as (keyof AgingBucket)[]).map(bucket => (
                    <div key={bucket} className={`p-3 rounded-xl border text-center ${getAgingBg(bucket)}`}>
                      <p className="text-[9px] font-bold uppercase tracking-wider mb-1">{getAgingLabel(bucket)}</p>
                      <p className={`text-sm font-black ${getAgingTextColor(bucket)} tabular-nums`}>
                        {formatCurrency(d.aging[bucket])}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl text-white flex justify-between items-center">
                  <p className="text-[11px] font-bold opacity-80 uppercase tracking-wider">Total Outstanding</p>
                  <p className="text-2xl font-black tabular-nums">{formatCurrency(d.totalOutstanding)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {renderPreviewModal()}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <Users size={16} className="text-white" />
            </div>
            Client Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-1 ml-10">Detailed receivables tracking and account statements</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCustomerId && customerStats && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm"
            >
              <Eye size={16} />
              Preview Statement
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Customer</label>
            <div className="relative">
              <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedSubAccountNames([]);
                }}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
              >
                <option value="">Select a customer</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Period</label>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              {([
                { value: 'all', label: 'All' },
                { value: '3m', label: '3 Months' },
                { value: '6m', label: '6 Months' },
                { value: '12m', label: '12 Months' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    dateRange === opt.value
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Sub-Accounts</label>
            <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center">
              {selectedCustomer?.subAccounts?.length > 0 ? (
                ['Main', ...selectedCustomer.subAccounts.map((s: any) => s.name)].map((sub: string) => (
                  <button
                    key={sub}
                    onClick={() => {
                      if (selectedSubAccountNames.includes(sub)) {
                        setSelectedSubAccountNames(selectedSubAccountNames.filter(s => s !== sub));
                      } else {
                        setSelectedSubAccountNames([...selectedSubAccountNames, sub]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                      selectedSubAccountNames.includes(sub)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sub}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic">Select a customer first</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {!selectedCustomerId && (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 mb-4">
            <Users size={32} className="text-slate-300" />
          </div>
          <p className="font-bold text-lg text-slate-700">Select a customer to view their ledger</p>
          <p className="text-sm text-slate-400 mt-1">Choose a customer from the dropdown above to see detailed receivables.</p>
        </div>
      )}

      {/* Customer Ledger Content */}
      {selectedCustomerId && customerStats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</p>
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 size={15} className="text-blue-600" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 truncate">{selectedCustomer?.name}</h3>
              <div className="flex items-center gap-3 mt-1.5">
                {selectedCustomer?.email && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                    <Mail size={11} /> {selectedCustomer.email}
                  </span>
                )}
                {selectedCustomer?.phone && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                    <Phone size={11} /> {selectedCustomer.phone}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</p>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  customerStats.totalOutstanding > 0 ? 'bg-rose-50' : 'bg-emerald-50'
                }`}>
                  <TrendingDown size={15} className={customerStats.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'} />
                </div>
              </div>
              <h3 className={`text-2xl font-black tabular-nums ${
                customerStats.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                {formatCurrency(customerStats.totalOutstanding)}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">{customerStats.invoiceCount} invoice{customerStats.invoiceCount !== 1 ? 's' : ''}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</p>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <TrendingUp size={15} className="text-emerald-600" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-emerald-600 tabular-nums">{formatCurrency(customerStats.totalPaid)}</h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">{customerStats.paymentCount} payment{customerStats.paymentCount !== 1 ? 's' : ''}</p>
            </div>

            <div className={`p-5 rounded-2xl shadow-lg ${
              customerStats.creditUtilization > 80 ? 'bg-gradient-to-br from-rose-600 to-rose-700 text-white' :
              customerStats.creditUtilization > 50 ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white' :
              'bg-gradient-to-br from-slate-800 to-slate-900 text-white'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold opacity-70 uppercase tracking-wider">Credit Limit</p>
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <CreditCard size={15} className="text-white" />
                </div>
              </div>
              <h3 className="text-2xl font-black tabular-nums">{formatCurrency(customerStats.creditLimit || 0)}</h3>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      customerStats.creditUtilization > 80 ? 'bg-white' :
                      customerStats.creditUtilization > 50 ? 'bg-white/80' :
                      'bg-white/60'
                    }`}
                    style={{ width: `${Math.min(customerStats.creditUtilization, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold opacity-80">{customerStats.creditUtilization.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Aging Breakdown */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock size={16} className="text-amber-500" />
                Receivables Aging
              </h3>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                Total: {formatCurrency(customerStats.totalOutstanding)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(Object.keys(customerStats.aging) as (keyof AgingBucket)[]).map(bucket => (
                <div key={bucket} className={`p-4 rounded-xl border text-center transition-all hover:shadow-md ${getAgingBg(bucket)}`}>
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${getAgingTextColor(bucket)}`}>
                    {getAgingLabel(bucket)}
                  </p>
                  <p className={`text-lg font-black mt-1.5 tabular-nums ${getAgingTextColor(bucket)}`}>
                    {formatCurrency(customerStats.aging[bucket])}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Ledger Statement */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                Ledger Statement
                <span className="text-[10px] font-medium text-slate-400 ml-2">
                  ({customerStats.openingBalance !== 0 ? `Opening: ${formatCurrency(customerStats.openingBalance)}` : ''})
                </span>
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                <span>{customerStats.ledgerEntries.length} entries</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-200 bg-slate-50">
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
                  {customerStats.openingBalance !== 0 && (
                    <tr className="bg-slate-50/50 font-semibold">
                      <td className="px-4 py-2.5 text-slate-500 text-xs" colSpan={4}>Opening Balance</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums" colSpan={2}></td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                        customerStats.openingBalance >= 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {formatCurrency(customerStats.openingBalance)}
                      </td>
                    </tr>
                  )}
                  {filteredLedgerEntries.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-medium text-[13px] whitespace-nowrap">
                        {format(parseISO(entry.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">{entry.description}</span>
                          {entry.type && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              entry.type === 'INVOICE' || (entry.isDebit && !entry.isCredit)
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {entry.type === 'INVOICE' || (entry.isDebit && !entry.isCredit) ? 'DR' : 'CR'}
                            </span>
                          )}
                        </div>
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
                  {filteredLedgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <FileText size={24} className="opacity-40" />
                          <p className="font-semibold">No ledger entries found</p>
                          <p className="text-xs">Try adjusting the filters or search query</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredLedgerEntries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                      <td className="px-4 py-3 text-xs font-bold text-slate-500" colSpan={4}>Closing Balance</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums">
                        {formatCurrency(customerStats.totalDebits)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(customerStats.totalCredits)}
                      </td>
                      <td className={`px-4 py-3 text-right font-black text-base tabular-nums ${
                        customerStats.totalOutstanding >= 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {formatCurrency(customerStats.totalOutstanding)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientLedger;
