import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, User, Mail, Phone, MapPin, CreditCard, FileText,
  Globe, Building, Truck, Plus, Trash2, Edit2,
  TrendingUp, AlertTriangle, Clock, CheckCircle,
  DollarSign, ArrowLeft, MoreHorizontal, Download,
  ExternalLink, Calendar, MessageSquare, History,
  PieChart, Settings, FileSearch, Paperclip,
  Briefcase, ShieldAlert, BadgeCheck, FileDown,
  ChevronDown,
  RefreshCw,
  FileBarChart,
  Eye
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import { StatementDoc } from '../../shared/components/PDF/schemas';
import { Customer, Invoice, CustomerPayment, Sale, Quotation, AuditLogEntry } from '../../../types';
import { useSales } from '../../../context/SalesContext';
import { useFinance } from '../../../context/FinanceContext';
import { useAuth } from '../../../context/AuthContext';
import { useData, REFRESH_INTERVAL } from '../../../context/DataContext';
import { useModuleRefresh } from '../../../hooks/useModuleRefresh';
import { format, parseISO, isAfter } from 'date-fns';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import AICustomerInsights from '../../../components/ai/AICustomerInsights';

interface CustomerWorkspaceProps {
  customer: Customer;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
}

export const CustomerWorkspace: React.FC<CustomerWorkspaceProps> = ({ customer, onBack, onEdit }) => {
  const navigate = useNavigate();
  const { invoices, ledger, accounts, walletTransactions } = useFinance();
  const { refreshAllData } = useData();
  
  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const { customerPayments = [], sales, quotations, updateCustomer } = useSales();
  const { addAuditLog, companyConfig, auditLogs, notify } = useAuth();
  const currency = companyConfig?.currencySymbol || '$';

  const [activeTab, setActiveTab] = useState<'Overview' | 'Timeline' | 'Invoices' | 'Payments' | 'Ledger' | 'Accounting' | 'Wallet' | 'Documents' | 'Settings' | 'Security Audit'>('Overview');
  const [accountMenu, setAccountMenu] = useState<{ id: string, type: 'debit' | 'credit', x: number, y: number } | null>(null);
  const [viewingAccountId, setViewingAccountId] = useState<string | null>(null);

  // Memoized transactions for viewingAccountId
  const accountTransactions = useMemo(() => {
    if (!viewingAccountId) return [];
    return (ledger || []).filter(entry =>
      (entry.debitAccountId === viewingAccountId || entry.creditAccountId === viewingAccountId) &&
      (entry.customerId === customer.id || entry.description?.includes(customer.name))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [viewingAccountId, ledger, customer]);

  // Ledger Filters
  const [ledgerStartDate, setLedgerStartDate] = useState<string>('');
  const [ledgerEndDate, setLedgerEndDate] = useState<string>('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'All' | 'Invoice' | 'Payment'>('All');
  const [ledgerSubAccountFilter, setLedgerSubAccountFilter] = useState<string>('All');

  // UI State for placeholders
  const [isTransactionMenuOpen, setIsTransactionMenuOpen] = useState(false);
  const [isReminderSent, setIsReminderSent] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementPdfUrl, setStatementPdfUrl] = useState<string | null>(null);

  // Filter data for this customer
  const customerInvoices = useMemo(() =>
    invoices.filter(inv => inv.customerId === customer.id || inv.customerName === customer.name),
    [invoices, customer]);

  const customerPaymentsList = useMemo(() =>
    customerPayments.filter(payment => payment.customerName === customer.name),
    [customerPayments, customer]);

  const customerSales = useMemo(() =>
    sales.filter(s => s.customerId === customer.id || s.customerName === customer.name),
    [sales, customer]);

  const customerQuotes = useMemo(() =>
    quotations.filter(q => q.customerName === customer.name),
    [quotations, customer]);

  const customerLogs = useMemo(() =>
    auditLogs.filter(log => log.entityId === customer.id || (log.details && log.details.includes(customer.name))),
    [auditLogs, customer]);

  const customerLedger = useMemo(() =>
    (ledger || []).filter(entry => entry.customerId === customer.id || entry.description?.includes(customer.name)),
    [ledger, customer]);

  const customerWalletTransactions = useMemo(() =>
    (walletTransactions || []).filter(tx => tx.customerId === customer.id),
    [walletTransactions, customer]);

  // KPIs
  const kpis = useMemo(() => {
    const totalInvoiced = customerInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = customerInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const overdueBalance = customerInvoices
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled' && isAfter(new Date(), parseISO(inv.dueDate)))
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    const ytdSales = customerInvoices
      .filter(inv => new Date(inv.date).getFullYear() === new Date().getFullYear())
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    const lastInvoice = customerInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    return {
      balance: customer.balance || 0,
      overdueBalance,
      creditLimit: customer.creditLimit || 0,
      outstandingBalance: customerInvoices
        .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled')
        .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0),
      ytdSales,
      lastInvoiceTotal: lastInvoice?.totalAmount || 0,
      lastInvoiceDate: lastInvoice?.date || null
    };
  }, [customer, customerInvoices]);

  const { openingBalance, ledgerEntries } = useMemo(() => {
    // Combine invoices and payments into a chronological ledger
    const allEntries = [
      ...customerInvoices.map(inv => ({
        date: inv.date,
        id: inv.id,
        memo: inv.memo || 'Invoice',
        totalAmount: inv.totalAmount,
        subAccountId: inv.subAccountId,
        type: 'Invoice'
      })),
      ...customerPaymentsList.map(payment => ({
        date: payment.date,
        id: payment.id,
        memo: payment.memo || 'Customer Payment',
        amount: payment.amount,
        subAccountId: payment.subAccountId,
        type: 'Payment'
      }))
    ]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance for ALL entries first to get correct opening balance
    let balance = 0;
    const entriesWithBalance = allEntries.map(entry => {
      const debit = 'totalAmount' in entry ? entry.totalAmount : 0;
      const credit = 'amount' in entry ? entry.amount : 0;
      balance += (debit - credit);

      const accountName = entry.subAccountId ?
        customer.subAccounts?.find(s => s.id === entry.subAccountId)?.name : 'Main Account';

      return {
        ...entry,
        debit,
        credit,
        runningBalance: balance,
        accountName
      };
    });

    const startDate = ledgerStartDate ? parseISO(ledgerStartDate) : null;
    const endDate = ledgerEndDate ? parseISO(ledgerEndDate) : null;

    // Opening balance is the balance of the last entry before the start date
    const lastEntryBeforeStart = startDate
      ? entriesWithBalance.filter(e => parseISO(e.date) < startDate).pop()
      : null;
    const openingBal = lastEntryBeforeStart ? lastEntryBeforeStart.runningBalance : 0;

    const filtered = entriesWithBalance.filter(item => {
      const date = parseISO(item.date);
      const isAfterStart = !startDate || date >= startDate;
      const isBeforeEnd = !endDate || date <= endDate;

      const matchesType = ledgerTypeFilter === 'All' ||
        (ledgerTypeFilter === 'Invoice' && item.type === 'Invoice') ||
        (ledgerTypeFilter === 'Payment' && item.type === 'Payment');

      const matchesAccount = ledgerSubAccountFilter === 'All' ||
        (ledgerSubAccountFilter === 'Main' && !item.subAccountId) ||
        (item.subAccountId === ledgerSubAccountFilter);

      return isAfterStart && isBeforeEnd && matchesType && matchesAccount;
    });

    return { openingBalance: openingBal, ledgerEntries: filtered };
  }, [customerInvoices, customerPaymentsList, ledgerStartDate, ledgerEndDate, ledgerTypeFilter, ledgerSubAccountFilter, customer.subAccounts]);

  const handleExportLedger = () => {
    const headers = ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit', 'Balance'];
    const rows = ledgerEntries.map(entry => {
      const labeledEntry = entry as typeof entry & { debit: number; credit: number; runningBalance: number; accountName: string };
      return [
        labeledEntry.date,
        labeledEntry.id,
        labeledEntry.memo,
        labeledEntry.subAccountId ? (customer.subAccounts?.find(s => s.id === labeledEntry.subAccountId)?.name || 'Sub-account') : 'Main Account',
        labeledEntry.debit || 0,
        labeledEntry.credit || 0,
        labeledEntry.runningBalance || 0
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledger_${customer.name}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewStatement = async () => {
    try {
      const statementData: StatementDoc = {
        date: new Date().toLocaleDateString('en-GB'),
        customerName: customer.name,
        startDate: ledgerStartDate || 'All Time',
        endDate: ledgerEndDate || 'Present',
        currency: currency,
        openingBalance,
        transactions: ledgerEntries.map(e => ({
          date: format(parseISO(e.date), 'dd/MM/yyyy'),
          reference: e.id,
          memo: e.memo || (e.type === 'Invoice' ? 'Invoice Payment' : 'Payment'),
          debit: e.debit || 0,
          credit: e.credit || 0,
          runningBalance: e.runningBalance
        })),
        totalInvoiced: ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0),
        totalReceived: ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0),
        finalBalance: ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : openingBalance,
      };

      const securedStatementData = await attachDocumentSecurity(statementData, companyConfig?.companyName);
      await initializePrimePdfFonts();
      const blob = await pdf(<PrimeDocument type="ACCOUNT_STATEMENT" data={securedStatementData as StatementDoc} />).toBlob();
      const url = URL.createObjectURL(blob);
      setStatementPdfUrl(url);
      setIsStatementModalOpen(true);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate statement preview.");
    }
  };

  const toggleCreditHold = async () => {
    try {
      const newVal = !customer.creditHold;
      await updateCustomer({ ...customer, creditHold: newVal });
      await addAuditLog({ action: newVal ? 'HOLD' : 'RELEASE', entityType: 'Customer', entityId: customer.id, details: `Credit hold ${newVal ? 'placed' : 'released'} by user` } as any);
      notify(`Credit ${newVal ? 'hold placed' : 'hold released'} for ${customer.name}`, 'success');
    } catch (err: any) {
      notify(`Failed to update credit hold: ${err?.message || err}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Top Header/Action Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-100">
              {customer.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">{customer.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${customer.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  customer.status === 'Suspended' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                    customer.status === 'VIP' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                      customer.status === 'Prospect' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                  {customer.status}
                </span>
                {customer.segment && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                    {customer.segment}
                  </span>
                )}
                {(customer as any).pipelineStage && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                    {(customer as any).pipelineStage}
                  </span>
                )}
                {(customer as any).leadSource && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                    Source: {(customer as any).leadSource}
                  </span>
                )}
                {customer.creditHold && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 animate-pulse">
                    <ShieldAlert size={12} />
                    Credit Hold
                  </span>
                )}
              </div>
              <p className="text-slate-500 font-medium">Customer ID: {customer.id} • {customer.category || 'Standard Client'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(customer)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-all text-[13px]"
          >
            <Edit2 size={16} />
            Edit Profile
          </button>
          <AICustomerInsights
            customer={customer}
            invoices={(invoices || []).filter((i: any) => i.customerId === customer.id || i.customerName === customer.name)}
            payments={(customerPayments || []).filter((p: any) => p.customerName === customer.name)}
          />
          <button
            onClick={toggleCreditHold}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold text-[13px] ${customer.creditHold ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            {customer.creditHold ? <ShieldAlert size={16} /> : <ShieldAlert size={16} />}
            {customer.creditHold ? 'Release Hold' : 'Place on Hold'}
          </button>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <div className="relative">
            <button
              onClick={() => setIsTransactionMenuOpen(!isTransactionMenuOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 text-[13px]"
            >
              <Plus size={16} />
              New Transaction
            </button>
            {isTransactionMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-30 animate-in fade-in zoom-in-95 origin-top-right">
                <button
                  onClick={() => { alert('Opening New Invoice form...'); setIsTransactionMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <FileText size={16} className="text-slate-400" />
                  New Invoice
                </button>
                <button
                  onClick={() => {
                    navigate('/sales-flow/payments', {
                      state: {
                        action: 'create',
                        customer: customer.name,
                        customerId: customer.id
                      }
                    });
                    setIsTransactionMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <DollarSign size={16} className="text-slate-400" />
                  New Payment
                </button>
                <button
                  onClick={() => { alert('Opening New Quotation form...'); setIsTransactionMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <FileSearch size={16} className="text-slate-400" />
                  New Quotation
                </button>
              </div>
            )}
          </div>
          <div className="relative group">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
              <MoreHorizontal size={20} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-top-right">
              <button
                onClick={() => alert('Generating Price List...')}
                className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <TrendingUp size={16} className="text-slate-400" />
                Customer Price List
              </button>
              <div className="h-px bg-slate-100 my-1" />
              <button
                onClick={() => {
                  setIsReminderSent(true);
                  setTimeout(() => setIsReminderSent(false), 3000);
                }}
                className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <Clock size={16} className={isReminderSent ? "text-emerald-500" : "text-slate-400"} />
                {isReminderSent ? "Reminder Sent!" : "Send Reminder"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* KPI Dashboard Row */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Balance</span>
              <DollarSign size={16} className="text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 finance-nums">
              {currency}{kpis.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              <TrendingUp size={12} />
              Good Standing
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overdue Balance</span>
              <AlertTriangle size={16} className="text-rose-500" />
            </div>
            <div className={`text-2xl font-bold finance-nums ${kpis.overdueBalance > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {currency}{kpis.overdueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Based on {customerInvoices.filter(i => i.status === 'Overdue').length} invoices</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Credit Limit</span>
              <BadgeCheck size={16} className="text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 finance-nums">
              {currency}{kpis.creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${(kpis.balance / kpis.creditLimit) > 0.8 ? 'bg-rose-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min((kpis.balance / kpis.creditLimit) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {Math.round((kpis.balance / kpis.creditLimit) * 100)}% Utilized
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outstanding</span>
              <Clock size={16} className="text-amber-500" />
            </div>
            <div className={`text-2xl font-bold ${kpis.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-900'} finance-nums`}>
              {currency}{(kpis.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Open invoices and unpaid amounts</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">YTD Purchases</span>
              <TrendingUp size={16} className="text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 finance-nums">
              {currency}{kpis.ytdSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">FY {new Date().getFullYear()}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white sticky top-[65px] z-10">
          <div className="flex items-center gap-8">
            {(['Overview', 'Timeline', 'Invoices', 'Payments', 'Ledger', 'Accounting', 'Wallet', 'Documents', 'Settings', 'Security Audit'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-[13px] font-bold transition-all border-b-2 relative ${activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                {tab}
                {tab === 'Invoices' && customerInvoices.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px]">
                    {customerInvoices.length}
                  </span>
                )}
                {tab === 'Accounting' && customerLedger.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px]">
                    {customerLedger.length}
                  </span>
                )}
                {tab === 'Wallet' && customerWalletTransactions.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px]">
                    {customerWalletTransactions.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'Overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Details */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <User size={18} className="text-blue-600" />
                      Client Profile
                    </h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <Mail size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Email Address</p>
                          <p className="font-semibold text-slate-700">{customer.email || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <Phone size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Phone Number</p>
                          <p className="font-semibold text-slate-700">{customer.phone || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <Globe size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Website</p>
                          <p className="font-semibold text-slate-700">{customer.website || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Billing Address</p>
                          <p className="font-semibold text-slate-700 whitespace-pre-line">{customer.billingAddress || customer.address || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <Briefcase size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Account Manager</p>
                          <p className="font-semibold text-slate-700">{customer.assignedSalesperson || 'Unassigned'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <MessageSquare size={18} className="text-blue-600" />
                      Client Notes
                    </h3>
                  </div>
                  <div className="p-6">
                    <p className="text-slate-600 whitespace-pre-line leading-relaxed">
                      {customer.notes || 'No notes available for this client.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sidebar Stats */}
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <PieChart size={18} className="text-blue-600" />
                      Financial Health
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Avg. Payment Days</span>
                      <span className="font-bold text-slate-900">{customer.avgPaymentDays || 12} Days</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Profitability Score</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${customer.profitabilityScore || 85}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-900">{customer.profitabilityScore || 85}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Risk Profile</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-100 uppercase">Low Risk</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <History size={18} className="text-blue-600" />
                      Recent Activity
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {customerLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="flex gap-3">
                        <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <div>
                          <p className="text-[12.5px] font-semibold text-slate-700">{log.details}</p>
                          <p className="text-[11px] text-slate-400">{format(parseISO(log.date), 'MMM dd, yyyy HH:mm')}</p>
                        </div>
                      </div>
                    ))}
                    {customerLogs.length === 0 && (
                      <p className="text-center py-4 text-slate-400 italic">No recent activity logs.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Timeline' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-4xl mx-auto">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Unified History Feed</h3>
              <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {[...customerInvoices, ...customerPaymentsList, ...customerSales, ...customerQuotes]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((item: any, idx) => (
                    <div key={item.id + idx} className="relative flex items-center justify-between md:justify-start md:odd:flex-row-reverse group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-500 shadow transition-all z-10 shrink-0">
                        {item.totalAmount !== undefined ? <FileText size={18} /> : <DollarSign size={18} />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white group-hover:border-blue-200 transition-all shadow-sm ml-6">
                        <div className="flex items-center justify-between mb-1">
                          <time className="font-bold text-blue-600 text-[11px] uppercase">{format(parseISO(item.date), 'MMM dd, yyyy')}</time>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${item.status === 'Paid' || item.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' :
                            item.status === 'Unpaid' || item.status === 'Overdue' ? 'bg-rose-50 text-rose-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="text-slate-900 font-bold mb-1">
                          {item.totalAmount !== undefined
                            ? (item.source === 'POS' || item.id?.startsWith('POS-') || item.cashierId
                              ? <span className="flex items-center gap-2">POS Sale #{item.id}<span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">POS</span></span>
                              : `Invoice #${item.id}`)
                            : `Payment Received #${item.id}`}
                        </div>
                        <div className="text-slate-500 text-[12px] font-medium">
                          {item.totalAmount !== undefined ?
                            `Invoiced amount: ${currency}${item.totalAmount.toLocaleString()}` :
                            `Received amount: ${currency}${item.amount.toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'Invoices' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Invoice #</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Status</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Total</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Balance</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customerInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(inv.date), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{inv.id}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' :
                          inv.status === 'Overdue' ? 'bg-rose-50 text-rose-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 finance-nums">
                        {currency}{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600 finance-nums">
                        {currency}{(inv.totalAmount - (inv.paidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                            <Download size={16} />
                          </button>
                          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Payments' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Payment #</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Method</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Reference</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Amount</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customerPaymentsList.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(p.date), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{p.id}</td>
                      <td className="px-6 py-4 font-semibold text-slate-600">{p.paymentMethod}</td>
                      <td className="px-6 py-4 font-medium text-slate-500">{p.reference || 'N/A'}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600 finance-nums">
                        {currency}{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Settings size={18} className="text-blue-600" />
                    Billing Settings
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Payment Terms</span>
                    <span className="font-bold text-slate-900">{customer.paymentTerms || 'Net 30'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Default Currency</span>
                    <span className="font-bold text-slate-900">{customer.currency || 'USD'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Truck size={18} className="text-blue-600" />
                    Shipping & Logistics
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Shipping Address</p>
                      <p className="font-semibold text-slate-700 whitespace-pre-line">{customer.shippingAddress || customer.address || 'Same as billing'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-600 font-medium">Auto-Send Statements</span>
                    <span className="font-bold text-slate-900">Enabled (Monthly)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Security Audit' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden flex flex-col h-[600px]">
              <AuditTimeline 
                logs={customerLogs} 
                title={`Security Audit: ${customer.name}`}
                subtitle="Immutable trail of all modifications to this client profile."
              />
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Paperclip size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">No Documents Uploaded</h3>
                <p className="text-slate-500 mb-6 max-w-xs mx-auto">Upload contracts, purchase orders, or ID documents for this customer.</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setIsUploading(true);
                      setTimeout(() => {
                        setIsUploading(false);
                        alert('Document uploaded successfully!');
                      }, 2000);
                    }}
                    disabled={isUploading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Upload Document'}
                  </button>
                  <button
                    onClick={() => {
                      const url = prompt('Enter folder URL (Google Drive, Dropbox, etc.):');
                      if (url) alert(`Folder linked: ${url}`);
                    }}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 transition-all"
                  >
                    Link Shared Folder
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <FileText size={18} className="text-blue-600" />
                      Generated Reports
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded shadow-sm text-blue-600">
                            <FileText size={16} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">Account Statement Template</p>
                            <p className="text-[11px] text-slate-500 font-medium">Standard financial summary format</p>
                          </div>
                        </div>
                        <button
                          onClick={handlePreviewStatement}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[11px] opacity-0 group-hover:opacity-100 transition-all"
                        >
                          Generate
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded shadow-sm text-emerald-600">
                            <TrendingUp size={16} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">Sales Performance Report</p>
                            <p className="text-[11px] text-slate-500 font-medium">Customer purchase history & trends</p>
                          </div>
                        </div>
                        <button
                          onClick={() => alert('Generating Sales Report...')}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-[11px] opacity-0 group-hover:opacity-100 transition-all"
                        >
                          Generate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Settings size={18} className="text-blue-600" />
                      Document Settings
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <label className="flex items-center justify-between p-2 hover:bg-slate-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Auto-attach Invoices to Statement</span>
                      <input type="checkbox" name="autoAttachInvoices" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" defaultChecked />
                    </label>
                    <label className="flex items-center justify-between p-2 hover:bg-slate-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Email Monthly Statement</span>
                      <input type="checkbox" name="emailMonthlyStatement" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </label>
                    <label className="flex items-center justify-between p-2 hover:bg-slate-50 rounded transition-colors cursor-pointer">
                      <span className="font-medium text-slate-700">Include Sub-accounts in Ledger</span>
                      <input type="checkbox" name="includeSubAccounts" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" defaultChecked />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Ledger' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="font-bold text-slate-900">Transaction Ledger</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1">
                      <Calendar size={14} className="text-slate-400" />
                      <input
                        type="date"
                        name="ledgerStartDate"
                        value={ledgerStartDate}
                        onChange={(e) => setLedgerStartDate(e.target.value)}
                        className="text-[11px] font-semibold text-slate-700 outline-none bg-transparent"
                      />
                      <span className="text-slate-300">-</span>
                      <input
                        type="date"
                        name="ledgerEndDate"
                        value={ledgerEndDate}
                        onChange={(e) => setLedgerEndDate(e.target.value)}
                        className="text-[11px] font-semibold text-slate-700 outline-none bg-transparent"
                      />
                    </div>

                    <select
                      name="ledgerTypeFilter"
                      value={ledgerTypeFilter}
                      onChange={(e) => setLedgerTypeFilter(e.target.value as any)}
                      className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="All">All Types</option>
                      <option value="Invoice">Invoices</option>
                      <option value="Payment">Payments</option>
                    </select>

                    {customer.subAccounts && customer.subAccounts.length > 0 && (
                      <select
                        name="ledgerSubAccountFilter"
                        value={ledgerSubAccountFilter}
                        onChange={(e) => setLedgerSubAccountFilter(e.target.value)}
                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="All">All Accounts</option>
                        <option value="Main">Main Account</option>
                        {customer.subAccounts.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </select>
                    )}

                    <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

                    <button
                      onClick={handleExportLedger}
                      className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 transition-all text-[11px]"
                      title="Export to CSV"
                    >
                      <Download size={14} />
                      Export
                    </button>

                    <button
                      onClick={handlePreviewStatement}
                      className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg text-blue-600 font-bold hover:bg-blue-50 transition-all text-[11px]"
                      title="Download PDF Statement"
                    >
                      <FileDown size={14} />
                      PDF Statement
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Type</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider">Ref #</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Debit</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Credit</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[11px] tracking-wider text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      <tr className="bg-blue-50/30">
                        <td colSpan={6} className="px-6 py-3 font-bold text-slate-500">Opening Balance</td>
                        <td className="px-6 py-3 text-right font-bold text-slate-900 finance-nums">{currency}0.00</td>
                      </tr>
                      {ledgerEntries.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(row.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4 font-semibold text-slate-600">{row.type}</td>
                          <td className="px-6 py-4 font-medium text-slate-500 text-[11px]">{row.accountName}</td>
                          <td className="px-6 py-4 font-bold text-slate-900">{row.id}</td>
                          <td className="px-6 py-4 text-right text-rose-600 finance-nums">{row.debit > 0 ? `${currency}${row.debit.toLocaleString()}` : '-'}</td>
                          <td className="px-6 py-4 text-right text-emerald-600 finance-nums">{row.credit > 0 ? `${currency}${row.credit.toLocaleString()}` : '-'}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 finance-nums">{currency}{row.runningBalance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Accounting' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Account Actions Menu (Floating) */}
              {accountMenu && (
                <div
                  className="fixed z-[200] bg-white rounded-xl shadow-2xl border border-slate-200 py-2 w-56 animate-in fade-in zoom-in-95 duration-200"
                  style={{ top: accountMenu.y + 8, left: accountMenu.x }}
                  onMouseLeave={() => setAccountMenu(null)}
                >
                  <div className="px-4 py-2 border-b border-slate-50 mb-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Actions</p>
                    <p className="text-[11px] font-bold text-slate-900 truncate">
                      {accounts.find(a => a.id === accountMenu.id || a.code === accountMenu.id)?.name || accountMenu.id}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setViewingAccountId(accountMenu.id);
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Eye size={14} className="text-blue-500" />
                    View Account Activity
                  </button>
                  <button
                    onClick={() => {
                      notify('Full Account Details feature is under development', 'info');
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <CreditCard size={14} className="text-slate-400" />
                    Account Details & Settings
                  </button>
                  <button
                    onClick={() => {
                      navigate('/accounts/chart-of-accounts', { state: { accountId: accountMenu.id } });
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <ExternalLink size={14} className="text-slate-400" />
                    Go to Chart of Accounts
                  </button>
                  <button
                    onClick={() => {
                      navigate('/sales-flow/payments', {
                        state: {
                          action: 'create',
                          customer: customer.name,
                          customerId: customer.id,
                          subAccount: accounts.find(a => a.id === accountMenu.id || a.code === accountMenu.id)?.name || 'Main',
                          preferredAccount: accountMenu.id
                        }
                      });
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <DollarSign size={14} className="text-emerald-500" />
                    Record Customer Payment
                  </button>
                  <button
                    onClick={() => {
                      notify('Internal Transfer feature is under development', 'info');
                      setAccountMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RefreshCw size={14} className="text-blue-500" />
                    Internal Transfer
                  </button>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <History size={18} className="text-blue-600" />
                    General Ledger Postings
                  </h3>
                  <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-widest">Double Entry View</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Debit Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Credit Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {customerLedger.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">{format(parseISO(entry.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{entry.description}</div>
                              {entry.referenceId && (
                                <button
                                  onClick={() => {
                                    const isPayment = entry.referenceId?.startsWith('RCP') || entry.referenceId?.startsWith('PAY');
                                    const isInvoice = entry.referenceId?.startsWith('INV');
                                    if (isPayment) navigate('/sales-flow/payments', { state: { paymentId: entry.referenceId } });
                                    else if (isInvoice) navigate('/sales-flow/invoices', { state: { invoiceId: entry.referenceId } });
                                  }}
                                  className="p-1 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded transition-colors"
                                  title="View Source Transaction"
                                >
                                  <ExternalLink size={10} />
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">Ref: {entry.referenceId || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setAccountMenu({ id: entry.debitAccountId, type: 'debit', x: rect.left, y: rect.bottom });
                                }}
                                className="text-[11px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-blue-100 transition-colors"
                              >
                                {accounts.find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId)?.name || entry.debitAccountId}
                                <ChevronDown size={10} className="opacity-40" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setAccountMenu({ id: entry.creditAccountId, type: 'credit', x: rect.left, y: rect.bottom });
                                }}
                                className="text-[11px] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-rose-100 transition-colors"
                              >
                                {accounts.find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId)?.name || entry.creditAccountId}
                                <ChevronDown size={10} className="opacity-40" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-slate-900 finance-nums">{currency}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      {customerLedger.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No general ledger entries found for this customer.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Wallet' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Wallet Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-2xl shadow-lg shadow-emerald-100 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <CreditCard size={24} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Current Balance</span>
                  </div>
                  <div className="text-3xl font-black finance-nums">
                    {currency}{(customer.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-[11px] font-bold mt-2 opacity-80 uppercase tracking-tight">Available for purchases</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Deposits</span>
                    <Plus size={16} className="text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 finance-nums">
                    {currency}{customerWalletTransactions.filter(t => t.type === 'Deposit').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">Lifetime contributions</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Spent</span>
                    <TrendingUp size={16} className="text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 finance-nums">
                    {currency}{customerWalletTransactions.filter(t => t.type === 'Deduction').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">Used for payments</p>
                </div>
              </div>

              {/* Wallet Transactions Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <History size={18} className="text-emerald-600" />
                    Wallet Activity History
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Type</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Sub-Account</th>
                        <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {customerWalletTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">{format(parseISO(tx.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${tx.type === 'Deposit' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900">{tx.description}</td>
                          <td className="px-6 py-4 text-slate-500 font-medium">{tx.subAccountName || 'Main'}</td>
                          <td className={`px-6 py-4 text-right font-black finance-nums ${tx.type === 'Deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'Deposit' ? '+' : '-'}{currency}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {customerWalletTransactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No wallet activity found for this customer.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Activity Modal */}
      {viewingAccountId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    {accounts.find(a => a.id === viewingAccountId || a.code === viewingAccountId)?.name || viewingAccountId} Activity
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                    Ledger Transactions for {customer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingAccountId(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Date</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Description</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Reference</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Debit</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {accountTransactions.map((entry, idx) => {
                    const isDebit = entry.debitAccountId === viewingAccountId;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap text-[12px]">
                          {format(parseISO(entry.date), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 text-[12px]">{entry.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-medium text-slate-400">#{entry.referenceId || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 finance-nums text-[12px]">
                          {isDebit ? `${currency}${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-rose-600 finance-nums text-[12px]">
                          {!isDebit ? `${currency}${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {accountTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No transactions found for this account in the current context.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex gap-4">
                <div className="text-[11px] font-bold">
                  <span className="text-slate-400 uppercase tracking-widest mr-2">Total Debit:</span>
                  <span className="text-emerald-600 finance-nums">
                    {currency}{accountTransactions
                      .filter(t => t.debitAccountId === viewingAccountId)
                      .reduce((sum, t) => sum + t.amount, 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[11px] font-bold">
                  <span className="text-slate-400 uppercase tracking-widest mr-2">Total Credit:</span>
                  <span className="text-rose-600 finance-nums">
                    {currency}{accountTransactions
                      .filter(t => t.creditAccountId === viewingAccountId)
                      .reduce((sum, t) => sum + t.amount, 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingAccountId(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-[12px] hover:bg-slate-800 transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement Preview Modal */}
      {isStatementModalOpen && statementPdfUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                Statement Preview
              </h3>
              <button
                onClick={() => setIsStatementModalOpen(false)}
                className="p-2 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
                title="Close Preview"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 bg-slate-100 p-4 overflow-hidden">
              <iframe
                src={statementPdfUrl}
                className="w-full h-full rounded-lg shadow-sm border border-slate-300 bg-white"
                title="Statement Preview"
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3">
              <button
                onClick={() => setIsStatementModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <a
                href={statementPdfUrl}
                download={`Statement_${customer.name}_${format(new Date(), 'yyyy-MM-dd')}.pdf`}
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md shadow-blue-100 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={18} />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
