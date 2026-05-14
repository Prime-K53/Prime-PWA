import React, { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Calendar, ChevronDown, RefreshCw, AlertCircle, Zap } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { buildRevenueReportingSnapshot } from '../../services/revenueReportingService';


type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year',
};

const periodStart = (period: Period): Date => {
  const now = new Date();
  switch (period) {
    case 'today':   { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    case 'week':    { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
    case 'month':   { return new Date(now.getFullYear(), now.getMonth(), 1); }
    case 'quarter': { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
    case 'year':    { return new Date(now.getFullYear(), 0, 1); }
  }
};

const fmt = (n: number, currency = 'K') =>
  `${n >= 0 ? '' : '-'}${currency}${Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ──────────────────────────────────────────────────────────────
const RoundingAnalytics: React.FC = () => {
  const {
    sales = [],
    invoices = [],
    orders = [],
    examinationBatches = [],
    companyConfig,
    isLoading,
  } = useData();

  const currency = companyConfig?.currencySymbol || 'K';
  const [period, setPeriod] = useState<Period>('week');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);

  // Build unified revenue snapshot for the selected period
  const periodDateRange = useMemo((): 'week' | 'month' | 'quarter' | 'year' | 'all' => {
    if (period === 'today') return 'week'; // 'today' not in RevenueDateRange; use custom filter below
    return period;
  }, [period]);

  const revenueSnapshot = useMemo(() => buildRevenueReportingSnapshot({
    sales,
    invoices,
    orders,
    batches: examinationBatches,
    dateRange: periodDateRange,
    trendDays: 7,
  }), [sales, invoices, orders, examinationBatches, periodDateRange]);

  // For 'today' we need an extra client-side filter on the lines
  const filtered = useMemo(() => {
    const start = periodStart(period);
    if (period === 'today') {
      return revenueSnapshot.lines.filter(line => new Date(line.date) >= start);
    }
    return revenueSnapshot.lines;
  }, [revenueSnapshot.lines, period]);

  const stats = useMemo(() => {
    let totalRounding = 0, gainCount = 0, lossCount = 0, zeroCount = 0;
    let totalRoundedItems = 0, totalItems = 0;
    const methodMap: Record<string, { method: string; total: number; count: number; gain: number; loss: number }> = {};
    const productMap: Record<string, { name: string; total: number; count: number; revenue: number }> = {};
    const dailyMap: Record<string, { gain: number; loss: number; net: number }> = {};
    const recentRoundings: Array<{ saleId: string; date: string; product: string; amount: number; method: string; source: string }> = [];

    for (const line of filtered) {
      const day = String(line.date || '').slice(0, 10);
      if (!day) continue;
      if (!dailyMap[day]) dailyMap[day] = { gain: 0, loss: 0, net: 0 };

      const itemRounding = line.roundingTotal;
      const qty = line.quantity || 1;

      totalItems += qty;
      if (Math.abs(itemRounding) > 0.001) totalRoundedItems += qty;

      if (itemRounding > 0.001) gainCount++;
      else if (itemRounding < -0.001) lossCount++;
      else zeroCount++;

      totalRounding += itemRounding;
      dailyMap[day].net += itemRounding;
      if (itemRounding > 0) dailyMap[day].gain += itemRounding;
      else if (itemRounding < 0) dailyMap[day].loss += Math.abs(itemRounding);

      // Method tracking — derive from source since individual line doesn't store rounding method
      const method = line.source === 'POS' ? 'POS SmartPricing' :
                     line.source === 'EXAMINATION' ? 'Examination' : 'Invoice';
      if (!methodMap[method]) methodMap[method] = { method, total: 0, count: 0, gain: 0, loss: 0 };
      methodMap[method].total += itemRounding;
      methodMap[method].count += qty;
      if (itemRounding > 0) methodMap[method].gain += itemRounding;
      else methodMap[method].loss += Math.abs(itemRounding);

      // Product tracking
      const pid = line.itemId || line.itemName || 'Unknown';
      const pname = line.itemName || pid;
      if (!productMap[pid]) productMap[pid] = { name: pname, total: 0, count: 0, revenue: 0 };
      productMap[pid].total += itemRounding;
      productMap[pid].count += qty;
      productMap[pid].revenue += line.revenue;

      if (Math.abs(itemRounding) > 0.001) {
        recentRoundings.push({
          saleId: line.transactionNumber,
          date: line.date,
          product: pname,
          amount: itemRounding,
          method,
          source: line.source
        });
      }
    }

    const methods = Object.values(methodMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const topProducts = Object.values(productMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 8);
    const dailyTrend = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([date, v]) => ({ date, ...v }));
    const roundingRate = totalItems > 0 ? (totalRoundedItems / totalItems) * 100 : 0;
    const recent = recentRoundings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);

    return { totalRounding, gainCount, lossCount, zeroCount, roundingRate, methods, topProducts, dailyTrend, recent, totalItems };
  }, [filtered]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-6 h-6 text-cyan-500 animate-spin" />
      <span className="ml-3 text-slate-500 text-sm">Loading rounding data…</span>
    </div>
  );

  const maxDaily = Math.max(...stats.dailyTrend.map(d => Math.max(d.gain, d.loss, 0.01)));

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rounding Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track price rounding gains and losses across all SmartPricing sales</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowPeriodMenu(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Calendar className="w-4 h-4 text-slate-400" />
            {PERIOD_LABELS[period]}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {showPeriodMenu && (
            <div className="absolute right-0 top-11 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden min-w-[140px]">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm ${p === period ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
      No posted revenue records (POS, Invoices, Examination) for {PERIOD_LABELS[period].toLowerCase()}. Rounding data appears once transactions are recorded.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Net Rounding', value: fmt(stats.totalRounding, currency),
            sub: stats.totalRounding >= 0 ? 'Net gain from rounding' : 'Net loss from rounding',
            Icon: stats.totalRounding >= 0 ? ArrowUpRight : ArrowDownRight,
            color: stats.totalRounding >= 0 ? 'text-cyan-600' : 'text-red-500',
            bg: stats.totalRounding >= 0 ? 'bg-cyan-50' : 'bg-red-50',
          },
          {
            label: 'Items Rounded Up', value: stats.gainCount.toLocaleString(),
            sub: 'Price rounded upward', Icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-50',
          },
          {
            label: 'Items Rounded Down', value: stats.lossCount.toLocaleString(),
            sub: 'Price rounded downward', Icon: ArrowDownRight, color: 'text-red-500', bg: 'bg-red-50',
          },
          {
            label: 'Rounding Rate', value: `${stats.roundingRate.toFixed(1)}%`,
            sub: `of ${stats.totalItems.toLocaleString()} items affected`, Icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`p-2 rounded-xl ${card.bg} inline-flex mb-3`}>
              <card.Icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Daily gain/loss chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Rounding: Gain vs Loss</h3>
          {stats.dailyTrend.length > 0 ? (
            <div className="space-y-2">
              {stats.dailyTrend.map(day => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 w-20 shrink-0">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 flex flex-col gap-0.5">
                    {day.gain > 0 && (
                      <div className="bg-cyan-400 rounded h-1.5" style={{ width: `${(day.gain / maxDaily) * 100}%`, minWidth: 4 }} title={`Gain: ${fmt(day.gain, currency)}`} />
                    )}
                    {day.loss > 0 && (
                      <div className="bg-red-300 rounded h-1.5" style={{ width: `${(day.loss / maxDaily) * 100}%`, minWidth: 4 }} title={`Loss: ${fmt(day.loss, currency)}`} />
                    )}
                  </div>
                  <span className={`text-[11px] font-medium w-16 text-right ${day.net >= 0 ? 'text-cyan-600' : 'text-red-500'}`}>
                    {fmt(day.net, currency)}
                  </span>
                </div>
              ))}
              <div className="flex gap-4 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-cyan-400 inline-block" /> Gain</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-red-300 inline-block" /> Loss</span>
              </div>
            </div>
          ) : <p className="text-sm text-slate-400 italic">No trend data yet.</p>}
        </div>

        {/* Rounding methods */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Rounding Method</h3>
          {stats.methods.length > 0 ? (
            <div className="space-y-3">
              {stats.methods.map(m => {
                const maxM = Math.abs(stats.methods[0]?.total || 1);
                const isGain = m.total >= 0;
                return (
                  <div key={m.method}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{m.method}</span>
                      <span className={`font-semibold ${isGain ? 'text-cyan-600' : 'text-red-500'}`}>{fmt(m.total, currency)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${isGain ? 'bg-cyan-400' : 'bg-red-300'}`}
                        style={{ width: `${(Math.abs(m.total) / maxM) * 100}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex gap-2">
                      <span>{m.count} items</span>
                      {m.gain > 0 && <span className="text-cyan-500">+{fmt(m.gain, currency)} gain</span>}
                      {m.loss > 0 && <span className="text-red-400">-{fmt(m.loss, currency)} loss</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-slate-400 italic">No rounding method data captured yet.</p>}
        </div>
      </div>

      {/* Top products by rounding impact */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Top Products by Rounding Impact</h3>
        </div>
        {stats.topProducts.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                {['Product', 'Units', 'Revenue', 'Total Rounding', 'Rounding %', 'Impact'].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.topProducts.map((p, i) => {
                const rpct = p.revenue > 0 ? (p.total / p.revenue) * 100 : 0;
                const isGain = p.total >= 0;
                return (
                  <tr key={p.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                        {p.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.count}</td>
                    <td className="px-5 py-3 text-slate-700">{fmt(p.revenue, currency)}</td>
                    <td className={`px-5 py-3 font-semibold ${isGain ? 'text-cyan-600' : 'text-red-500'}`}>{fmt(p.total, currency)}</td>
                    <td className="px-5 py-3 text-slate-500">{Math.abs(rpct).toFixed(2)}%</td>
                    <td className="px-5 py-3">
                      {isGain
                        ? <span className="inline-flex items-center gap-1 text-xs text-cyan-600 font-medium"><ArrowUpRight className="w-3 h-3" /> Gain</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium"><ArrowDownRight className="w-3 h-3" /> Loss</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="px-5 py-8 text-center text-slate-400 text-sm">No product rounding data for this period.</div>}
      </div>

      {/* Recent rounding events */}
      {stats.recent.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Recent Rounding Events</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {stats.recent.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center ${r.amount >= 0 ? 'bg-cyan-100' : 'bg-red-100'}`}>
                    {r.amount >= 0
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-cyan-600" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{r.product}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(r.date).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {r.method !== 'Unknown' && <span className="ml-2 text-slate-300">· {r.method}</span>}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${r.amount >= 0 ? 'text-cyan-600' : 'text-red-500'}`}>
                  {r.amount >= 0 ? '+' : ''}{fmt(r.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default RoundingAnalytics;
