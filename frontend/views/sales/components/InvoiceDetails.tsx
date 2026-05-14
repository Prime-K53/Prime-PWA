
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, CheckCircle, Clock, DollarSign, Printer, Edit2, Download,
    FileText, ArrowRight, History, Trash2,
    AlertTriangle, Plus, CreditCard, FileCheck as PaymentIcon,
    ChevronRight, Send, ExternalLink, TrendingUp, BarChart3, Zap, Lock, RefreshCw, Ban, Truck, Eye, Percent, User, Wallet
} from 'lucide-react';
import { Invoice, CustomerPayment, InvoiceAllocation } from '../../../types';
import { useData } from '../../../context/DataContext';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import TransactionPricingInsights from './TransactionPricingInsights';

interface InvoiceDetailsProps {
    invoice: Invoice;
    onClose: () => void;
    onEdit: (inv: Invoice) => void;
    onAction: (inv: Invoice, action: string) => void;
}

export const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({ invoice: initialInvoice, onClose, onEdit, onAction }) => {
    const {
        companyConfig, customerPayments = [], invoices = [], deliveryNotes = [],
        ledger = [], accounts = [], auditLogs = [], customers = [],
        updateCustomerPayment, updateInvoice, notify, addCustomerPayment
    } = useData();

    const { handlePreview } = useDocumentPreview();
    const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || '$';

    const invoice = useMemo(() =>
        invoices.find(i => i.id === initialInvoice.id) || initialInvoice
        , [invoices, initialInvoice]);

    // Properly check for recurring/subscription invoice by verifying frequency exists and has a valid value
    const isSubscription = invoice.frequency != null &&
                          invoice.frequency !== '' &&
                          typeof invoice.frequency !== 'undefined';
    const isExaminationInvoice = String((invoice as any).originModule || (invoice as any).origin_module || '').toLowerCase() === 'examination'
        || String((invoice as any).documentTitle || (invoice as any).document_title || '').toLowerCase().includes('examination invoice')
        || String((invoice as any).reference || '').toUpperCase().startsWith('EXM-BATCH-');
    
    // Debug logging to help verify invoice type detection - Removed due to console spam
    
    const docTitle = 'Invoice';

    const [activeTab, setActiveTab] = useState<'Overview' | 'Financials' | 'Payments' | 'Activity'>('Overview');
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const isCancelled = invoice.status === 'Cancelled';
    const balanceDue = isCancelled ? 0 : (invoice.totalAmount || 0) - (invoice.paidAmount || 0);
    const totalAmountDisplay = isCancelled ? 0 : (invoice.totalAmount || 0);
    const paidAmountDisplay = isCancelled ? 0 : (invoice.paidAmount || 0);
    const isPaid = balanceDue <= 0.001;

    const hasDeliveryNote = useMemo(() =>
        (deliveryNotes || []).some(dn => dn.invoiceId === invoice.id)
        , [deliveryNotes, invoice.id]);

    const handleStatusOverride = async (newStatus: string) => {
        setIsUpdatingStatus(true);
        try {
            if (newStatus === 'Paid' && !isPaid) {
                // LOGIC LINK: "Force Paid" must generate financial history.
                const paymentId = `PAY-FORCE-${Date.now().toString().slice(-4)}`;
                const payment: CustomerPayment = {
                    id: paymentId,
                    date: new Date().toISOString(),
                    customerName: invoice.customerName,
                    amount: balanceDue,
                    paymentMethod: 'Cash',
                    reference: `Manual Override for INV #${invoice.id}`,
                    status: 'Cleared',
                    allocations: [{ invoiceId: invoice.id, amount: balanceDue }],
                    notes: 'System forced payment override.',
                    // Fix: Added missing reconciled property to match CustomerPayment interface
                    reconciled: false
                };
                await addCustomerPayment(payment);
                notify(`Payment record ${paymentId} generated and posted to Ledger.`, "success");
            } else {
                await updateInvoice({ ...invoice, status: newStatus as any });
                notify(`Invoice status manually updated to ${newStatus}`, "info");
            }
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleAllocateCredit = async (payment: CustomerPayment) => {
        const amountToAllocate = Math.min(payment.creditApplied || 0, balanceDue);
        if (amountToAllocate <= 0) return;

        const newAllocation: InvoiceAllocation = { invoiceId: invoice.id, amount: amountToAllocate };
        const updatedPayment: CustomerPayment = { ...payment, allocations: [...(payment.allocations || []), newAllocation], creditApplied: (payment.creditApplied || 0) - amountToAllocate };

        try {
            await updateCustomerPayment(updatedPayment);
            notify(`${currency}${amountToAllocate} allocated from Payment #${payment.id}`, 'success');
            setShowAllocationModal(false);
        } catch (err: any) {
            notify(err?.message || 'Credit allocation blocked. Void and re-post payment for financial changes.', 'error');
        }
    };

    const paymentHistory = useMemo(() => {
        return (customerPayments || []).filter(payment =>
            payment.allocations && payment.allocations.some((a: any) => a.invoiceId === invoice.id)
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [customerPayments, invoice.id]);

    const availableCredits = useMemo(() => {
        return (customerPayments || []).filter(payment =>
            payment.customerName === invoice.customerName &&
            (payment.creditApplied || 0) > 0.01 &&
            payment.status === 'Cleared'
        );
    }, [customerPayments, invoice.customerName]);

    // Compute total outstanding across all unpaid invoices for this customer
    const totalCustomerOutstanding = useMemo(() => {
        return (invoices || [])
            .filter((inv: any) =>
                inv.customerName === invoice.customerName &&
                !['Paid', 'Cancelled', 'Void', 'Draft'].includes(String(inv.status || ''))
            )
            .reduce((sum: number, inv: any) => {
                const due = Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));
                return sum + due;
            }, 0);
    }, [invoices, invoice.customerName]);

    const enrichedInvoice = useMemo(() => ({
        ...invoice,
        totalCustomerOutstanding,
    }), [invoice, totalCustomerOutstanding]);

    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200/60 font-sans text-[13px] leading-relaxed text-slate-800">

                <div className="px-[16px] py-[12px] border-b border-slate-100 bg-slate-50/50 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-4 mb-1">
                            <h2 className="text-[22px] font-semibold text-slate-800 tracking-tight">{docTitle} #{invoice.id}</h2>
                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-sm">
                                <div className={`w-2 h-2 rounded-full ${invoice.status === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
                                <span className="text-[12.5px] font-semibold text-slate-600 tracking-wide">{invoice.status}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-[12.5px] font-medium text-slate-500 tracking-wide">
                            <button
                                onClick={() => navigate('/sales-flow/customers', { state: { customerId: invoice.customerId } })}
                                className="hover:text-blue-600 transition-colors flex items-center gap-1 group"
                            >
                                {invoice.customerName}
                                <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                            <span className="text-slate-200">•</span>
                            <span>Ref: {invoice.jobOrderId || 'Retail'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2 no-print items-center">
                        {!hasDeliveryNote && (
                            <button
                                onClick={() => onAction(invoice, 'generate_dn')}
                                className="px-[12px] py-[7px] bg-blue-600 text-white rounded-lg text-[13px] font-semibold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                            >
                                <Truck size={16} /> Generate delivery note
                            </button>
                        )}
                        <button onClick={() => handlePreview(isSubscription ? 'SUBSCRIPTION' : (isExaminationInvoice ? 'EXAMINATION_INVOICE' : 'INVOICE'), enrichedInvoice)} className="p-2 hover:bg-blue-50 bg-blue-50/30 border border-blue-200/60 rounded-lg text-blue-600 transition-all shadow-sm" title="Preview PDF">
                            <Eye size={18} />
                        </button>
                        <button onClick={() => onAction(invoice, 'download_pdf')} className="p-2 hover:bg-blue-50 bg-blue-50/30 border border-blue-200/60 rounded-lg text-blue-600 transition-all shadow-sm" title="Download PDF">
                            <Download size={18} />
                        </button>
                        <button onClick={() => window.print()} className="p-2 hover:bg-white bg-slate-100/50 border border-slate-200/60 rounded-lg text-slate-600 transition-all shadow-sm" title="Print">
                            <Printer size={18} />
                        </button>
                        <button onClick={() => onEdit(invoice)} className="p-2 hover:bg-white bg-slate-100/50 border border-slate-200/60 rounded-lg text-slate-600 transition-all shadow-sm" title="Edit">
                            <Edit2 size={18} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded-lg transition-all ml-2">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-3 bg-white border-b border-slate-100 shrink-0">
                    <div className="p-4 text-center border-r border-slate-100">
                        <p className="text-[12.5px] font-medium text-slate-500 tracking-wide mb-0.5">Gross billing</p>
                        <p className="text-[20px] font-semibold text-slate-800 tabular-nums">{currency}{totalAmountDisplay.toLocaleString()}</p>
                    </div>
                    <div className="p-4 text-center border-r border-slate-100">
                        <p className="text-[12.5px] font-medium text-slate-500 tracking-wide mb-0.5">Payments</p>
                        <p className="text-[20px] font-semibold text-emerald-600 tabular-nums">{currency}{paidAmountDisplay.toLocaleString() || '0.00'}</p>
                    </div>
                    <div className="p-4 text-center">
                        <p className="text-[12.5px] font-medium text-slate-500 tracking-wide mb-0.5">Net balance</p>
                        <p className={`text-[20px] font-semibold tabular-nums ${(balanceDue || 0) > 0.001 ? 'text-rose-600' : 'text-slate-300'}`}>{currency}{(balanceDue || 0).toLocaleString()}</p>
                    </div>
                </div>

                <nav className="flex border-b border-slate-100 px-8 bg-white shrink-0 overflow-x-auto no-scrollbar">
                    {['Overview', 'Financials', 'Payments', 'Activity'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-5 py-[8px] text-[13px] font-semibold tracking-wide border-b-2 transition-all shrink-0 ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </nav>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-100 custom-scrollbar">
                    {activeTab === 'Overview' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* Functional Overrides & Management */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 space-y-6">
                                    {(invoice as any).isConverted && (invoice as any).conversionDetails && (
                                        <div className="bg-white p-5 rounded-[1.25rem] border border-slate-200 shadow-sm">
                                            <h3 className="text-[12.5px] font-semibold text-slate-500 tracking-wide mb-4 flex items-center gap-2">
                                                <History size={14} className="text-purple-600" /> Conversion History
                                            </h3>
                                            <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100/60">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 p-1.5 bg-white rounded-lg border border-purple-100 text-purple-600 shadow-sm">
                                                        <RefreshCw size={14} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-slate-800">
                                                            Converted from <span className="text-purple-700">{(invoice as any).conversionDetails.sourceType} {(invoice as any).conversionDetails.sourceNumber}</span>
                                                        </p>
                                                        <div className="mt-1 flex items-center gap-3 text-[12.5px] text-slate-500">
                                                            <span className="flex items-center gap-1.5">
                                                                <Clock size={12} />
                                                                {new Date((invoice as any).conversionDetails.date).toLocaleString()}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                            <span className="flex items-center gap-1.5">
                                                                <User size={12} />
                                                                {(invoice as any).conversionDetails.acceptedBy}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white p-5 rounded-[1.25rem] border border-slate-200 shadow-sm">
                                        <h3 className="text-[12.5px] font-semibold text-slate-500 tracking-wide mb-4 flex items-center gap-2">
                                            <History size={14} className="text-blue-500" /> System audit trail
                                        </h3>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-[12.5px] font-medium text-slate-500">Created on</span>
                                                <span className="text-[13px] font-semibold text-slate-700 tabular-nums">{new Date(invoice.date).toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-[12.5px] font-medium text-slate-500">Last modified</span>
                                                <span className="text-[13px] font-semibold text-slate-700 tabular-nums">{new Date((invoice as any).updatedAt || invoice.date).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-[1.25rem] border border-slate-200 shadow-sm space-y-3">
                                    <h3 className="text-[12.5px] font-semibold text-slate-500 tracking-wide flex items-center gap-2">
                                        <Zap size={14} className="text-amber-500" /> Quick actions
                                    </h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            onClick={() => navigate('/sales-flow/payments', { state: { action: 'create', customer: invoice.customerName, customerId: invoice.customerId, invoiceId: invoice.id } })}
                                            className="w-full px-[12px] py-[7px] bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            <PaymentIcon size={14} /> Record payment
                                        </button>
                                        {!isSubscription && (
                                            <button
                                                onClick={() => onAction(invoice, 'convert_to_recurring')}
                                                className="w-full px-[12px] py-[7px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw size={14} /> Convert to recurring
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleStatusOverride('Paid')}
                                            disabled={isUpdatingStatus || isPaid}
                                            className="w-full px-[12px] py-[7px] bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-emerald-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isUpdatingStatus ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Force paid
                                        </button>
                                        <button
                                            onClick={() => handleStatusOverride('Cancelled')}
                                            disabled={isUpdatingStatus || isCancelled}
                                            className="w-full px-[12px] py-[7px] bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-rose-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            <Ban size={14} />
                                            Void invoice
                                        </button>
                                    </div>
                                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-start gap-2">
                                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                        <p className="text-[12px] text-amber-800 leading-normal font-medium">
                                            Manual overrides bypass validation but generate full financial logs.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Financials' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <TransactionPricingInsights transaction={invoice} currencySymbol={currency} />

                            <div className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 tracking-tight text-[13.5px]">
                                        <BarChart3 size={18} className="text-blue-600" /> General ledger entries
                                    </h3>
                                    <span className="text-[12px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">Real-time sync</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[13px]">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 tracking-wide">Date</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 tracking-wide">Account</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 tracking-wide">Description</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 tracking-wide text-right">Debit</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 tracking-wide text-right">Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {ledger.filter(entry => entry.reference === invoice.id).length > 0 ? (
                                                ledger.filter(entry => entry.reference === invoice.id).map((entry, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-6 py-4 font-semibold text-slate-600 tabular-nums">{new Date(entry.date).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 font-semibold text-blue-600">{entry.accountName}</td>
                                                        <td className="px-6 py-4 text-slate-500">{entry.description}</td>
                                                        <td className="px-6 py-4 text-right font-semibold text-slate-700 tabular-nums">
                                                            {entry.type === 'Debit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-semibold text-slate-700 tabular-nums">
                                                            {entry.type === 'Credit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic font-medium">No ledger entries found for this invoice.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Payments' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 uppercase tracking-tight text-[13.5px]">
                                        <CreditCard size={18} className="text-emerald-600" /> Payment History
                                    </h3>
                                    <button
                                        onClick={() => navigate('/sales-flow/payments', { state: { action: 'create', customer: invoice.customerName, customerId: invoice.customerId, invoiceId: invoice.id } })}
                                        className="text-[12.5px] font-semibold text-emerald-600 uppercase flex items-center gap-1 hover:underline"
                                    >
                                        New Payment <ArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[13px]">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 uppercase tracking-wide">Payment #</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 uppercase tracking-wide text-right">Allocated</th>
                                                <th className="px-6 py-[8px] font-semibold text-slate-500 uppercase tracking-wide text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paymentHistory.map(payment => (
                                                <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4 font-semibold text-slate-600 tabular-nums">{new Date(payment.date).toLocaleDateString()}</td>
                                                    <td className="px-6 py-4 font-semibold text-blue-600">{payment.id}</td>
                                                    <td className="px-6 py-4 font-semibold text-slate-700">{payment.paymentMethod}</td>
                                                    <td className="px-6 py-4 text-right font-semibold text-emerald-600 tabular-nums">
                                                        {currency}{(payment.allocations?.find(a => a.invoiceId === invoice.id)?.amount || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-2 py-0.5 rounded-md text-[12px] font-semibold uppercase tracking-tight ${payment.status === 'Cleared' ? 'bg-emerald-100 text-emerald-700' :
                                                            payment.status === 'Bounced' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                                            }`}>
                                                            {payment.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {paymentHistory.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-medium">No payments recorded yet.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Activity' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 uppercase tracking-tight text-[13.5px]">
                                        <History size={18} className="text-indigo-600" /> Detailed Audit Trail
                                    </h3>
                                </div>
                                <div className="p-5 space-y-3">
                                    {auditLogs.filter(log => log.entityId === invoice.id).length > 0 ? (
                                        auditLogs.filter(log => log.entityId === invoice.id)
                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map(log => (
                                                <div key={log.id} className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-600' :
                                                        log.action === 'UPDATE' ? 'bg-blue-100 text-blue-600' :
                                                            log.action === 'VOID' ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500'
                                                        }`}>
                                                        {log.action === 'CREATE' ? <Plus size={14} /> :
                                                            log.action === 'UPDATE' ? <Edit2 size={14} /> : <Trash2 size={14} />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-[12.5px] font-semibold text-slate-800 uppercase tracking-wide">{log.action} {log.entityType}</span>
                                                            <span className="text-[12px] font-medium text-slate-400 tabular-nums">{new Date(log.date).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-[13px] text-slate-600 leading-relaxed">{log.details}</p>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className="text-[12px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase">{log.userId}</span>
                                                            <span className="text-[12px] font-medium text-slate-400 uppercase tracking-tight">{log.userRole}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                    ) : (
                                        <div className="p-10 text-center text-slate-400 italic font-medium">No activity recorded in the logs.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {showAllocationModal && (
                    <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-[1.25rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 border border-slate-200/60 font-sans text-[13px] leading-relaxed text-slate-800">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-semibold text-slate-700 flex items-center gap-2 uppercase tracking-tight text-[13.5px]"><Wallet size={18} className="text-emerald-600" /> Apply Customer Credits</h3>
                                <button onClick={() => setShowAllocationModal(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
                            </div>
                            <div className="p-5 max-h-[50vh] overflow-y-auto space-y-2 custom-scrollbar">
                                {availableCredits.map(payment => (
                                    <div key={payment.id} onClick={() => handleAllocateCredit(payment)} className="flex justify-between items-center p-4 border border-slate-100 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all cursor-pointer group bg-white shadow-sm">
                                        <div>
                                            <div className="font-semibold text-slate-700 text-[13.5px]">Payment #{payment.id}</div>
                                            <div className="text-[12px] text-slate-400 uppercase font-medium mt-0.5 tabular-nums">Found: {new Date(payment.date).toLocaleDateString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[16px] font-semibold text-emerald-600 group-hover:scale-105 transition-transform tabular-nums">{currency}{(payment.creditApplied || 0).toLocaleString()}</div>
                                            <div className="text-[12px] font-medium text-slate-300 uppercase tracking-tighter">Avail. Fund</div>
                                        </div>
                                    </div>
                                ))}
                                {availableCredits.length === 0 && (
                                    <div className="p-10 text-center text-slate-400 font-medium italic">No available credits for this client.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
