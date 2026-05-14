
import React, { useState, useEffect } from 'react';
import { X, DollarSign, Wallet, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { Purchase, SupplierPayment } from '../../../types';
import { DEFAULT_ACCOUNTS } from '../../../constants';

interface SupplierPaymentModalProps {
    purchase: Purchase;
    onClose: () => void;
    onRecord: (payment: SupplierPayment) => void;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({ purchase, onClose, onRecord }) => {
    const remainingBalance = purchase.total - (purchase.paidAmount || 0);
    const [amount, setAmount] = useState(remainingBalance.toString());
    const [selectedAccountId, setSelectedAccountId] = useState('1000'); // Default to Cash Account

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);
        
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert("Please enter a valid positive amount.");
            return;
        }

        const selectedAccount = DEFAULT_ACCOUNTS.find(a => a.id === selectedAccountId);
        
        const payment: SupplierPayment = {
            id: '',
            date: new Date().toISOString(),
            supplierId: purchase.supplierId,
            amount: paymentAmount,
            accountId: selectedAccountId,
            paymentMethod: selectedAccount?.name.includes('Cash') ? 'Cash' : 
                          (selectedAccount?.name.includes('Mobile') ? 'Mobile Money' : 'Bank'),
            status: 'Cleared',
            reconciled: false,
            allocations: [{
                purchaseId: purchase.id,
                amount: paymentAmount
            }]
        };

        onRecord(payment);
    };

    const getIcon = (accountId: string) => {
        if (accountId === '1000') return <Banknote size={20} />;
        if (accountId === '1050') return <CreditCard size={20} />;
        if (accountId === '1060') return <Smartphone size={20} />;
        return <Wallet size={20} />;
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Record Supplier Payment</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Bill #{purchase.id} • Balance: ${remainingBalance.toLocaleString()}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-2">Payment Amount</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <DollarSign size={20} />
                            </div>
                            <input
                                autoFocus
                                type="number"
                                step="0.01"
                                className="w-full pl-12 pr-4 py-4 border-2 border-slate-100 rounded-2xl bg-slate-50 text-2xl font-bold text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-3">Select Payment Account</label>
                        <div className="grid grid-cols-1 gap-3">
                            {DEFAULT_ACCOUNTS.filter(a => ['1000', '1050', '1060'].includes(a.id)).map(account => (
                                <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => setSelectedAccountId(account.id)}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                                        selectedAccountId === account.id
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/20'
                                            : 'border-slate-100 hover:border-slate-200 bg-white text-slate-600'
                                    }`}
                                >
                                    <div className={`p-2 rounded-xl ${selectedAccountId === account.id ? 'bg-blue-100' : 'bg-slate-100'}`}>
                                        {getIcon(account.id)}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-sm">{account.name}</div>
                                        <div className="text-[10px] opacity-70 uppercase tracking-wider font-semibold">{account.code}</div>
                                    </div>
                                    {selectedAccountId === account.id && (
                                        <div className="ml-auto">
                                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                <div className="w-2 h-2 bg-white rounded-full" />
                                            </div>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-[2] px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
                        >
                            Record Payment
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
