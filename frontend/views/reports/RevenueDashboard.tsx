import React, { useEffect, useMemo, useState } from 'react';
import { useData, REFRESH_INTERVAL } from '../../context/DataContext';
import { useModuleRefresh } from '../../hooks/useModuleRefresh';
import {
  Activity,
  Coins,
  DollarSign,
  Layers3,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getRevenueSourceLabel } from '../../services/revenueAnalysisService';
import {
  buildRevenueReportingSnapshot,
  matchesRevenueDateRange,
  type RevenueDateRange,
} from '../../services/revenueReportingService';

const RevenueDashboard: React.FC = () => {
  const {
    sales = [],
    invoices = [],
    orders = [],
    expenses = [],
    examinationBatches = [],
    companyConfig,
    refreshAllData,
    isLoading,
  } = useData();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Force data refresh on mount to ensure latest data is loaded
  useEffect(() => {
    const loadData = async () => {
      setIsRefreshing(true);
      await refreshAllData?.();
      setIsRefreshing(false);
    };
    loadData();
  }, []);

  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });

  const currency = companyConfig?.currencySymbol || '$';
  const [dateRange, setDateRange] = useState<RevenueDateRange>('month');

  const formatCurrency = (value: number) =>
    `${currency}${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const report = useMemo(
    () =>
      buildRevenueReportingSnapshot({
        sales,
        invoices,
        orders,
        batches: examinationBatches,
        dateRange,
        trendDays: 7,
      }),
    [sales, invoices, orders, examinationBatches, dateRange]
  );

  const operatingExpenses = useMemo(
    () =>
      (expenses || [])
        .filter((expense: any) => matchesRevenueDateRange(expense?.date, dateRange))
        .reduce((sum: number, expense: any) => sum + Number(expense?.amount || 0), 0),
    [expenses, dateRange]
  );

  const outstandingReceivables = useMemo(
    () =>
      (invoices || [])
        .filter((invoice: any) => matchesRevenueDateRange(invoice?.date, dateRange))
        .filter((invoice: any) => !['cancelled', 'draft'].includes(String(invoice?.status || '').toLowerCase()))
        .reduce((sum: number, invoice: any) => {
          const total = Number(invoice?.totalAmount || invoice?.total || 0);
          const paid = Number(invoice?.paidAmount || 0);
          return sum + Math.max(0, total - paid);
        }, 0),
    [invoices, dateRange]
  );

  const netContribution = report.totals.profitMargin - operatingExpenses;

  const kpis = [
    {
      label: 'Recognized Revenue',
      value: formatCurrency(report.totals.revenue),
      subtext: `${report.totals.transactionCount} posted transactions`,
      icon: TrendingUp,
      tone: 'emerald',
    },
    {
      label: 'Material Cost',
      value: formatCurrency(report.totals.materialCost),
      subtext: 'Recovered from sales and examination',
      icon: Layers3,
      tone: 'slate',
    },
    {
      label: 'Market Adjustments',
      value: formatCurrency(report.totals.adjustmentTotal),
      subtext: `${report.topAdjustments.length} tracked adjustment type(s)`,
      icon: Coins,
      tone: 'indigo',
    },
    {
      label: 'Profit Margin',
      value: formatCurrency(report.totals.profitMargin),
      subtext: report.totals.revenue > 0
        ? `${((report.totals.profitMargin / report.totals.revenue) * 100).toFixed(1)}% of revenue`
        : 'No revenue in range',
      icon: DollarSign,
      tone: report.totals.profitMargin >= 0 ? 'blue' : 'rose',
    },
    {
      label: 'Round Up / Down',
      value: `${report.totals.roundingTotal >= 0 ? '+' : ''}${formatCurrency(report.totals.roundingTotal)}`,
      subtext: 'Net rounding effect',
      icon: Activity,
      tone: report.totals.roundingTotal >= 0 ? 'blue' : 'rose',
    },
    {
      label: 'Outstanding AR',
      value: formatCurrency(outstandingReceivables),
      subtext: 'Open invoice exposure',
      icon: Wallet,
      tone: 'amber',
    },
  ];

  const toneClasses: Record<string, { icon: string; card: string; value: string }> = {
    emerald: { icon: 'text-emerald-600 bg-emerald-50', card: 'border-emerald-100', value: 'text-emerald-700' },
    slate: { icon: 'text-slate-600 bg-slate-100', card: 'border-slate-200', value: 'text-slate-900' },
    indigo: { icon: 'text-indigo-600 bg-indigo-50', card: 'border-indigo-100', value: 'text-indigo-700' },
    blue: { icon: 'text-blue-600 bg-blue-50', card: 'border-blue-100', value: 'text-blue-700' },
    amber: { icon: 'text-amber-600 bg-amber-50', card: 'border-amber-100', value: 'text-amber-700' },
    rose: { icon: 'text-rose-600 bg-rose-50', card: 'border-rose-100', value: 'text-rose-700' },
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Revenue Analysis</h2>
            <p className="text-slate-500 text-sm font-medium">Unified tracking for sales, order-form invoices, and examination billing.</p>
          </div>
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            {(['week', 'month', 'quarter', 'year', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  dateRange === range ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            const tone = toneClasses[kpi.tone];
            return (
              <div key={kpi.label} className={`bg-white p-5 rounded-2xl border shadow-sm ${tone.card}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">{kpi.label}</p>
                    <h3 className={`text-2xl font-black mt-1 tabular-nums ${tone.value}`}>{kpi.value}</h3>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">{kpi.subtext}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${tone.icon}`}>
                    <Icon size={22} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-2xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-300 tracking-widest uppercase">Operating Expenses</p>
              <h3 className="text-2xl font-black mt-1 tabular-nums">{formatCurrency(operatingExpenses)}</h3>
              <p className="text-[11px] text-slate-300 mt-1 font-medium">Operating expenses inside the selected window</p>
            </div>
            <div className="p-3 bg-white/10 rounded-xl">
              <TrendingDown size={22} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-5 rounded-2xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-blue-100 tracking-widest uppercase">Net Contribution</p>
              <h3 className="text-2xl font-black mt-1 tabular-nums">{formatCurrency(netContribution)}</h3>
              <p className="text-[11px] text-blue-100 mt-1 font-medium">Profit margin less operating expenses</p>
            </div>
            <div className="p-3 bg-white/15 rounded-xl">
              <Receipt size={22} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" />
            7-Day Revenue vs Margin Trend
          </h3>
          <div style={{ width: '100%', height: 280, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={0}>
              <AreaChart data={report.trend}>
                <defs>
                  <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="trendMargin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), '']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} fill="url(#trendRevenue)" />
                <Area type="monotone" dataKey="profitMargin" name="Profit Margin" stroke="#2563eb" strokeWidth={2} fill="url(#trendMargin)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
            <Users size={18} className="text-violet-500" />
            Top Customers
          </h3>
          <div className="space-y-3">
            {report.customers.slice(0, 6).map((customer, index) => (
              <div key={`${customer.customerName}-${index}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{customer.customerName}</p>
                  <p className="text-[11px] text-slate-500">{customer.transactionCount} transaction(s)</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 tabular-nums text-sm">{formatCurrency(customer.revenue)}</p>
                  <p className="text-[11px] text-emerald-600 font-medium">{formatCurrency(customer.profitMargin)} margin</p>
                </div>
              </div>
            ))}
            {report.customers.length === 0 && (
              <div className="text-center text-slate-400 py-10 text-sm">No revenue records available for this range.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            Revenue by Source
          </h3>
          <div style={{ width: '100%', height: 250, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={0}>
              <BarChart data={report.sources.map((source) => ({
                ...source,
                label: getRevenueSourceLabel(source.source),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${currency}${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), '']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profitMargin" name="Profit Margin" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
            <Coins size={18} className="text-indigo-500" />
            Adjustment Ledger
          </h3>
          <div className="space-y-3">
            {report.topAdjustments.slice(0, 6).map((adjustment) => (
              <div key={`${adjustment.source}-${adjustment.adjustmentName}`} className="flex items-center justify-between p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/60">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{adjustment.adjustmentName}</p>
                  <p className="text-[11px] text-slate-500">
                    {getRevenueSourceLabel(adjustment.source)} · {adjustment.transactionCount} transaction(s)
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-indigo-700 tabular-nums text-sm">{formatCurrency(adjustment.totalAmount)}</p>
                  <p className="text-[11px] text-slate-500">{adjustment.applicationCount} application(s)</p>
                </div>
              </div>
            ))}
            {report.topAdjustments.length === 0 && (
              <div className="text-center text-slate-400 py-10 text-sm">No adjustment entries captured in this range.</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
          <Receipt size={18} className="text-slate-500" />
          Source Summary
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] tracking-widest uppercase">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Transactions</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Adjustments</th>
                <th className="px-4 py-3 text-right">Profit Margin</th>
                <th className="px-4 py-3 text-right">Rounding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report.sources.map((source) => (
                <tr key={source.source} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-700">{getRevenueSourceLabel(source.source)}</td>
                  <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{source.transactionCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatCurrency(source.revenue)}</td>
                  <td className="px-4 py-3 text-right text-indigo-700 font-semibold tabular-nums">{formatCurrency(source.adjustmentTotal)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold tabular-nums">{formatCurrency(source.profitMargin)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${source.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                    {source.roundingTotal >= 0 ? '+' : ''}
                    {formatCurrency(source.roundingTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
          <Receipt size={18} className="text-slate-500" />
          Recent Revenue Transactions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] tracking-widest uppercase">
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Adjustments</th>
                <th className="px-4 py-3 text-right">Profit Margin</th>
                <th className="px-4 py-3 text-right">Rounding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report.transactions.slice(0, 8).map((transaction) => (
                <tr key={transaction.key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-700">{transaction.transactionNumber}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(transaction.date).toLocaleDateString()}
                      {transaction.subAccountName ? ` · ${transaction.subAccountName}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{getRevenueSourceLabel(transaction.source)}</td>
                  <td className="px-4 py-3 text-slate-700">{transaction.customerName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatCurrency(transaction.revenue)}</td>
                  <td className="px-4 py-3 text-right text-indigo-700 font-semibold tabular-nums">{formatCurrency(transaction.adjustmentTotal)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold tabular-nums">{formatCurrency(transaction.profitMargin)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${transaction.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                    {transaction.roundingTotal >= 0 ? '+' : ''}
                    {formatCurrency(transaction.roundingTotal)}
                  </td>
                </tr>
              ))}
              {report.transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No revenue transactions found for the selected range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RevenueDashboard;
