
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Banknote as PaymentIcon, Plus, Trash2, X, Search, Calendar, Eye, Mail, ArrowRight, AlertTriangle, Wallet, MoreVertical, Building2, Undo2, Printer, Edit2, FileText, Download, Loader2, ExternalLink, BarChart3, FileBarChart, RefreshCw } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useFinance } from '../../context/FinanceContext';
import { OFFLINE_MODE, DEFAULT_ACCOUNTS } from '../../constants';
import { CustomerPayment, InvoiceAllocation, Sale, Invoice, SupplierPayment, PurchaseAllocation, LedgerEntry, WalletTransaction } from '../../types';
import { useLocation, useNavigate } from 'react-router-dom';
import { useHighlight } from '../../hooks/useHighlight';
import { DocLink } from '../../components/DocLink';
import { generateNextId, roundFinancial } from '../../utils/helpers';
import { useProcurement } from '../../context/ProcurementContext';
import { useBankingStore } from '../../context/BankingContext';
import { api } from '../../services/api';
import { paymentService } from '../../services/paymentService';
import { PreviewModal } from '../shared/components/PDF/PreviewModal';
import { dbService } from '../../services/db';
import { ReceiptSchema, PosReceiptSchema, SupplierPaymentSchema } from '../shared/components/PDF/schemas';
import {
    buildCustomerReceiptDoc,
    buildPosReceiptDoc,
    buildSupplierPaymentDoc
} from '../../services/receiptCalculationService';

/**
 * Customer Payment Hover Card
 */
