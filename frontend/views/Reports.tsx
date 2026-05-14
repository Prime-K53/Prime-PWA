import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  BarChart3,
  Coins,
  Filter,
  PieChart as PieChartIcon,
  Printer,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useLocation, useNavigate } from 'react-router-dom';
import SalesAudit from './reports/SalesAudit';
import RevenueDashboard from './reports/RevenueDashboard';
import ClientLedger from './reports/ClientLedger';
import InternalAuditor from './reports/InternalAuditor';
import RoundingAnalytics from './reports/RoundingAnalytics';
import BusinessHealthReport from './reports/BusinessHealthReport';
import { getRevenueSourceLabel } from '../services/revenueAnalysisService';
import {
  buildRevenueReportingSnapshot,
  buildRevenueReportingSnapshotFromLines,
  type RevenueDateRange,
} from '../services/revenueReportingService';

type ReportCategory =
  | 'Overview'
  | 'Sales Audit'
  | 'Auditor'
  | 'Financials'
  | 'Client Ledger'
  | 'Margin Performance'
  | 'Rounding Analytics'
  | 'Business Intel'
  | 'Health Diagnostic';

const Reports: React.FC = () => {
  const {
    sales = [],
    invoices = [],
    orders = [],
    customers = [],
    examinationBatches = [],
    companyConfig,
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || '$';

  const [activeCategory, setActiveCategory] = useState<ReportCategory>(() => {
    if (location.pathname.includes('sales-audit')) return 'Sales Audit';
    if (location.pathname.includes('margin-performance')) return 'Margin Performance';
    if (location.pathname.includes('rounding-analytics')) return 'Rounding Analytics';
    if (location.pathname.includes('financials')) return 'Financials';
    if (location.pathname.includes('contacts')) return 'Client Ledger';
    if (location.pathname.includes('auditor')) return 'Auditor';
    if (location.pathname.includes('intel')) return 'Business Intel';
    if (location.pathname.includes('health')) return 'Health Diagnostic';
    return 'Overview';
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSubAccountNames, setSelectedSubAccountNames] = useState<string[]>([]);
  const [isCustomerFilterOpen, setIsCustomerFilterOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<RevenueDateRange>('all');

  useEffect(() => {
    if (location.pathname.includes('sales-audit')) setActiveCategory('Sales Audit');
    else if (location.pathname.includes('margin-performance')) setActiveCategory('Margin Performance');
    else if (location.pathname.includes('rounding-analytics')) setActiveCategory('Rounding Analytics');
    else if (location.pathname.includes('financials')) setActiveCategory('Financials');
    else if (location.pathname.includes('contacts')) setActiveCategory('Client Ledger');
    else if (location.pathname.includes('auditor')) setActiveCategory('Auditor');
    else if (location.pathname.includes('intel')) setActiveCategory('Business Intel');
    else if (location.pathname.includes('health')) setActiveCategory('Health Diagnostic');
    else if (location.pathname.endsWith('/revenue') || location.pathname.endsWith('/reports')) setActiveCategory('Overview');
  }, [location.pathname]);

  const handleTabClick = (id: string) => {
    setActiveCategory(id as ReportCategory);
    const routeMap: Record<string, string> = {
      Overview: '/revenue',
      'Sales Audit': '/revenue/sales-audit',
      'Margin Performance': '/revenue/margin-performance',
      'Rounding Analytics': '/revenue/rounding-analytics',
      'Client Ledger': '/revenue/contacts',
      Auditor: '/revenue/auditor',
      'Business Intel': '/revenue/intel',
      'Health Diagnostic': '/revenue/health',
      Financials: '/fiscal-reports/financials',
    };
    if (routeMap[id]) navigate(routeMap[id]);
  };

  const formatCurrency = (value: number) =>
    `${currency}${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const marginBaseReport = useMemo(
    () =>
      buildRevenueReportingSnapshot({
        sales,
        invoices,
        orders,
        batches: examinationBatches,
        dateRange: selectedDateRange,
        trendDays: 12,
      }),
    [sales, invoices, orders, examinationBatches, selectedDateRange]
  );

  const selectedCustomerName = useMemo(
    () => customers.find((customer: any) => customer.id === selectedCustomerId)?.name || '',
    [customers, selectedCustomerId]
  );

  const availableSubAccounts = useMemo(() => {
    if (!selectedCustomerId) return [];
    const customer = customers.find((entry: any) => entry.id === selectedCustomerId);
    return ['Main', ...((customer?.subAccounts || []).map((sub: any) => String(sub?.name || '').trim()).filter(Boolean))];
  }, [customers, selectedCustomerId]);

  const marginScopedLines = useMemo(() => {
    return marginBaseReport.lines.filter((line) => {
      if (selectedCustomerName && line.customerName !== selectedCustomerName) return false;
      if (selectedSubAccountNames.length > 0) {
        const normalizedSubAccount = String(line.subAccountName || 'Main').trim() || 'Main';
        if (!selectedSubAccountNames.includes(normalizedSubAccount)) return false;
      }
      return true;
    });
  }, [marginBaseReport.lines, selectedCustomerName, selectedSubAccountNames]);

  const marginReport = useMemo(
    () => buildRevenueReportingSnapshotFromLines({ lines: marginScopedLines, trendDays: 12 }),
    [marginScopedLines]
  );

  const renderAuditor = () => <InternalAuditor />;
  const renderClientLedger = () => <ClientLedger />;
  const renderBusinessIntel = () => <BusinessHealthReport />;

  const renderMarginPerformance = () => {
    const marginPercent = marginReport.totals.revenue > 0
      ? (marginReport.totals.profitMargin / marginReport.totals.revenue) * 100
      : 0;
    const adjustmentShare = marginReport.totals.revenue > 0
      ? (marginReport.totals.adjustmentTotal / marginReport.totals.revenue) * 100
      : 0;

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Margin Rate</p>
                <h3 className={`text-2xl font-black mt-1 tabular-nums ${marginPercent >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {marginPercent.toFixed(1)}%
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  {selectedCustomerName ? `${selectedCustomerName} scope` : 'All revenue sources'}
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <TrendingUp size={24} className="text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Profit Margin</p>
                <h3 className="text-2xl font-black text-blue-600 mt-1 tabular-nums">
                  {formatCurrency(marginReport.totals.profitMargin)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">{marginReport.totals.transactionCount} transactions</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <BarChart3 size={24} className="text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Market Adjustments</p>
                <h3 className="text-2xl font-black text-indigo-600 mt-1 tabular-nums">
                  {formatCurrency(marginReport.totals.adjustmentTotal)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">{adjustmentShare.toFixed(1)}% of revenue</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-xl">
                <Coins size={24} className="text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Rounding Impact</p>
                <h3 className={`text-2xl font-black mt-1 tabular-nums ${marginReport.totals.roundingTotal >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  {marginReport.totals.roundingTotal >= 0 ? '+' : ''}
                  {formatCurrency(marginReport.totals.roundingTotal)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">Net round up / down</p>
              </div>
              <div className="p-3 bg-slate-100 rounded-xl">
                <Activity size={24} className="text-slate-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-500" />
              Margin Trend
            </h3>
            <div style={{ width: '100%', height: 256, minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={160} minWidth={0}>
                <AreaChart data={marginReport.trend}>
                  <defs>
                    <linearGradient id="marginProfitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="marginAdjustmentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
                  <Area type="monotone" dataKey="profitMargin" name="Profit Margin" stroke="#10b981" strokeWidth={2} fill="url(#marginProfitFill)" />
                  <Area type="monotone" dataKey="adjustmentTotal" name="Adjustments" stroke="#6366f1" strokeWidth={2} fill="url(#marginAdjustmentFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
              <Activity size={18} className="text-blue-500" />
              Source Performance
            </h3>
            <div style={{ width: '100%', height: 256, minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={160} minWidth={0}>
                <BarChart
                  data={marginReport.sources.map((source) => ({
                    ...source,
                    label: getRevenueSourceLabel(source.source),
                  }))}
                >
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
                  <Bar dataKey="profitMargin" name="Profit Margin" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="adjustmentTotal" name="Adjustments" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            Revenue Source Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100 uppercase">
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Material Cost</th>
                  <th className="px-4 py-3 text-right">Adjustments</th>
                  <th className="px-4 py-3 text-right">Profit Margin</th>
                  <th className="px-4 py-3 text-right">Rounding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {marginReport.sources.map((source) => (
                  <tr key={source.source} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-700">{getRevenueSourceLabel(source.source)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{source.transactionCount}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatCurrency(source.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 font-semibold tabular-nums">{formatCurrency(source.materialCost)}</td>
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

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-500" />
              Top Items by Margin
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400 font-bold text-[10px] tracking-widest border-b border-slate-100 uppercase">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Adjustments</th>
                    <th className="px-4 py-3 text-right">Profit Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {marginReport.topItems.slice(0, 10).map((item) => (
                    <tr key={`${item.source}-${item.itemName}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-700">{item.itemName}</td>
                      <td className="px-4 py-3 text-slate-500">{getRevenueSourceLabel(item.source)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatCurrency(item.revenue)}</td>
                      <td className="px-4 py-3 text-right text-indigo-700 font-semibold tabular-nums">{formatCurrency(item.adjustmentTotal)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-semibold tabular-nums">{formatCurrency(item.profitMargin)}</td>
                    </tr>
                  ))}
                  {marginReport.topItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">No item margin data found for this scope.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-4 flex items-center gap-2">
              <Coins size={18} className="text-indigo-500" />
              Adjustment Ledger
            </h3>
            <div className="space-y-3">
              {marginReport.topAdjustments.slice(0, 8).map((adjustment) => (
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
              {marginReport.topAdjustments.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">No adjustment rows captured in this scope.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const NAV_ITEMS = [
    { id: 'Overview', label: 'Dashboard', icon: Activity },
    { id: 'Sales Audit', label: 'Sales Audit', icon: Receipt },
    { id: 'Margin Performance', label: 'Margin Performance', icon: BarChart3 },
    { id: 'Rounding Analytics', label: 'Rounding Analytics', icon: Activity },
    { id: 'Client Ledger', label: 'Client Ledger', icon: Users },
    { id: 'Business Intel', label: 'Business Intel', icon: PieChartIcon },
    { id: 'Health Diagnostic', label: 'Health Diagnostic', icon: Sparkles },
    { id: 'Auditor', label: 'Internal Auditor', icon: ShieldCheck },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] font-sans text-[13px] leading-[1.5] text-slate-700 overflow-hidden">
      <div className="bg-white border-b border-slate-200 shrink-0 px-6 py-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-bold text-2xl text-slate-900 tracking-tight">Business Intelligence</h2>
            <p className="text-slate-500 text-sm font-medium">Financial insights and performance metrics</p>
          </div>
          <div className="flex gap-2">
            {activeCategory === 'Margin Performance' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(['all', 'week', 'month', 'quarter', 'year'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setSelectedDateRange(range)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedDateRange === range ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {range === 'all' ? 'All' : range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            )}

            <div className="relative mr-4">
              <button
                onClick={() => setIsCustomerFilterOpen(!isCustomerFilterOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-semibold tracking-wide ${
                  selectedCustomerId ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'
                }`}
              >
                <Filter size={16} />
                {selectedCustomerId ? customers.find((customer: any) => customer.id === selectedCustomerId)?.name : 'Filter by Customer'}
                {selectedCustomerId && (
                  <X
                    size={16}
                    className="ml-1 hover:text-rose-500 transition-colors"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCustomerId('');
                      setSelectedSubAccountNames([]);
                    }}
                  />
                )}
              </button>

              {isCustomerFilterOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[12px] font-semibold text-slate-400 tracking-widest block">Select customer</label>
                      <button onClick={() => setIsCustomerFilterOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    </div>
                    <select
                      value={selectedCustomerId}
                      onChange={(event) => {
                        setSelectedCustomerId(event.target.value);
                        setSelectedSubAccountNames([]);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">All customers</option>
                      {customers.map((customer: any) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>

                    {selectedCustomerId && availableSubAccounts.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <label className="text-[12px] font-semibold text-slate-400 tracking-widest mb-2 block">Filter sub-accounts</label>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                          {availableSubAccounts.map((subAccount) => (
                            <label key={subAccount} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors group">
                              <input
                                type="checkbox"
                                checked={selectedSubAccountNames.includes(subAccount)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setSelectedSubAccountNames([...selectedSubAccountNames, subAccount]);
                                  } else {
                                    setSelectedSubAccountNames(selectedSubAccountNames.filter((entry) => entry !== subAccount));
                                  }
                                }}
                                className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-[13px] font-medium text-slate-600 group-hover:text-blue-600 transition-colors">{subAccount}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 font-medium">Leave unchecked to include all sub-accounts.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              <button
                onClick={() => window.print()}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Print report"
              >
                <Printer size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeCategory === item.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id="report-content" className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50">
        <div className="max-w-[1600px] mx-auto">
          {activeCategory === 'Overview' && <RevenueDashboard />}
          {activeCategory === 'Sales Audit' && <SalesAudit />}
          {activeCategory === 'Margin Performance' && renderMarginPerformance()}
          {activeCategory === 'Rounding Analytics' && <RoundingAnalytics />}
          {activeCategory === 'Client Ledger' && renderClientLedger()}
          {activeCategory === 'Business Intel' && renderBusinessIntel()}
          {activeCategory === 'Health Diagnostic' && <BusinessHealthReport />}
          {activeCategory === 'Auditor' && renderAuditor()}
        </div>
      </div>
    </div>
  );
};

export default Reports;
