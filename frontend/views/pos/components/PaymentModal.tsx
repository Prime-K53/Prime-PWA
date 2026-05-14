import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Banknote, CreditCard, Smartphone, Briefcase, X, Wallet, Award, Clock, CheckCircle2, AlertCircle, ArrowLeftRight } from 'lucide-react';
import type { PaymentDetail } from '../../../types';
import { useData } from '../../../context/DataContext';
import { useBankingStore } from '../../../context/BankingContext';
import { DEFAULT_ACCOUNTS } from '../../../constants';

import { formatNumber } from '../../../utils/helpers';

interface PaymentModalProps {
    total: number;
    onComplete: (paymentMethods: PaymentDetail[], excessHandling?: 'Change' | 'Wallet') => void;
    onCancel: () => void;
    customerName: string | null;
    availableCredit: number;
    walletBalance: number;
    loyaltyPoints?: number;
    subAccountName?: string;
    // TODO: normalise to adjustmentSnapshots — see cleanup tracker
    adjustmentSummary?: { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }[];
    roundingAccumulation?: number;
    totalProfitMargin?: number;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    total,
    onComplete,
    onCancel,
    customerName,
    availableCredit: _availableCredit,
    walletBalance,
    loyaltyPoints = 0,
    subAccountName: _subAccountName,
    adjustmentSummary = [],
    roundingAccumulation: _roundingAccumulation = 0,
    totalProfitMargin = 0
}) => {
    const { companyConfig, notify, invoices } = useData();
    const { accounts: bankAccounts, fetchBankingData } = useBankingStore();
    const currency = companyConfig?.currencySymbol || '$';
    const [splitPayments, setSplitPayments] = useState<PaymentDetail[]>([]);
    const [remainingDue, setRemainingDue] = useState(total);
    const [currentPaymentAmount, setCurrentPaymentAmount] = useState(() => (Number.isFinite(total) ? total.toFixed(2) : ''));
    const [changeDue, setChangeDue] = useState(0);
    const [activePaymentMethod, setActivePaymentMethod] = useState<string | null>(null);

    const handleCancel = useCallback(() => {
        setActivePaymentMethod(null);
        onCancel();
    }, [onCancel]);

    // Auto-calculate change when amount received changes
    useEffect(() => {
        const val = parseFloat(currentPaymentAmount);
        if (!isNaN(val) && val > total) {
            setChangeDue(val - total);
        } else {
            setChangeDue(0);
        }
    }, [currentPaymentAmount, total]);

    const pointsConversionRate = 0.10;

    useEffect(() => {
        fetchBankingData?.();
    }, [fetchBankingData]);

    useEffect(() => {
        if (!bankAccounts || bankAccounts.length === 0) {
            fetchBankingData?.();
        }
    }, [bankAccounts?.length, fetchBankingData]);

    useEffect(() => {
        if (splitPayments.length === 0 && (currentPaymentAmount === '' || Number(currentPaymentAmount) === 0)) {
            setCurrentPaymentAmount(Number.isFinite(total) ? total.toFixed(2) : '');
            setRemainingDue(total);
        }
    }, [total, splitPayments.length]);

    const typedAmount = useMemo(() => {
        const parsed = parseFloat(currentPaymentAmount);
        return Number.isFinite(parsed) ? parsed : 0;
    }, [currentPaymentAmount]);

    const effectiveRemainingDue = useMemo(() => {
        if (splitPayments.length > 0) return remainingDue;
        return Math.max(0, total - typedAmount);
    }, [splitPayments.length, remainingDue, total, typedAmount]);

const canCompleteSale = useMemo(() => {
  // total paid is sum of split payments plus any typed amount remaining
  const totalPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0) + typedAmount;
  // consider the sale complete if totalPaid covers the total within a small tolerance
  return totalPaid >= total - 0.01;
}, [splitPayments, typedAmount, total]);

    const handleComplete = useCallback(() => {
        const paymentsToSubmit: PaymentDetail[] = splitPayments.length > 0
            ? splitPayments
            : (
                typedAmount > 0
                    ? [{ method: 'Cash', amount: typedAmount, accountId: '1000' }]
                    : []
            );
        const totalPaid = paymentsToSubmit.reduce((sum, p) => sum + p.amount, 0);

        if (paymentsToSubmit.length === 0) {
            notify("Select a payment method or enter amount received.", "error");
            return;
        }

        if (totalPaid < total - 0.01) {
            notify("Amount tendered cannot be less than bill total.", "error");
            return;
        }

        onComplete(paymentsToSubmit, 'Change');
        // Reset active payment method after completing sale
        setActivePaymentMethod(null);
    }, [splitPayments, typedAmount, total, onComplete, notify]);

    const addPaymentMethod = useCallback((accountId: string) => {
        const amountInput = parseFloat(currentPaymentAmount);
        if (isNaN(amountInput) || amountInput <= 0) {
            notify("Please enter a valid positive payment amount.", "error");
            return;
        }

        let method: string;
        if (accountId === 'WALLET') {
            if (amountInput > walletBalance) {
                notify(`Insufficient wallet balance. Available: ${currency}${formatNumber(walletBalance)}`, "error");
                return;
            }
            method = 'Wallet';
        } else if (accountId === 'LOYALTY') {
            const availableValue = loyaltyPoints * pointsConversionRate;
            if (amountInput > availableValue) {
                notify(`Insufficient loyalty points. Max value: ${currency}${formatNumber(availableValue)}`, "error");
                return;
            }
            method = 'Loyalty';
        } else if (accountId === 'CREDIT') {
            if (amountInput > creditStatus.available) {
                notify(`Insufficient credit limit. Available: ${currency}${formatNumber(creditStatus.available)}`, "error");
                return;
            }
            method = 'Credit';
        } else {
            const account = DEFAULT_ACCOUNTS.find(a => a.id === accountId);
            if (!account) return;
            method = account.name.includes('Cash') ? 'Cash' :
                (account.name.includes('Mobile') ? 'Mobile Money' : 'Bank Transfer');
        }

        const newSplit = [...splitPayments, { method: method as any, amount: amountInput, accountId }];
        setSplitPayments(newSplit);

        // Set active payment method for highlighting
        setActivePaymentMethod(accountId);

        const newPaid = newSplit.reduce((sum, p) => sum + p.amount, 0);
        const newRemaining = total - newPaid;

        // Update change due based on total paid vs bill total
        if (newPaid > total) {
            setChangeDue(newPaid - total);
        } else {
            setChangeDue(0);
        }

        setRemainingDue(newRemaining > 0.01 ? newRemaining : 0);
        setCurrentPaymentAmount(newRemaining > 0.01 ? newRemaining.toFixed(2) : '');
    }, [currentPaymentAmount, splitPayments, total, notify]);

    // Keyboard Shortcuts Logic
    useEffect(() => {
        const handleGlobalKeys = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
            if (e.key === 'Enter' && canCompleteSale) handleComplete();

            // Numerical shortcuts for payment methods (Alt + 1, 2, 3...)
            if (e.altKey) {
                if (e.key === '1') addPaymentMethod('1000');
                if (e.key === '2') addPaymentMethod('1050');
                if (e.key === '3') addPaymentMethod('1060');
            }
        };
        window.addEventListener('keydown', handleGlobalKeys);
        return () => window.removeEventListener('keydown', handleGlobalKeys);
    }, [canCompleteSale, handleComplete, handleCancel, addPaymentMethod]);

    const normalizedBankAccounts = useMemo(() => {
        return (bankAccounts || []).filter(acc => acc.status !== 'Closed');
    }, [bankAccounts]);

    const resolveBankAccount = (
        tokens: string[],
        options?: { allowBankNameMatch?: boolean; excludeNameTokens?: string[] }
    ) => {
        if (normalizedBankAccounts.length === 0) return undefined;
        const loweredTokens = tokens.map(token => token.toLowerCase());
        const exclude = (options?.excludeNameTokens || []).map(token => token.toLowerCase());

        const byAccountNumber = normalizedBankAccounts.find(acc => {
            const accountNumber = (acc.accountNumber || '').toLowerCase();
            return loweredTokens.some(token => accountNumber.includes(token));
        });
        if (byAccountNumber) return byAccountNumber;

        const byName = normalizedBankAccounts.find(acc => {
            const name = (acc.name || '').toLowerCase();
            return loweredTokens.some(token => name.includes(token));
        });
        if (byName) return byName;

        if (!options?.allowBankNameMatch) return undefined;

        return normalizedBankAccounts.find(acc => {
            const name = (acc.name || '').toLowerCase();
            const bank = (acc.bankName || '').toLowerCase();
            if (exclude.some(token => name.includes(token))) return false;
            return loweredTokens.some(token => bank.includes(token));
        });
    };

    const cashBankAccount = useMemo(
        () => resolveBankAccount(['cash'], { allowBankNameMatch: false }),
        [normalizedBankAccounts]
    );
    const bankBankAccount = useMemo(
        () => resolveBankAccount(['bank'], { allowBankNameMatch: true, excludeNameTokens: ['cash', 'mobile', 'momo'] }),
        [normalizedBankAccounts]
    );
    const mobileBankAccount = useMemo(
        () => resolveBankAccount(['mobile', 'momo', 'money'], { allowBankNameMatch: true, excludeNameTokens: ['cash', 'bank'] }),
        [normalizedBankAccounts]
    );

    const cashBalance = cashBankAccount?.availableBalance ?? cashBankAccount?.balance;
    const bankBalance = bankBankAccount?.availableBalance ?? bankBankAccount?.balance;
    const mobileBalance = mobileBankAccount?.availableBalance ?? mobileBankAccount?.balance;
    const formatBalance = (value?: number) => (value === undefined ? '--' : `${currency}${formatNumber(value)}`);

    const hasAdjustments = adjustmentSummary && adjustmentSummary.length > 0;
    const adjustmentTotal = useMemo(() => {
        if (!adjustmentSummary || adjustmentSummary.length === 0) return 0;
        return adjustmentSummary.reduce((sum, adj) => sum + (adj.totalAmount || 0), 0);
    }, [adjustmentSummary]);
    const roundingTotal = Number.isFinite(_roundingAccumulation) ? _roundingAccumulation : 0;

    const creditStatus = useMemo(() => {
        if (!customerName) return { available: 0, blocked: true, reason: 'Walk-in' };
        const subLimit = 0;
        const currentBalance = (invoices || [])
            .filter((i: any) => i.customerName === customerName && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((acc: number, inv: any) => acc + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
        const available = Math.max(0, subLimit - currentBalance);
        const blocked = true; // Block credit for now
        return { available, blocked, reason: 'Credit Disabled', limit: subLimit };
    }, [customerName, invoices]);

    const ButtonBase = ({ icon: Icon, disabled = false, subText, label, accountId }: any) => (
        <button
            onClick={() => addPaymentMethod(accountId)}
            disabled={disabled}
            className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all h-20
            ${disabled
                    ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                    : 'bg-white border-slate-200 hover:border-blue-600 hover:bg-blue-50 active:bg-blue-100'}`}
        >
            <Icon size={22} className={`mb-1 ${disabled ? 'text-slate-400' : 'text-blue-600'}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>{label}</span>
            {subText && <span className="text-[9px] text-slate-500 mt-0.5">{subText}</span>}
        </button>
    );
    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden border border-slate-200">
                {/* Summary Sidebar */}
                <div className="w-[300px] bg-slate-50 p-8 border-r border-slate-200 flex flex-col">
                    <h2 className="text-xs font-bold text-slate-500 mb-8 uppercase tracking-widest">Payment Summary</h2>
                    <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                        <div className="flex justify-between items-end pb-2">
                            <span className="text-xs text-slate-800 font-medium">Order Total</span>
                            <span className="font-bold text-lg text-slate-800">{currency}{formatNumber(total || 0)}</span>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Financial Breakdown</span>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-500">Total Adjustments</span>
                                        <span className="font-mono text-emerald-700 font-semibold">+{currency}{formatNumber(adjustmentTotal)}</span>
                                    </div>
                                    {Math.abs(roundingTotal) > 0.0001 && (
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-500">Round Up</span>
                                        <span className={`font-mono font-semibold ${roundingTotal >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                            {roundingTotal >= 0 ? '+' : ''}{currency}{formatNumber(roundingTotal)}
                                        </span>
                                    </div>
                                    )}
                                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                                        <span className="text-slate-500 font-bold">Profit Margin</span>
                                        <span className="font-mono text-emerald-600 font-bold">{currency}{formatNumber(totalProfitMargin)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Account Balances</span>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
                                        <Banknote size={12} className="text-emerald-600" /> Cash
                                    </div>
                                    <span className="font-mono text-[11px] text-slate-800">{formatBalance(cashBalance)}</span>
                                </div>
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
                                        <CreditCard size={12} className="text-blue-600" /> Bank
                                    </div>
                                    <span className="font-mono text-[11px] text-slate-800">{formatBalance(bankBalance)}</span>
                                </div>
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
                                        <Smartphone size={12} className="text-purple-600" /> Mobile
                                    </div>
                                    <span className="font-mono text-[11px] text-slate-800">{formatBalance(mobileBalance)}</span>
                                </div>
                            </div>
                        </div>

                        {customerName && (
                            <div className="space-y-2">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customer Info</span>
                                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                                    <div className="text-xs font-bold text-slate-800">{customerName}</div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500">Available Credit</span>
                                        <span className={creditStatus.blocked ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{currency}{formatNumber(creditStatus.available || 0)}</span>
                                    </div>
                                    {creditStatus.blocked && (
                                        <div className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-200 flex items-center gap-1">
                                            <AlertCircle size={10} /> {creditStatus.reason}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Swapped: Remaining Due above Change Due in Sidebar */}
                        {effectiveRemainingDue > 0.01 && (
                            <div className="space-y-1 animate-in slide-in-from-bottom-2">
                                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Remaining Due</span>
                                <div className="p-4 bg-white border-l-4 border-blue-600 rounded-xl font-bold text-2xl text-slate-800">
                                    {currency}{formatNumber(effectiveRemainingDue)}
                                </div>
                            </div>
                        )}

                        {changeDue > 0 && (
                            <div className="space-y-1 animate-in slide-in-from-bottom-2">
                                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Change Due</span>
                                <div className="p-4 bg-emerald-50 border-l-4 border-emerald-600 rounded-xl font-bold text-2xl text-emerald-600">
                                    {currency}{formatNumber(changeDue)}
                                </div>
                            </div>
                        )}
                    </div>

                    <button onClick={onCancel} className="mt-4 flex items-center justify-center gap-2 py-1.5 text-sm font-semibold text-blue-600 hover:underline">
                        <ArrowLeftRight size={16} /> Back to Register
                    </button>
                </div>

                {/* Main Payment Area */}
                <div className="flex-1 bg-white overflow-hidden">
                    <div className="h-full overflow-y-auto custom-scrollbar p-10 flex flex-col">
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Amount Received</label>
                            <div className="flex items-center gap-3 border-b-2 border-blue-600 pb-2 max-w-lg">
                                <span className="text-2xl font-bold text-blue-600">{currency}</span>
                                <input
                                    type="number"
                                    className="w-full text-4xl font-bold focus:outline-none text-slate-800 placeholder-slate-300 tracking-tight"
                                    placeholder="0.00"
                                    value={currentPaymentAmount}
                                    onChange={e => setCurrentPaymentAmount(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Swapped positions in Main Payment Area */}
                        <div className="space-y-6 mb-6">
                            {changeDue > 0 && (
                                <div className="animate-in fade-in slide-in-from-top-1">
                                    <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Change Due</span>
                                    <div className="mt-2 p-4 bg-emerald-50 border-l-4 border-emerald-600 rounded-xl font-bold text-2xl text-emerald-600">
                                        {currency}{formatNumber(changeDue)}
                                    </div>
                                </div>
                            )}

                            <div>
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Remaining Due</span>
                                <div className={`mt-2 p-4 rounded-xl border-l-4 font-bold text-2xl ${effectiveRemainingDue > 0.01 ? 'bg-white border-blue-600 text-slate-800' : 'bg-emerald-50 border-emerald-600 text-emerald-600'}`}>
                                    {currency}{formatNumber(effectiveRemainingDue || 0)}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                            {/* Primary Payment Methods - Refactored to horizontal layout */}
                            <button
                                onClick={() => addPaymentMethod('1000')}
                                className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20 
                                    ${activePaymentMethod === '1000' 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                                        : 'bg-white border-slate-200 hover:border-blue-600 hover:bg-blue-50 active:bg-blue-100 text-slate-800'}`}
                            >
                                <div className={`p-2 rounded-lg ${activePaymentMethod === '1000' ? 'bg-white/20' : 'bg-blue-50'}`}>
                                    <Banknote size={24} className={activePaymentMethod === '1000' ? 'text-white' : 'text-blue-600'} />
                                </div>
                                <span className="text-sm font-bold uppercase tracking-wider">Cash</span>
                            </button>

                            <button
                                onClick={() => addPaymentMethod('1050')}
                                className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20 
                                    ${activePaymentMethod === '1050' 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                                        : 'bg-white border-slate-200 hover:border-blue-600 hover:bg-blue-50 active:bg-blue-100 text-slate-800'}`}
                            >
                                <div className={`p-2 rounded-lg ${activePaymentMethod === '1050' ? 'bg-white/20' : 'bg-blue-50'}`}>
                                    <CreditCard size={24} className={activePaymentMethod === '1050' ? 'text-white' : 'text-blue-600'} />
                                </div>
                                <span className="text-sm font-bold uppercase tracking-wider">Bank</span>
                            </button>

                            <button
                                onClick={() => addPaymentMethod('1060')}
                                className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20 
                                    ${activePaymentMethod === '1060' 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                                        : 'bg-white border-slate-200 hover:border-blue-600 hover:bg-blue-50 active:bg-blue-100 text-slate-800'}`}
                            >
                                <div className={`p-2 rounded-lg ${activePaymentMethod === '1060' ? 'bg-white/20' : 'bg-blue-50'}`}>
                                    <Smartphone size={24} className={activePaymentMethod === '1060' ? 'text-white' : 'text-blue-600'} />
                                </div>
                                <span className="text-sm font-bold uppercase tracking-wider">Mobile</span>
                            </button>

                            {/* Conditional Secondary Payment Methods */}
                            {customerName && walletBalance > 0 && (
                                <button
                                    onClick={() => addPaymentMethod('WALLET')}
                                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20
                                        ${activePaymentMethod === 'WALLET'
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200'
                                            : 'bg-white border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 text-slate-800'}`}
                                >
                                    <div className={`p-2 rounded-lg ${activePaymentMethod === 'WALLET' ? 'bg-white/20' : 'bg-emerald-50'}`}>
                                        <Wallet size={24} className={activePaymentMethod === 'WALLET' ? 'text-white' : 'text-emerald-600'} />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm font-bold uppercase tracking-wider">Wallet</span>
                                        <span className={`text-[10px] ${activePaymentMethod === 'WALLET' ? 'text-white/80' : 'text-slate-500'}`}>{currency}{formatNumber(walletBalance)}</span>
                                    </div>
                                </button>
                            )}

                            {customerName && loyaltyPoints > 0 && (
                                <button
                                    onClick={() => addPaymentMethod('LOYALTY')}
                                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20
                                        ${activePaymentMethod === 'LOYALTY'
                                            ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200'
                                            : 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50 active:bg-purple-100 text-slate-800'}`}
                                >
                                    <div className={`p-2 rounded-lg ${activePaymentMethod === 'LOYALTY' ? 'bg-white/20' : 'bg-purple-50'}`}>
                                        <Award size={24} className={activePaymentMethod === 'LOYALTY' ? 'text-white' : 'text-purple-600'} />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm font-bold uppercase tracking-wider">Loyalty</span>
                                        <span className={`text-[10px] ${activePaymentMethod === 'LOYALTY' ? 'text-white/80' : 'text-slate-500'}`}>{loyaltyPoints} Points</span>
                                    </div>
                                </button>
                            )}

                            {customerName && !creditStatus.blocked && creditStatus.available > 0 && (
                                <button
                                    onClick={() => addPaymentMethod('CREDIT')}
                                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all h-20
                                        ${activePaymentMethod === 'CREDIT'
                                            ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-200'
                                            : 'bg-white border-slate-200 hover:border-amber-600 hover:bg-amber-50 active:bg-amber-100 text-slate-800'}`}
                                >
                                    <div className={`p-2 rounded-lg ${activePaymentMethod === 'CREDIT' ? 'bg-white/20' : 'bg-amber-50'}`}>
                                        <Briefcase size={24} className={activePaymentMethod === 'CREDIT' ? 'text-white' : 'text-amber-600'} />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm font-bold uppercase tracking-wider">Credit</span>
                                        <span className={`text-[10px] ${activePaymentMethod === 'CREDIT' ? 'text-white/80' : 'text-slate-500'}`}>{currency}{formatNumber(creditStatus.available)}</span>
                                    </div>
                                </button>
                            )}
                        </div>

                        <div className="mt-auto space-y-6">
                            {splitPayments.length > 0 && (
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Breakdown</span>
                                    <div className="flex flex-wrap gap-2">
                                        {splitPayments.map((p, i) => (
                                            <div key={i} className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-3">
                                                <span className="text-xs font-bold text-slate-800 uppercase">{p.method}</span>
                                                <span className="font-bold text-blue-600">{currency}{formatNumber(p.amount)}</span>
                                                <button onClick={() => {
                                                    setSplitPayments(prev => prev.filter((_, idx) => idx !== i));
                                                    setActivePaymentMethod(null);
                                                    const totalPaid = splitPayments.filter((_, idx) => idx !== i).reduce((s, x) => s + x.amount, 0);
                                                    setRemainingDue(total - totalPaid);
                                                    setChangeDue(0);
                                                    setCurrentPaymentAmount((total - totalPaid).toFixed(2));
                                                }} className="text-[#8d9096] hover:text-[#d52b1e] p-0.5"><X size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleComplete}
                                disabled={!canCompleteSale}
                                className={`w-full py-4 rounded-full font-bold text-base transition-all flex items-center justify-center gap-3 shadow-sm
                                    ${!canCompleteSale
                                        ? 'bg-slate-300 text-white cursor-not-allowed'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                            >
                                {!canCompleteSale ? (
                                    <><span>Awaiting Payment</span> <Clock size={20} /></>
                                ) : (
                                    <><span>Complete Sale</span> <CheckCircle2 size={20} /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