const CustomerPaymentHoverCard: React.FC<{
    pos: { x: number, y: number },
    payment: CustomerPayment
}> = ({ pos, payment }) => {
    const { companyConfig } = useData();
    const currency = companyConfig.currencySymbol;

    return (
        <div
            className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
            style={{ top: pos.y + 10, left: pos.x + 10 }}
        >
            <div className="bg-[#000D1A]/95 backdrop-blur-md border border-white/20 rounded-2xl shadow-premium p-4 min-w-[200px] flex flex-col gap-3">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-white">
                        <PaymentIcon size={16} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-tight">Payment Note</p>
                        <p className="text-xs font-bold text-white font-mono">{payment.id}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Customer</span>
                        <span className="text-white font-bold truncate max-w-[120px]">{payment.customerName}</span>
                    </div>
                    {payment.subAccountName && (
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-400 font-bold uppercase tracking-tight">Account</span>
                            <span className="text-blue-400 font-bold truncate max-w-[120px]">{payment.subAccountName}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Amount</span>
                        <span className="text-emerald-400 font-bold finance-nums">{currency}{payment.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Method</span>
                        <span className="text-blue-400 font-bold">{payment.paymentMethod}</span>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-[9px] text-slate-300 font-bold uppercase tracking-tight italic font-mono">Live Secure Ledger</span>
                </div>
            </div>
        </div>
    );
};

/**
 * Supplier Payment Hover Card
 */
const SupplierPaymentHoverCard: React.FC<{
    pos: { x: number, y: number },
    payment: SupplierPayment
}> = ({ pos, payment }) => {
    const { companyConfig, suppliers = [] } = useData();
    const currency = companyConfig.currencySymbol;
    const supplier = suppliers.find(s => s.id === payment.supplierId);

    return (
        <div
            className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
            style={{ top: pos.y + 10, left: pos.x + 10 }}
        >
            <div className="bg-[#000D1A]/95 backdrop-blur-md border border-white/20 rounded-2xl shadow-premium p-4 min-w-[200px] flex flex-col gap-3">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                        <Wallet size={16} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tight">Supplier Payment</p>
                        <p className="text-xs font-bold text-white font-mono">{payment.id}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Supplier</span>
                        <span className="text-white font-bold truncate max-w-[120px]">{supplier?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Amount</span>
                        <span className="text-emerald-400 font-bold finance-nums">{currency}{payment.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-tight">Method</span>
                        <span className="text-blue-400 font-bold">{payment.paymentMethod}</span>
                    </div>
                    {payment.reference && (
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-400 font-bold uppercase tracking-tight">Ref</span>
                            <span className="text-white font-medium truncate max-w-[120px]">{payment.reference}</span>
                        </div>
                    )}
                </div>

                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-[9px] text-slate-300 font-bold uppercase tracking-tight italic font-mono">Ledger Verified</span>
                </div>
            </div>
        </div>
    );
};

interface SupplierDetailPanelProps {
    payment: SupplierPayment | null;
    onClose: () => void;
    onVoid: (id: string) => void;
}

const SupplierDetailPanel: React.FC<SupplierDetailPanelProps> = ({ payment, onClose, onVoid }) => {
    const { suppliers = [], companyConfig } = useData();
    const currency = companyConfig.currencySymbol;

    if (!payment) return null;

    const supplier = suppliers.find(s => s.id === payment.supplierId);

    return (
        <div className="fixed top-0 right-0 w-[450px] h-full bg-white shadow-2xl z-[120] border-l border-slate-200 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">Payment Details</h2>
                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">{payment.id}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { if (confirm("Void this supplier payment?")) onVoid(payment.id); }}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all">
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Amount Paid</label>
                        <p className="text-3xl font-black text-slate-900 finance-nums">{currency}{payment.amount.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${payment.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            payment.status === 'Voided' ? 'bg-red-50 text-red-700 border-red-100' :
                                'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                            {payment.status}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Supplier</label>
                        <p className="font-semibold text-slate-900 text-[13px]">{supplier?.name || 'Unknown'}</p>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Payment Date</label>
                        <p className="font-semibold text-slate-900 text-[13px]">{new Date(payment.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Payment Account</label>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${payment.accountId === '1000' ? 'bg-emerald-400' : (payment.accountId === '1060' ? 'bg-blue-400' : 'bg-amber-400')}`}></div>
                            <p className="font-semibold text-slate-900 text-[13px]">
                                {DEFAULT_ACCOUNTS.find(a => a.id === payment.accountId)?.name || payment.paymentMethod}
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Reference</label>
                        <p className="font-semibold text-slate-900 text-[13px]">{payment.reference || 'N/A'}</p>
                    </div>
                </div>

                {payment.notes && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Notes</label>
                        <p className="text-[12px] italic text-slate-600">{payment.notes}</p>
                    </div>
                )}

                {/* Allocations Table */}
                <div className="space-y-3">
                    <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
                        <ArrowRight size={16} className="text-blue-500" />
                        Bill Allocations
                    </h3>
                    <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="table-header">Bill ID</th>
                                    <th className="table-header text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(payment.allocations || []).map((a, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="table-body-cell font-medium text-blue-600">#{a.purchaseId}</td>
                                        <td className="table-body-cell text-right font-bold finance-nums">{currency}{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                                {(!payment.allocations || payment.allocations.length === 0) && (
                                    <tr>
                                        <td colSpan={2} className="table-body-cell text-center text-slate-400 italic">No allocations recorded</td>
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

/**
 * Customer Payment Detail Panel (Slide-out)
 */
const CustomerPaymentDetailPanel: React.FC<{
    payment: CustomerPayment | null;
    onClose: () => void;
    onDelete: (id: string) => void;
    onEdit: (payment: CustomerPayment) => void;
    onPreview: (payment: CustomerPayment) => void;
    onStatement: (customerId: string, customerName: string) => void;
}> = ({ payment, onClose, onDelete, onEdit, onPreview, onStatement }) => {
    const { companyConfig, notify, ledger = [], accounts = [] } = useData();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'Details' | 'Accounting'>('Details');
    const currency = companyConfig.currencySymbol;
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (payment && panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (payment) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [payment, onClose]);

    if (!payment) return null;

    const allocated = (payment.allocations || []).reduce((s, a) => s + (a.amount || 0), 0);

    return (
        <div
            ref={panelRef}
            className={`fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl z-[120] transform transition-transform duration-300 ease-in-out border-l border-slate-200 flex flex-col font-['Inter',_sans-serif] text-[13px] leading-[1.5] text-slate-700 ${payment ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <PaymentIcon size={18} />
                    </div>
                    <div>
                        <h2 className="text-[20px] font-semibold text-slate-900 leading-tight">Payment Details</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{payment.id}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-100 px-4 bg-white shrink-0">
                {['Details', 'Accounting'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-800'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-8">
                {activeTab === 'Details' ? (
                    <>
                        {/* Status and Amount Card */}
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Amount</p>
                                <p className="text-[24px] font-bold text-slate-900 finance-nums">
                                    {currency}{payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Status</p>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border ${payment.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    payment.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                        'bg-red-50 text-red-700 border-red-100'
                                    }`}>
                                    {payment.status}
                                </span>
                            </div>
                        </div>

                        {/* Information Grid */}
                        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Customer Name</label>
                                    <button
                                        onClick={() => navigate('/sales-flow/customers', { state: { customerId: payment.customerId } })}
                                        className="hover:text-blue-600 transition-colors flex items-center gap-1 group"
                                    >
                                        <ExternalLink size={12} className="text-slate-400 group-hover:text-blue-600" />
                                    </button>
                                </div>
                                <p className="font-semibold text-slate-900 text-[13px]">{payment.customerName}</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Payment Date</label>
                                <p className="font-semibold text-slate-900 text-[13px]">{new Date(payment.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Payment Account</label>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${payment.accountId === '1000' ? 'bg-emerald-400' : (payment.accountId === '1060' ? 'bg-blue-400' : 'bg-amber-400')}`}></div>
                                    <p className="font-semibold text-slate-900 text-[13px]">
                                        {DEFAULT_ACCOUNTS.find(a => a.id === payment.accountId)?.name || payment.paymentMethod}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Reference</label>
                                <p className="font-semibold text-slate-900 text-[13px]">{payment.reference || 'N/A'}</p>
                            </div>
                            {payment.subAccountName && (
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Account Context</label>
                                    <p className="font-semibold text-blue-600 text-[13px]">{payment.subAccountName}</p>
                                </div>
                            )}
                        </div>

                        {/* Allocations Table */}
                        <div className="space-y-3">
                            <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
                                <ArrowRight size={16} className="text-blue-500" />
                                Invoice Allocations
                            </h3>
                            <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                                <table className="w-full text-left text-[13px]">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="table-header">Invoice ID</th>
                                            <th className="table-header text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {(payment.allocations || []).map((a, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="table-body-cell font-medium text-blue-600">#{a.invoiceId}</td>
                                                <td className="table-body-cell text-right font-bold finance-nums">{currency}{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                        {(!payment.allocations || payment.allocations.length === 0) && (
                                            <tr>
                                                <td colSpan={2} className="table-body-cell text-center text-slate-400 italic">No allocations recorded</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-slate-50/80 font-bold border-t border-slate-100">
                                        <tr>
                                            <td className="table-body-cell text-slate-500">Total Allocated</td>
                                            <td className="table-body-cell text-right text-slate-900 finance-nums">
                                                {currency}{allocated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Notes */}
                        {payment.notes && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Internal Notes</label>
                                <p className="text-[12px] italic text-slate-600">{payment.notes}</p>
                            </div>
                        )}
                    </>
                ) : (
                    /* Accounting Tab */
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <BarChart3 size={14} className="text-blue-500" /> GL Postings
                            </label>
                            <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">Live Ledger</span>
                        </div>

                        <div className="space-y-3">
                            {ledger.filter(e => e.referenceId === payment.id).map(entry => (
                                <div key={entry.id} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-200 transition-all group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="text-[11px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{entry.description}</div>
                                        <div className="text-[10px] font-black text-slate-900">{currency}{entry.amount.toLocaleString()}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
                                            <div className="text-[8px] font-black text-blue-400 uppercase mb-0.5">Debit</div>
                                            <div className="text-[10px] font-black text-blue-700 truncate">
                                                {accounts.find(a => a.id === entry.debitAccountId || a.code === entry.debitAccountId)?.name || entry.debitAccountId}
                                            </div>
                                        </div>
                                        <div className="bg-rose-50/50 p-2 rounded-xl border border-rose-100/50">
                                            <div className="text-[8px] font-black text-rose-400 uppercase mb-0.5">Credit</div>
                                            <div className="text-[10px] font-black text-rose-700 truncate">
                                                {accounts.find(a => a.id === entry.creditAccountId || a.code === entry.creditAccountId)?.name || entry.creditAccountId}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {ledger.filter(e => e.referenceId === payment.id).length === 0 && (
                                <div className="p-10 text-center text-slate-400 italic font-medium">No ledger entries found for this payment.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-2 shrink-0">
                <button
                    onClick={() => onPreview(payment)}
                    className="flex-1 min-w-[120px] bg-blue-600 text-white px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-sm"
                >
                    <Printer size={14} /> Preview Receipt
                </button>
                <button
                    onClick={() => {
                        if (payment.customerId) {
                            onStatement(payment.customerId, payment.customerName);
                        } else {
                            notify("No customer ID", "warning");
                        }
                    }}
                    className="flex-1 min-w-[120px] bg-white border border-blue-200 text-blue-600 px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-50 transition-all active:scale-95 shadow-sm"
                >
                    <FileBarChart size={14} /> Customer Statement
                </button>
                <button
                    onClick={() => { onEdit(payment); onClose(); }}
                    className="flex-1 min-w-[120px] bg-white border border-slate-200 text-slate-700 px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                >
                    <Edit2 size={14} /> Edit Details
                </button>
                <button
                    onClick={() => { onDelete(payment.id); onClose(); }}
                    className="w-full bg-white border border-rose-100 text-rose-600 px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-95 shadow-sm"
                >
                    <Trash2 size={14} /> Void Payment
                </button>
            </div>
        </div>
    );
};

const Payments: React.FC = () => {
    const { customerPayments = [], addCustomerPayment, updateCustomerPayment, deleteCustomerPayment, customers = [], invoices = [], sales = [], companyConfig, notify, user, updateInvoice, suppliers = [], refreshAllData } = useData();
    const { postJournalEntry, supplierPayments = [], recordSupplierPayment, updateSupplierPayment, voidSupplierPayment } = useFinance();
    const { purchases = [] } = useProcurement();
    const { accounts: bankAccounts, fetchBankingData } = useBankingStore();
    const currency = companyConfig.currencySymbol;
    const location = useLocation();
    useHighlight();
    const navigate = useNavigate();

    const isProcurement = location.pathname.startsWith('/procurement');
    const [activeTab, setActiveTab] = useState<'Received' | 'Made'>(isProcurement ? 'Made' : 'Received');

    useEffect(() => {
        if (isProcurement) {
            setActiveTab('Made');
        } else {
            setActiveTab('Received');
        }
    }, [isProcurement]);

    const customerNames = useMemo(() => {
        const names = new Set<string>();
        // Use official customers list first
        customers?.forEach((c: any) => {
            if (c.name) names.add(c.name);
        });
        // Add names from invoices/customerPayments just in case
        invoices?.forEach((inv: any) => {
            if (inv.customerName) names.add(inv.customerName);
        });
        customerPayments?.forEach((payment: any) => {
            if (payment.customerName) names.add(payment.customerName);
        });
        // Add school name if redirected from examination module
        if (location.state?.isExamInvoice && location.state?.customer) {
            names.add(location.state.customer);
        }
        return Array.from(names).sort();
    }, [customers, invoices, customerPayments, location.state]);

    // State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [generatedId, setGeneratedId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
    const hoverTimerRef = useRef<any | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const lastRefreshAtRef = useRef(0);

    const [selectedPayment, setSelectedPayment] = useState<CustomerPayment | null>(null);

    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState<Partial<CustomerPayment>>({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        subAccountName: 'Main',
        amount: 0,
        paymentMethod: 'Bank Transfer',
        accountId: '1050',
        reference: '',
        notes: '',
        bankCharges: 0,
        status: 'Cleared',
        reconciled: false,
        excessHandling: 'Change'
    });

    const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
    const [previewState, setPreviewState] = useState<{ isOpen: boolean, data: any, type: 'RECEIPT' | 'ACCOUNT_STATEMENT' | 'POS_RECEIPT' | 'SUPPLIER_PAYMENT' }>({
        isOpen: false,
        data: null,
        type: 'RECEIPT'
    });

    useEffect(() => {
        fetchBankingData?.();
    }, [fetchBankingData]);

    const handlePreviewReceipt = async (payment: CustomerPayment) => {
        try {
            // Check if this payment is linked to a POS sale
            const linkedSale = payment.reference ? sales.find(s => s.id === payment.reference) : null;

            if (linkedSale) {
                console.log('Building POS receipt for linked sale:', linkedSale.id);
                const previewData = buildPosReceiptDoc({
                    sale: linkedSale,
                    cashierName: linkedSale.cashierId || 'Cashier',
                    customerName: linkedSale.customerName || 'Walk-in Customer',
                    footerMessage: companyConfig.transactionSettings?.pos?.receiptFooter || companyConfig.footer?.receiptFooter
                });
                console.log('POS receipt preview data:', JSON.stringify(previewData, null, 2));
                
                // Validate required fields
                if (!previewData.receiptNumber) throw new Error('Missing receiptNumber');
                if (!previewData.date) throw new Error('Missing date');
                if (!previewData.items || previewData.items.length === 0) throw new Error('Missing or empty items array');
                
                const parsed = PosReceiptSchema.safeParse(previewData);
                if (!parsed.success) {
                    console.error('POS receipt validation errors:', parsed.error.errors);
                    const message = parsed.error.issues[0]?.message || 'Invalid POS receipt payload';
                    throw new Error(`POS receipt validation failed: ${message}`);
                }

                setPreviewState({
                    isOpen: true,
                    type: 'POS_RECEIPT',
                    data: parsed.data
                });
            } else {
                console.log('Building customer receipt for payment:', payment.id);
                const currentBalance = payment.customerId
                    ? await paymentService.getCustomerOutstandingBalance(payment.customerId)
                    : 0;

                console.log('Customer balance:', currentBalance);
                const formattedData = buildCustomerReceiptDoc({
                    payment,
                    customerName: payment.customerName,
                    currentBalance,
                    currencySymbol: currency
                });
                console.log('Customer receipt preview data:', JSON.stringify(formattedData, null, 2));
                
                // Validate required fields
                if (!formattedData.receiptNumber) throw new Error('Missing receiptNumber');
                if (!formattedData.date) throw new Error('Missing date');
                if (!formattedData.customerName) throw new Error('Missing customerName');
                
                const parsed = ReceiptSchema.safeParse(formattedData);
                if (!parsed.success) {
                    console.error('Customer receipt validation errors:', parsed.error.errors);
                    const message = parsed.error.issues[0]?.message || 'Invalid receipt payload';
                    throw new Error(`Customer receipt validation failed: ${message}`);
                }

                setPreviewState({
                    isOpen: true,
                    type: 'RECEIPT',
                    data: parsed.data
                });
            }
        } catch (err) {
            console.error('Failed to open receipt preview:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            notify(`Failed to generate receipt preview: ${errorMessage}`, "error");
        }
    };

    const handlePreviewStatement = async (customerId: string, customerName: string) => {
        try {
            // Use current month as default range
            const end = new Date();
            const start = new Date(end.getFullYear(), end.getMonth(), 1);

            const startDate = start.toISOString().split('T')[0];
            const endDate = end.toISOString().split('T')[0];

            const entries = await paymentService.getCustomerLedger(customerId, startDate, endDate);

            // Calculate opening balance (balance before the selected range)
            const allEntriesBefore = await paymentService.getCustomerLedger(customerId, '1970-01-01', new Date(start.getTime() - 86400000).toISOString().split('T')[0]);
            const openingBalance = allEntriesBefore.reduce((sum, e) => sum + (e.debit - e.credit), 0);

            let currentRunningBalance = openingBalance;
            const transactions = entries.map(e => {
                currentRunningBalance += (e.debit - e.credit);
                return {
                    date: new Date(e.date).toLocaleDateString('en-GB'),
                    reference: e.reference_no,
                    memo: e.memo || (e.debit > 0 ? 'Invoice' : 'Payment'),
                    debit: e.debit,
                    credit: e.credit,
                    runningBalance: currentRunningBalance
                };
            });

            const totalDebits = entries.reduce((s, e) => s + e.debit, 0);
            const totalCredits = entries.reduce((s, e) => s + e.credit, 0);

            setPreviewState({
                isOpen: true,
                type: 'ACCOUNT_STATEMENT',
                data: {
                    date: new Date().toLocaleDateString('en-GB'),
                    customerName: customerName,
                    startDate: new Date(startDate).toLocaleDateString('en-GB'),
                    endDate: new Date(endDate).toLocaleDateString('en-GB'),
                    currency: currency,
                    openingBalance,
                    transactions,
                    totalInvoiced: totalDebits,
                    totalReceived: totalCredits,
                    finalBalance: currentRunningBalance
                }
            });
        } catch (err) {
            console.error('Failed to generate statement:', err);
            notify("Failed to generate statement preview", "error");
        }
    };

    // Supplier Payment State
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [supplierEditMode, setSupplierEditMode] = useState(false);
    const [currentSupplierPaymentId, setCurrentSupplierPaymentId] = useState<string | null>(null);
    const [supplierFormData, setSupplierFormData] = useState<Partial<SupplierPayment>>({
        date: new Date().toISOString().split('T')[0],
        supplierId: '',
        amount: 0,
        paymentMethod: 'Bank Transfer',
        accountId: '1050',
        reference: '',
        notes: '',
        status: 'Cleared',
        reconciled: false
    });
    const [supplierAllocations, setSupplierAllocations] = useState<PurchaseAllocation[]>([]);
    const [selectedSupplierPayment, setSelectedSupplierPayment] = useState<SupplierPayment | null>(null);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const x = Math.min(e.clientX, window.innerWidth - 220);
        const y = Math.min(e.clientY, window.innerHeight - 250);
        setMenuPos({ x, y });
        setOpenMenuId(id);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const refreshModuleData = React.useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && now - lastRefreshAtRef.current < 1200) {
            return;
        }

        lastRefreshAtRef.current = now;
        setIsRefreshing(true);
        try {
            await refreshAllData?.();
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshAllData]);

    useEffect(() => {
        const handleWindowFocus = () => {
            refreshModuleData().catch(() => undefined);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshModuleData().catch(() => undefined);
            }
        };

        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [refreshModuleData]);

    const excessAmount = useMemo(() => {
        const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
        return Math.max(0, (Number(formData.amount) || 0) - totalAllocated);
    }, [formData.amount, allocations]);

    const modalOpenedRef = useRef(false);

    useEffect(() => {
        if (location.state?.action === 'create' && !modalOpenedRef.current) {
            // Mark as handled to prevent automatic re-opening on re-renders
            modalOpenedRef.current = true;
            resetForm();
            if (location.state.customer || location.state.customerId) {
                const customer = location.state.customer
                    ? customers.find((c: any) => c.name === location.state.customer)
                    : null;
                const customerById = location.state.customerId
                    ? customers.find((c: any) => c.id === location.state.customerId)
                    : null;
                const matchedCustomer = customer || customerById;
                const customerName = matchedCustomer?.name || location.state.customer || '';
                const customerId = matchedCustomer?.id || location.state.customerId || '';

                setFormData(prev => ({
                    ...prev,
                    customerName,
                    customerId,
                    subAccountName: location.state.subAccount || 'Main',
                    excessHandling: location.state.isTopUp ? 'Wallet' : 'Change',
                    notes: location.state.isTopUp ? `Wallet Top-up for ${location.state.subAccount || 'Main'}` : (location.state.isExamInvoice ? `Payment for Examination Invoice ${location.state.invoiceId}` : ''),
                    amount: location.state.isExamInvoice ? location.state.amount : 0
                }));

                // If redirected from "Save and Pay Now" or Examination module or Customer Workspace
                if (location.state.isExamInvoice && location.state.invoiceId) {
                    // For Exam Invoices, we don't have them in the main invoices context
                    // We just set the amount and a virtual allocation
                    setAllocations([{
                        invoiceId: location.state.invoiceId,
                        amount: location.state.amount
                    }]);
                } else if (!location.state.isTopUp) {
                    const unpaid = invoices.filter(i =>
                        (i.customerName === customerName || i.customerId === customerId) &&
                        i.status !== 'Paid' && i.status !== 'Draft'
                    );
                    const totalDue = unpaid.reduce((s, i) => s + (i.totalAmount - (i.paidAmount || 0)), 0);

                    setFormData(prev => ({ ...prev, amount: totalDue }));

                    const initialAllocations = unpaid.map(i => ({
                        invoiceId: i.id,
                        amount: i.totalAmount - (i.paidAmount || 0)
                    }));

                    // If a specific invoiceId was provided, only allocate to that invoice
                    if (location.state.invoiceId) {
                        const specificUnpaid = unpaid.filter(i => i.id === location.state.invoiceId);
                        if (specificUnpaid.length > 0) {
                            setAllocations(specificUnpaid.map(i => ({
                                invoiceId: i.id,
                                amount: i.totalAmount - (i.paidAmount || 0)
                            })));
                            setFormData(prev => ({
                                ...prev,
                                amount: specificUnpaid[0].totalAmount - (specificUnpaid[0].paidAmount || 0)
                            }));
                        } else {
                            setAllocations(initialAllocations);
                        }
                    } else {
                        setAllocations(initialAllocations);
                    }
                }
            }
            setIsModalOpen(true);
            
            // Clear the location state to prevent the modal from reopening on re-renders
            navigate(location.pathname, { replace: true, state: {} });
        }
        
        // Reset the flag when navigating away from the page
        return () => {
            if (!location.state?.action) {
                modalOpenedRef.current = false;
            }
        };
    }, [location, invoices]);

    const resetForm = () => {
        const nextId = generateNextId('pay', customerPayments, companyConfig);
        setGeneratedId(nextId);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            customerName: '',
            customerId: '',
            subAccountName: 'Main',
            amount: 0,
            paymentMethod: 'Bank Transfer',
            accountId: '1050',
            reference: '',
            notes: '',
            bankCharges: 0,
            status: 'Cleared',
            reconciled: false,
            excessHandling: 'Change'
        });
        setAllocations([]); setEditMode(false); setCurrentId(null);
    };

    const handleOpenCreate = () => { resetForm(); setIsModalOpen(true); };

    const handleSave = async () => {
        if (isSubmitting) return;
        if (!formData.customerName || !formData.amount) {
            notify("Please complete all required fields.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            let finalAllocations = [...allocations];
            const paymentAmount = Number(formData.amount);

            // Auto-allocate if no allocations exist but there are available invoices
            if (finalAllocations.length === 0 && availableInvoices.length > 0 && paymentAmount > 0) {
                let remaining = paymentAmount;
                const sorted = [...availableInvoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                for (const inv of sorted) {
                    if (remaining <= 0) break;
                    const due = inv.totalAmount - (inv.paidAmount || 0);
                    const amt = Math.min(remaining, due);
                    if (amt > 0) {
                        finalAllocations.push({ invoiceId: inv.id, amount: amt });
                        remaining -= amt;
                    }
                }
            }

            // Regenerate ID to prevent collisions (unless editing)
            const finalId = (editMode && currentId) ? currentId : generateNextId('pay', customerPayments, companyConfig);

            const newPayment: CustomerPayment = {
                ...formData,
                date: formData.date!,
                id: finalId,
                allocations: finalAllocations.filter(a => a.amount > 0),
                amount: paymentAmount,
                customerName: formData.customerName!,
                paymentMethod: formData.paymentMethod!,
                status: formData.status as any,
                reconciled: formData.reconciled || false,
                excessAmount: excessAmount > 0 ? excessAmount : undefined,
                excessHandling: excessAmount > 0 ? formData.excessHandling : undefined
            };

            if (editMode) {
                const existing = customerPayments.find(p => p.id === finalId);
                if (!existing) {
                    notify(`Payment ${finalId} not found for update.`, "error");
                    return;
                }

                const metadataOnlyUpdate: CustomerPayment = {
                    ...existing,
                    reference: formData.reference || '',
                    notes: formData.notes || '',
                    status: (formData.status as any) || existing.status,
                    reconciled: formData.reconciled ?? existing.reconciled,
                    bankCharges: formData.bankCharges ?? existing.bankCharges,
                    subAccountName: formData.subAccountName || existing.subAccountName
                };

                await updateCustomerPayment(metadataOnlyUpdate);
            } else {
                await addCustomerPayment(newPayment);
            }

            // Generate and show receipt preview
            if (!editMode && formData.customerId) {
                const postedPayment = await dbService.get<CustomerPayment>('customerPayments', newPayment.id);
                await handlePreviewReceipt(postedPayment || newPayment);
            }

            // Handle Examination Invoice payment sync
            if (location.state?.isExamInvoice && location.state?.sqliteInvoiceId) {
                try {
                    await api.production.payExamInvoice(
                        location.state.sqliteInvoiceId,
                        formData.paymentMethod || 'Cash'
                    );
                } catch (err) {
                    console.error('Failed to sync payment to exam module:', err);
                }
            }

            setIsModalOpen(false);
            notify(
                editMode
                    ? `Payment ${newPayment.id} metadata updated successfully.`
                    : `Payment ${newPayment.id} processed successfully.`,
                "success"
            );
        } catch (err: any) {
            console.error('Payment save failed:', err);
            notify(err?.message || "Failed to save payment.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const availableInvoices = useMemo(() => {
        if (!formData.customerName) return [];

        // Filter invoices by customer and sub-account
        const baseInvoices = invoices.filter(i => {
            // Check customer name match
            const customerMatch = i.customerName === formData.customerName;

            // Check sub-account match
            const subAccountMatch = !formData.subAccountName ||
                formData.subAccountName === 'Main' ||
                i.subAccountName === formData.subAccountName;

            // Check status
            const statusMatch = i.status !== 'Paid' &&
                i.status !== 'Draft' &&
                i.status !== 'Cancelled' &&
                i.status !== 'Void';

            return customerMatch && subAccountMatch && statusMatch;
        });

        // Inject exam invoice if applicable (only if it matches sub-account context)
        if (location.state?.isExamInvoice && formData.customerName === location.state.customer) {
            const examInvoiceId = location.state.invoiceId;
            if (!baseInvoices.find(i => i.id === examInvoiceId)) {
                // Check if exam invoice should be included based on sub-account
                const shouldIncludeExam = !formData.subAccountName ||
                    formData.subAccountName === 'Main' ||
                    location.state.subAccount === formData.subAccountName;

                if (shouldIncludeExam) {
                    baseInvoices.push({
                        id: examInvoiceId,
                        customerName: location.state.customer,
                        totalAmount: location.state.amount,
                        paidAmount: 0,
                        status: 'Unpaid',
                        date: new Date().toISOString(),
                        dueDate: new Date().toISOString(),
                        items: [],
                        subAccountName: location.state.subAccount || 'Main'
                    } as any);
                }
            }
        }
        return baseInvoices;
    }, [invoices, formData.customerName, formData.subAccountName, location.state]);

    const handleAutoAllocate = () => {
        let remaining = Number(formData.amount);
        const newAllocations: InvoiceAllocation[] = [];
        const sorted = [...availableInvoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const inv of sorted) {
            if (remaining <= 0) break;
            const due = inv.totalAmount - (inv.paidAmount || 0);
            const amt = Math.min(remaining, due);
            newAllocations.push({ invoiceId: inv.id, amount: amt });
            remaining -= amt;
        }
        setAllocations(newAllocations);
    };

    const handleMouseEnter = (id: string, e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoveredId(id);
            setHoverPos({ x: clientX, y: clientY });
        }, 800);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (hoveredId) setHoveredId(null);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredId(null);
    };

    const filteredPayments = (customerPayments || []).filter(payment =>
        (payment.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (payment.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (payment.reference || '').toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const hoveredPayment = useMemo(() => (customerPayments || []).find(payment => payment.id === hoveredId), [customerPayments, hoveredId]);

    const renderContextMenu = () => {
        if (!openMenuId || !menuPos) return null;
        const payment = customerPayments.find(payment => payment.id === openMenuId);
        if (!payment) return null;

        // Calculate optimal position to keep menu fully visible
        const menuWidth = 208; // w-52 = 208px
        const menuHeight = 200; // Estimated height for all menu items
        
        let x = menuPos.x;
        let y = menuPos.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        return (
            <div
                ref={menuRef}
                className="fixed w-52 bg-white/95 backdrop-blur-xl rounded-xl shadow-premium border border-slate-200 z-[110] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1.5 overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
            >
                <div className="px-3 py-1 mb-1 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Payment Options</p>
                </div>
                <button onClick={() => { setOpenMenuId(null); notify("Remittance email queued.", "success"); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3 transition-colors">
                    <Mail size={14} /> Email Remittance
                </button>
                <div className="h-px bg-slate-100 my-1"></div>
                <button onClick={() => { if (confirm("Void this payment?")) { deleteCustomerPayment(payment.id); notify("Payment voided.", "info"); } setOpenMenuId(null); }} className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors">
                    <Trash2 size={14} /> Void Payment
                </button>
            </div>
        );
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative">
            {renderContextMenu()}

            {hoveredId && hoverPos && activeTab === 'Received' && customerPayments.find(payment => payment.id === hoveredId) && (
                <CustomerPaymentHoverCard pos={hoverPos} payment={customerPayments.find(payment => payment.id === hoveredId)!} />
            )}

            {hoveredId && hoverPos && activeTab === 'Made' && supplierPayments.find(p => p.id === hoveredId) && (
                <SupplierPaymentHoverCard pos={hoverPos} payment={supplierPayments.find(p => p.id === hoveredId)!} />
            )}

            <div className="mb-4 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-[22px] font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                        <PaymentIcon className="text-blue-600" size={20} /> 
                        {isProcurement ? 'Supplier Payments' : 'Customer Payments'}
                    </h1>
                    <p className="text-xs font-normal text-slate-500 mt-0.5">
                        {isProcurement ? 'Record and manage payments made to your suppliers.' : 'Process and track payments received from your customers.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refreshModuleData(true).catch(() => undefined)}
                        disabled={isRefreshing}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Refresh invoicing and billing data"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={activeTab === 'Received' ? handleOpenCreate : () => setIsSupplierModalOpen(true)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
                    >
                        <Plus size={14} /> {activeTab === 'Received' ? 'New Payment' : 'New Supplier Payment'}
                    </button>
                </div>
            </div>

            {/* Tab switcher removed for separated flows */}

            {activeTab === 'Received' ? (
                <>
                    {isModalOpen && (
                        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                                    <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Record Customer Payment</h2>
                                    <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                                    <div className="w-full md:w-80 bg-slate-50 p-6 border-r border-slate-200 overflow-y-auto custom-scrollbar flex flex-col">
                                        <div className="space-y-4 flex-1">
                                            {editMode && (
                                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                                    <p className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">
                                                        Financial fields are locked after posting. Use Void and Re-post for amount/allocation corrections.
                                                    </p>
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Customer</label>
                                                <select
                                                    className="w-full p-2.5 border rounded-xl bg-white text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={formData.customerName}
                                                    disabled={editMode}
                                                    onChange={e => {
                                                        const name = e.target.value;
                                                        const customer = customers.find((c: any) => c.name === name);
                                                        setFormData({
                                                            ...formData,
                                                            customerName: name,
                                                            customerId: customer?.id || '',
                                                            subAccountName: 'Main'
                                                        });
                                                    }}
                                                >
                                                    <option value="">-- Choose Client --</option>
                                                    {customerNames.map(name => <option key={name} value={name}>{name}</option>)}
                                                </select>
                                            </div>

                                            {formData.customerName && customers.find(c => c.name === formData.customerName)?.subAccounts?.length > 0 && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <label className="block text-[10px] font-bold text-blue-500 uppercase tracking-tight mb-1 flex items-center gap-2">
                                                        <Building2 size={12} /> Credit Sub-Account
                                                    </label>
                                                    <select
                                                        className="w-full p-2.5 border-2 border-blue-50 rounded-xl bg-white text-[13px] outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700"
                                                        value={formData.subAccountName}
                                                        disabled={editMode}
                                                        onChange={e => setFormData({ ...formData, subAccountName: e.target.value })}
                                                    >
                                                        <option value="Main">Main Account</option>
                                                        {customers.find(c => c.name === formData.customerName)?.subAccounts.map((sa: any) => (
                                                            <option key={sa.id || sa.name} value={sa.name}>{sa.name}</option>
                                                        ))}
                                                    </select>
                                                    <p className="text-[10px] text-slate-400 mt-1 italic">Choose which sub-account to credit this payment to.</p>
                                                </div>
                                            )}



                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Payment Date</label>
                                                <input type="date" className="w-full p-2.5 border rounded-xl bg-white text-[13px]" value={formData.date} disabled={editMode} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Payment Account</label>
                                                <select
                                                    className="w-full p-2.5 border rounded-xl bg-white text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={formData.accountId}
                                                    disabled={editMode}
                                                    onChange={e => {
                                                        const accId = e.target.value;
                                                        const defAcc = DEFAULT_ACCOUNTS.find(a => a.id === accId);
                                                        const bankAcc = bankAccounts.find(a => a.id === accId);
                                                        
                                                        let method = 'Bank';
                                                        if (defAcc?.name.includes('Cash')) method = 'Cash';
                                                        else if (defAcc?.name.includes('Mobile') || bankAcc?.name.toLowerCase().includes('mobile')) method = 'Mobile Money';
                                                        
                                                        setFormData({
                                                            ...formData,
                                                            accountId: accId,
                                                            paymentMethod: method as any
                                                        });
                                                    }}
                                                >
                                                    <optgroup label="Default Accounts">
                                                        {DEFAULT_ACCOUNTS.filter(a => ['1000', '1050', '1060'].includes(a.id)).map(acc => (
                                                            <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                                                        ))}
                                                    </optgroup>
                                                    {bankAccounts.length > 0 && (
                                                        <optgroup label="Specific Bank Accounts">
                                                            {bankAccounts.filter(a => a.status === 'Active' && !['1000', '1050', '1060'].includes(a.id)).map(acc => (
                                                                <option key={acc.id} value={acc.id}>{acc.name} - {acc.bankName}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                            </div>

                                            <div className="pt-4 border-t border-slate-200">
                                                <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-tight mb-1.5">Amount Received</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-blue-600">{currency}</span>
                                                    <input
                                                        type="number"
                                                        className="w-full pl-8 p-3 bg-white border-2 border-blue-100 rounded-2xl text-xl font-bold focus:border-blue-500 outline-none finance-nums"
                                                        value={formData.amount || ''}
                                                        disabled={editMode}
                                                        onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleAutoAllocate}
                                                    disabled={editMode || !formData.amount || availableInvoices.length === 0}
                                                    className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all disabled:opacity-30"
                                                >
                                                    Auto-Allocate to Invoices
                                                </button>
                                            </div>

                                            {excessAmount > 0.01 && (
                                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in zoom-in-95">
                                                    <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-tight mb-3 flex items-center gap-2">
                                                        <AlertTriangle size={14} /> Excess Amount: {currency}{excessAmount.toFixed(2)}
                                                    </label>
                                                    <div className="flex flex-col gap-2">
                                                        <button
                                                            onClick={() => setFormData({ ...formData, excessHandling: 'Change' })}
                                                            disabled={editMode}
                                                            className={`w-full py-2 rounded-xl text-[10px] font-bold uppercase border transition-all flex items-center justify-center gap-2 ${formData.excessHandling === 'Change' ? 'bg-white text-emerald-600 border-emerald-300 shadow-sm' : 'bg-emerald-600 text-white border-emerald-500'}`}
                                                        >
                                                            <Undo2 size={12} /> Give Change
                                                        </button>
                                                        <button
                                                            disabled={editMode || !formData.customerName}
                                                            onClick={() => setFormData({ ...formData, excessHandling: 'Wallet' })}
                                                            className={`w-full py-2 rounded-xl text-[10px] font-bold uppercase border transition-all flex items-center justify-center gap-2 ${formData.excessHandling === 'Wallet' ? 'bg-white text-emerald-600 border-emerald-300 shadow-sm' : 'bg-emerald-600 text-white border-emerald-500'}`}
                                                        >
                                                            <Wallet size={12} /> To Wallet
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="pt-4 space-y-3">
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">Entry Metadata</label>
                                                <input type="text" className="w-full p-2 border rounded-xl text-[13px]" placeholder="Reference / Cheque #" value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} />
                                                <textarea className="w-full p-2 border rounded-xl text-[13px] h-20 resize-none" placeholder="Narration..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                                            </div>
                                        </div>

                                        <div className="pt-6 shrink-0">
                                            <button
                                                onClick={handleSave}
                                                disabled={isSubmitting}
                                                className={`w-full py-4 rounded-2xl font-bold uppercase text-[11px] tracking-tight shadow-xl transition-all active:scale-95 ${isSubmitting ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white shadow-emerald-900/10 hover:bg-emerald-700'}`}
                                            >
                                                {isSubmitting ? 'Processing...' : 'Confirm & Post Payment'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-white p-6 overflow-y-auto custom-scrollbar">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-tight">Invoice Allocations</h3>
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">{availableInvoices.length} Unpaid Found</span>
                                        </div>

                                        <table className="w-full text-left text-[13px] border-collapse">
                                            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-tight border-b border-slate-100 sticky top-0">
                                                <tr>
                                                    <th className="table-header">Invoice</th>
                                                    <th className="table-header">Date</th>
                                                    <th className="table-header text-right">Total</th>
                                                    <th className="table-header text-right">Balance</th>
                                                    <th className="table-header text-right w-32">Allocate</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {availableInvoices.map(inv => {
                                                    const due = inv.totalAmount - (inv.paidAmount || 0);
                                                    const alloc = allocations.find(a => a.invoiceId === inv.id);

                                                    return (
                                                        <tr key={inv.id} className="hover:bg-blue-50/30 transition-colors">
                                                            <td className="table-body-cell">
                                                                <div className="font-bold text-blue-600">#{inv.id}</div>
                                                                {inv.subAccountName && <div className="text-[10px] text-slate-400 uppercase tracking-tight">{inv.subAccountName}</div>}
                                                            </td>
                                                            <td className="table-body-cell text-slate-500">{new Date(inv.date).toLocaleDateString()}</td>
                                                            <td className="table-body-cell text-right text-slate-500 finance-nums">{currency}{inv.totalAmount.toFixed(2)}</td>
                                                            <td className="table-body-cell text-right font-bold text-rose-500 finance-nums">{currency}{due.toFixed(2)}</td>
                                                            <td className="table-body-cell text-right">
                                                                <input
                                                                    type="number"
                                                                    className="w-24 p-1.5 border border-blue-200 rounded-lg text-right font-bold text-blue-600 focus:border-blue-500 outline-none finance-nums"
                                                                    value={alloc?.amount || ''}
                                                                    disabled={editMode}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        setAllocations(prev => {
                                                                            const filtered = prev.filter(a => a.invoiceId !== inv.id);
                                                                            return [...filtered, { invoiceId: inv.id, amount: val }];
                                                                        });
                                                                    }}
                                                                    placeholder="0.00"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {availableInvoices.length === 0 && (
                                                    <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-medium italic">No outstanding invoices for this account context.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-6 flex-1 min-h-0 overflow-hidden relative">
                        <div className={`bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 flex flex-col min-h-0 flex-1 overflow-hidden transition-all duration-300 ${selectedPayment ? 'mr-[450px]' : ''}`}>
                            <div className="p-3 border-b border-slate-200/60 flex justify-between items-center bg-slate-50/30">
                                <div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input type="text" placeholder="Search payments, reference..." className="w-full pl-9 pr-3 py-1.5 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 font-normal" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left text-[13px]">
                                    <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="table-header">Date</th>
                                            <th className="table-header">Payment #</th>
                                            <th className="table-header">Customer</th>
                                            <th className="table-header">Account</th>
                                            <th className="table-header">Status</th>
                                            <th className="table-header text-right">Amount</th>
                                            <th className="table-header text-right">Allocated</th>
                                            <th className="table-header text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50 font-normal">
                                        {filteredPayments.map(payment => {
                                            const allocated = (payment.allocations || []).reduce((s, a) => s + (a.amount || 0), 0);
                                            const isSelected = selectedPayment?.id === payment.id;
                                            return (
                                                <tr
                                                    key={payment.id}
                                                    id={`pmt-${payment.id}`}
                                                    className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/60 border-l-4 border-l-blue-500' : 'hover:bg-blue-50/40 border-l-4 border-l-transparent'}`}
                                                    onClick={() => setSelectedPayment(payment)}
                                                    onContextMenu={(e) => handleContextMenu(e, payment.id)}
                                                    onMouseEnter={(e) => handleMouseEnter(payment.id, e)}
                                                    onMouseMove={handleMouseMove}
                                                    onMouseLeave={handleMouseLeave}
                                                >
                                                    <td className="table-body-cell text-slate-500 font-normal"><div className="flex items-center gap-2"><Calendar size={12} /> {new Date(payment.date).toLocaleDateString()}</div></td>
                                                    <td className="table-body-cell"><span className="font-mono text-[10px] font-bold text-slate-600 tracking-tight">
                                                        <DocLink
                                                            docNumber={payment.id}
                                                            targetPage={isProcurement ? "/procurement/payments" : "/sales-flow/payments"}
                                                            rowId={(isProcurement ? "spmt-" : "pmt-") + payment.id}
                                                            currentPage={location.pathname}
                                                        />
                                                    </span></td>
                                                    <td className="table-body-cell font-bold text-slate-900">{payment.customerName}</td>
                                                    <td className="table-body-cell">
                                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] border border-slate-200 font-normal">
                                                            {DEFAULT_ACCOUNTS.find(a => a.id === payment.accountId)?.name || payment.paymentMethod}
                                                        </span>
                                                    </td>
                                                    <td className="table-body-cell font-normal"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex w-fit items-center gap-1 ${payment.status === 'Cleared' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : payment.status === 'Pending' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-800'}`}>{payment.status}</span></td>
                                                    <td className="table-body-cell text-right font-bold text-slate-900 finance-nums">{currency}{(payment.amount || 0).toFixed(2)}</td>
                                                    <td className="table-body-cell text-right font-bold text-blue-600 finance-nums">{currency}{allocated.toFixed(2)}</td>
                                                    <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                                        <div className="flex justify-end gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handlePreviewReceipt(payment);
                                                                }}
                                                                className="p-1.5 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all"
                                                                title="View Receipt"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (payment.customerId) {
                                                                        handlePreviewStatement(payment.customerId, payment.customerName);
                                                                    } else {
                                                                        notify("Cannot generate statement: No customer ID linked", "warning");
                                                                    }
                                                                }}
                                                                className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-blue-200 rounded transition-all"
                                                                title="View Customer Statement"
                                                            >
                                                                <FileBarChart size={14} />
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, payment.id); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"><MoreVertical size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-4 mb-6 shrink-0">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search supplier payments..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 flex flex-col min-h-0 flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-[13px]">
                                <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="table-header">Date</th>
                                        <th className="table-header">Payment #</th>
                                        <th className="table-header">Supplier</th>
                                        <th className="table-header">Account</th>
                                        <th className="table-header">Status</th>
                                        <th className="table-header text-right">Amount</th>
                                        <th className="table-header text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50">
                                    {supplierPayments
                                        .filter(p =>
                                            suppliers.find(s => s.id === p.supplierId)?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            p.reference?.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(payment => (
                                            <tr
                                                key={payment.id}
                                                id={`spmt-${payment.id}`}
                                                className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                                onClick={() => setSelectedSupplierPayment(payment)}
                                                onMouseEnter={(e) => handleMouseEnter(payment.id, e)}
                                                onMouseMove={handleMouseMove}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <td className="table-body-cell text-slate-500"><Calendar size={12} className="inline mr-2" /> {new Date(payment.date).toLocaleDateString()}</td>
                                                <td className="table-body-cell font-mono text-[10px] font-bold text-slate-600">
                                                    <DocLink
                                                        docNumber={payment.id}
                                                        targetPage={isProcurement ? "/procurement/payments" : "/sales-flow/payments"}
                                                        rowId={`spmt-${payment.id}`}
                                                        currentPage={location.pathname}
                                                    />
                                                </td>
                                                <td className="table-body-cell font-bold text-slate-900">{suppliers.find(s => s.id === payment.supplierId)?.name || 'Unknown Supplier'}</td>
                                                <td className="table-body-cell">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] border border-slate-200">
                                                        {DEFAULT_ACCOUNTS.find(a => a.id === payment.accountId)?.name || payment.paymentMethod}
                                                    </span>
                                                </td>
                                                <td className="table-body-cell">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${payment.status === 'Cleared' ? 'bg-emerald-100 text-emerald-700' :
                                                        payment.status === 'Voided' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {payment.status}
                                                    </span>
                                                </td>
                                                <td className="table-body-cell text-right font-bold text-slate-900 finance-nums">{currency}{payment.amount.toLocaleString()}</td>
                                                <td className="table-body-cell text-right">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const supplierName = suppliers.find(s => s.id === payment.supplierId)?.name || 'Unknown Supplier';
                                                            try {
                                                                const supplierDoc = buildSupplierPaymentDoc(payment, supplierName);
                                                                const parsed = SupplierPaymentSchema.safeParse(supplierDoc);
                                                                if (!parsed.success) {
                                                                    const message = parsed.error.issues[0]?.message || 'Invalid supplier voucher payload';
                                                                    throw new Error(message);
                                                                }
                                                                setPreviewState({
                                                                    isOpen: true,
                                                                    type: 'SUPPLIER_PAYMENT',
                                                                    data: parsed.data
                                                                });
                                                            } catch (previewError) {
                                                                console.error('Supplier voucher preview failed:', previewError);
                                                                notify('Failed to generate supplier voucher preview', 'error');
                                                            }
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg transition-colors mr-1"
                                                        title="View Voucher"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm("Void this supplier payment?")) voidSupplierPayment(payment.id);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    {supplierPayments.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-20 text-center text-slate-300 italic">No supplier payments recorded yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {isSupplierModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Record Supplier Payment</h2>
                            <button onClick={() => setIsSupplierModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Supplier</label>
                                    <select
                                        className="w-full p-2.5 border rounded-xl bg-white text-[13px]"
                                        value={supplierFormData.supplierId}
                                        onChange={e => {
                                            setSupplierFormData({
                                                ...supplierFormData,
                                                supplierId: e.target.value,
                                                amount: 0 // Reset amount on supplier change to force re-allocation logic
                                            });
                                            setSupplierAllocations([]); // Clear allocations from previous supplier
                                        }}
                                    >
                                        <option value="">-- Select Supplier --</option>
                                        {suppliers && suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-2.5 border rounded-xl bg-white text-[13px]"
                                        value={supplierFormData.date}
                                        onChange={e => setSupplierFormData({ ...supplierFormData, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Amount Paid</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>
                                        <input
                                            type="number"
                                            className="w-full pl-8 p-2.5 border rounded-xl bg-white text-[13px] font-bold"
                                            value={supplierFormData.amount || ''}
                                            onChange={e => setSupplierFormData({ ...supplierFormData, amount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Payment Account</label>
                                    <select
                                        className="w-full p-2.5 border rounded-xl bg-white text-[13px]"
                                        value={supplierFormData.accountId}
                                        onChange={e => {
                                            const accId = e.target.value;
                                            const defAcc = DEFAULT_ACCOUNTS.find(a => a.id === accId);
                                            const bankAcc = bankAccounts.find(a => a.id === accId);
                                            
                                            let method = 'Bank Transfer';
                                            if (defAcc?.name.includes('Cash')) method = 'Cash';
                                            else if (defAcc?.name.includes('Mobile') || bankAcc?.name.toLowerCase().includes('mobile')) method = 'Mobile Money';

                                            setSupplierFormData({
                                                ...supplierFormData,
                                                accountId: accId,
                                                paymentMethod: method as any
                                            });
                                        }}
                                    >
                                        <optgroup label="Default Accounts">
                                            {DEFAULT_ACCOUNTS.filter(a => ['1000', '1050', '1060'].includes(a.id)).map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                                            ))}
                                        </optgroup>
                                        {bankAccounts.length > 0 && (
                                            <optgroup label="Specific Bank Accounts">
                                                {bankAccounts.filter(a => a.status === 'Active' && !['1000', '1050', '1060'].includes(a.id)).map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.bankName}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Reference / Transaction ID</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 border rounded-xl bg-white text-[13px]"
                                    value={supplierFormData.reference}
                                    onChange={e => setSupplierFormData({ ...supplierFormData, reference: e.target.value })}
                                    placeholder="e.g. Bank Ref, Check #"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Notes</label>
                                <textarea
                                    className="w-full p-2.5 border rounded-xl bg-white text-[13px]"
                                    value={supplierFormData.notes}
                                    onChange={e => setSupplierFormData({ ...supplierFormData, notes: e.target.value })}
                                    rows={2}
                                />
                            </div>

                            {/* Supplier Allocation Section */}
                            <div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                    <FileText size={14} className="text-blue-500" /> Bill Allocations
                                </h3>
                                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                                    <table className="w-full text-left text-[11px]">
                                        <thead className="bg-slate-100/50 text-slate-500">
                                            <tr>
                                                <th className="px-4 py-2 font-bold">Bill #</th>
                                                <th className="px-4 py-2 font-bold">Balance</th>
                                                <th className="px-4 py-2 font-bold text-right">Allocate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {purchases
                                                .filter(p => p.supplierId === supplierFormData.supplierId && p.paymentStatus !== 'Paid')
                                                .map(bill => {
                                                    const currentAllocation = supplierAllocations.find(a => a.purchaseId === bill.id)?.amount || 0;
                                                    const due = (bill.total || 0) - (bill.paidAmount || 0);
                                                    return (
                                                        <tr key={bill.id}>
                                                            <td className="px-4 py-2 font-medium text-slate-700">{bill.id}</td>
                                                            <td className="px-4 py-2 text-slate-500">{currency}{due.toLocaleString()}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    className="w-24 p-1 text-right border rounded-lg bg-white font-bold"
                                                                    value={currentAllocation || ''}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        setSupplierAllocations(prev => {
                                                                            const filtered = prev.filter(a => a.purchaseId !== bill.id);
                                                                            if (val > 0) return [...filtered, { purchaseId: bill.id, amount: val }];
                                                                            return filtered;
                                                                        });
                                                                    }}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            {purchases.filter(p => p.supplierId === supplierFormData.supplierId && p.paymentStatus !== 'Paid').length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">No outstanding bills for this supplier</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setIsSupplierModalOpen(false)}
                                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!supplierFormData.supplierId || !supplierFormData.amount) {
                                            notify("Please fill in supplier and amount", "error");
                                            return;
                                        }

                                        // Allocation Validation
                                        const totalAllocated = supplierAllocations.reduce((sum, a) => sum + a.amount, 0);
                                        if (totalAllocated > supplierFormData.amount) {
                                            notify(`Over-allocation: Total allocated (${totalAllocated}) exceeds payment amount (${supplierFormData.amount})`, "error");
                                            return;
                                        }

                                        const payment: SupplierPayment = {
                                            ...supplierFormData as SupplierPayment,
                                            id: supplierEditMode ? currentSupplierPaymentId! : generateNextId('spay', supplierPayments, companyConfig),
                                            reconciled: false,
                                            status: 'Cleared',
                                            allocations: supplierAllocations
                                        };
                                        if (supplierEditMode) await updateSupplierPayment(payment);
                                        else await recordSupplierPayment(payment);

                                        setIsSupplierModalOpen(false);
                                        setSupplierAllocations([]);
                                        setSupplierFormData({
                                            date: new Date().toISOString().split('T')[0],
                                            supplierId: '',
                                            amount: 0,
                                            paymentMethod: 'Bank Transfer',
                                            accountId: '1050',
                                            reference: '',
                                            notes: '',
                                            status: 'Cleared',
                                            reconciled: false
                                        });
                                        notify("Supplier payment recorded", "success");
                                    }}
                                    className="flex-[2] px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                                >
                                    {supplierEditMode ? 'Update Payment' : 'Post Payment to Ledger'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <CustomerPaymentDetailPanel
                payment={selectedPayment}
                onClose={() => setSelectedPayment(null)}
                onDelete={(id) => {
                    if (confirm("Are you sure you want to void this payment? This action cannot be undone.")) {
                        deleteCustomerPayment(id);
                        notify("Payment voided successfully.", "info");
                        setSelectedPayment(null);
                    }
                }}
                onEdit={(p) => {
                    setFormData({
                        date: p.date,
                        customerName: p.customerName,
                        subAccountName: p.subAccountName || 'Main',
                        amount: p.amount,
                        paymentMethod: p.paymentMethod,
                        accountId: p.accountId || (p.paymentMethod === 'Cash' ? '1000' : (p.paymentMethod === 'Mobile Money' ? '1060' : '1050')),
                        reference: p.reference || '',
                        notes: p.notes || '',
                        bankCharges: p.bankCharges || 0,
                        status: p.status,
                        reconciled: p.reconciled,
                        excessHandling: p.excessHandling || 'Change'
                    });
                    setAllocations(p.allocations);
                    setEditMode(true);
                    setCurrentId(p.id);
                    setIsModalOpen(true);
                    setSelectedPayment(null);
                }}
                onPreview={handlePreviewReceipt}
                onStatement={(cid, cname) => handlePreviewStatement(cid, cname)}
            />
            <SupplierDetailPanel
                payment={selectedSupplierPayment}
                onClose={() => setSelectedSupplierPayment(null)}
                onVoid={(id) => {
                    voidSupplierPayment(id);
                    setSelectedSupplierPayment(null);
                }}
            />

            <PreviewModal
                isOpen={previewState.isOpen}
                onClose={() => setPreviewState(prev => ({ ...prev, isOpen: false }))}
                type={previewState.type as any}
                data={previewState.data}
            />

        </div>
    );
};

export default Payments;
