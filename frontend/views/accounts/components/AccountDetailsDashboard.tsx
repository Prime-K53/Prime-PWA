import React, { useMemo } from 'react';
import { 
  Landmark, TrendingUp, History, 
  Shield, Activity, X
} from 'lucide-react';
import { Account } from '../../../types';
import { useData } from '../../../context/DataContext';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

interface AccountDetailsDashboardProps {
  account: Account;
  onClose: () => void;
}

export const AccountDetailsDashboard: React.FC<AccountDetailsDashboardProps> = ({ account, onClose }) => {
  const { ledger, companyConfig } = useData();
  const currency = companyConfig?.currencySymbol || '$';

  const accountEntries = useMemo(() => {
    return (ledger || []).filter((e: any) => 
      e.debitAccountId === account.id || 
      e.debitAccountId === account.code ||
      e.creditAccountId === account.id || 
      e.creditAccountId === account.code
    ).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [ledger, account]);

  const stats = useMemo(() => {
    let balance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const isAssetOrExpense = account.type === 'Asset' || account.type === 'Expense';
    
    const chartData = accountEntries.map((entry: any) => {
        const isDebit = entry.debitAccountId === account.id || entry.debitAccountId === account.code;
        const isCredit = entry.creditAccountId === account.id || entry.creditAccountId === account.code;
        
        if (isDebit) totalDebit += entry.amount;
        if (isCredit) totalCredit += entry.amount;

        if (isAssetOrExpense) {
            if (isDebit) balance += entry.amount;
            if (isCredit) balance -= entry.amount;
        } else {
            if (isCredit) balance += entry.amount;
            if (isDebit) balance -= entry.amount;
        }

        return {
            date: entry.date,
            balance: balance,
            amount: entry.amount,
            type: isDebit ? 'Debit' : 'Credit'
        };
    });

    return { balance, totalDebit, totalCredit, chartData };
  }, [accountEntries, account]);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-slate-50 w-full max-w-7xl h-[95vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
        {/* Header */}
        <div className="p-10 border-b border-slate-200 bg-white flex justify-between items-start shrink-0">
          <div className="flex gap-8 items-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-200">
              <Landmark size={40} />
            </div>
            <div>
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    {account.name}
                </h1>
                <span className="px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200">
                  {account.code}
                </span>
              </div>
              <div className="flex items-center gap-6 text-slate-500 font-bold text-sm uppercase tracking-widest">
                <span className="flex items-center gap-2">
                    <History size={16} className="text-blue-500" /> {account.type} Account
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <span className="flex items-center gap-2">
                    <Activity size={16} className="text-emerald-500" /> Status: Active
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-4 bg-white border border-slate-200 text-slate-400 rounded-3xl hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all shadow-sm"
          >
            <X size={24} />
          </button>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
          {/* Top Row: Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 group-hover:bg-blue-100 transition-colors duration-500"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Current Balance</p>
                <p className="text-4xl font-black text-slate-900 tracking-tighter relative z-10 tabular-nums">
                    {currency}{stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm group">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Total Debits</p>
                <p className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums">
                    {currency}{stats.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm group">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">Total Credits</p>
                <p className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums">
                    {currency}{stats.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm group">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Transactions</p>
                <p className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums">
                    {accountEntries.length}
                </p>
            </div>
          </div>

          {/* Middle Row: Charts and Audit Trail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Balance Explorer */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
                <div className="flex justify-between items-center mb-10">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <TrendingUp size={24} className="text-blue-600" /> Balance Performance
                    </h3>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical View</span>
                    </div>
                </div>
                <div className="flex-1 w-full h-[350px]">
                    <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                        <AreaChart data={stats.chartData}>
                            <defs>
                                <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="date" 
                                hide 
                            />
                            <YAxis 
                                hide 
                                domain={['auto', 'auto']}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#2563eb" 
                                strokeWidth={4} 
                                fillOpacity={1} 
                                fill="url(#colorBal)" 
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Account Activity Audit Trail */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[700px]">
                <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3 uppercase">
                        <Shield size={24} className="text-indigo-600" /> Security Audit Trace
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                    <AuditTimeline entityType="account" entityId={account.code} />
                </div>
            </div>
          </div>

          {/* Bottom Row: Recent Ledger Entries */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-3">
                    <History size={18} className="text-slate-400" /> Recent Ledger Entries
                </h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing last 20 operations</span>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-200">
                        <tr>
                            <th className="px-8 py-5 font-black text-slate-400 text-[10px] uppercase tracking-widest">Date / ID</th>
                            <th className="px-8 py-5 font-black text-slate-400 text-[10px] uppercase tracking-widest">Description</th>
                            <th className="px-8 py-5 font-black text-slate-400 text-[10px] uppercase tracking-widest text-right">Debit</th>
                            <th className="px-8 py-5 font-black text-slate-400 text-[10px] uppercase tracking-widest text-right">Credit</th>
                            <th className="px-8 py-5 font-black text-slate-400 text-[10px] uppercase tracking-widest text-right">Reference</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {[...accountEntries].reverse().slice(0, 20).map((entry: any) => {
                            const isDebit = entry.debitAccountId === account.id || entry.debitAccountId === account.code;
                            return (
                                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="text-xs font-bold text-slate-900">{new Date(entry.date).toLocaleDateString()}</div>
                                        <div className="text-[10px] font-mono text-slate-400 mt-1 uppercase">#{entry.id.split('-')[0]}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="font-black text-slate-800 tracking-tight">{entry.description}</div>
                                    </td>
                                    <td className="px-8 py-6 text-right tabular-nums">
                                        {isDebit ? (
                                            <span className="font-black text-slate-900">{currency}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-8 py-6 text-right tabular-nums">
                                        {!isDebit ? (
                                            <span className="font-black text-slate-900">{currency}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-600 border border-slate-200 uppercase tracking-tighter">
                                            {entry.referenceId || 'N/A'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
