import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Coins, Layers3, TrendingUp, Wallet } from 'lucide-react';
import { resolveTransactionPricingSummary } from '../../../utils/pricingBreakdown';

interface TransactionPricingInsightsProps {
  transaction: any;
  currencySymbol: string;
  title?: string;
}

const formatMoney = (currencySymbol: string, value: number) =>
  `${currencySymbol}${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const cardBaseClass = 'rounded-2xl border p-4 shadow-sm';

export const TransactionPricingInsights: React.FC<TransactionPricingInsightsProps> = ({
  transaction,
  currencySymbol,
  title = 'Internal Pricing Breakdown',
}) => {
  const summary = useMemo(() => resolveTransactionPricingSummary(transaction), [transaction]);

  const hasData = useMemo(() => {
    return Math.abs(summary.materialTotal) > 0.0001
      || Math.abs(summary.adjustmentTotal) > 0.0001
      || Math.abs(summary.profitMarginTotal) > 0.0001
      || Math.abs(summary.roundingTotal) > 0.0001
      || (summary.adjustmentSnapshots || []).length > 0;
  }, [summary]);

  if (!hasData) return null;

  return (
    <div className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-700 tracking-tight text-[13.5px]">{title}</h3>
          <p className="text-[12px] text-slate-500 mt-1">Visible in the sales workspace only, hidden from customer documents.</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className={`${cardBaseClass} border-slate-200 bg-slate-50/70`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Material Cost</span>
              <Layers3 size={16} className="text-slate-400" />
            </div>
            <div className="mt-3 text-xl font-black text-slate-900 tabular-nums">
              {formatMoney(currencySymbol, summary.materialTotal)}
            </div>
          </div>

          <div className={`${cardBaseClass} border-indigo-100 bg-indigo-50/60`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Adjustments</span>
              <Coins size={16} className="text-indigo-500" />
            </div>
            <div className="mt-3 text-xl font-black text-indigo-700 tabular-nums">
              {formatMoney(currencySymbol, summary.adjustmentTotal)}
            </div>
          </div>

          <div className={`${cardBaseClass} border-emerald-100 bg-emerald-50/60`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">Profit Margin</span>
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <div className={`mt-3 text-xl font-black tabular-nums ${summary.profitMarginTotal >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {formatMoney(currencySymbol, summary.profitMarginTotal)}
            </div>
          </div>

          <div className={`${cardBaseClass} border-blue-100 bg-blue-50/60`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Round Up / Down</span>
              {summary.roundingTotal >= 0 ? (
                <ArrowUpRight size={16} className="text-blue-500" />
              ) : (
                <ArrowDownRight size={16} className="text-rose-500" />
              )}
            </div>
            <div className={`mt-3 text-xl font-black tabular-nums ${summary.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
              {summary.roundingTotal >= 0 ? '+' : ''}
              {formatMoney(currencySymbol, summary.roundingTotal)}
            </div>
          </div>
        </div>

        {(summary.adjustmentSnapshots || []).length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500 uppercase tracking-widest">
              <Wallet size={14} className="text-indigo-500" />
              Adjustment Ledger
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(summary.adjustmentSnapshots || []).map((snapshot: any, index: number) => (
                <div key={`${snapshot?.adjustmentId || snapshot?.name || 'adjustment'}-${index}`} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">{snapshot?.name || 'Adjustment'}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {String(snapshot?.type || '').toUpperCase() === 'PERCENTAGE'
                          ? `${Number(snapshot?.value || 0)}%`
                          : 'Fixed amount'}
                      </p>
                    </div>
                    <div className="text-right text-[13px] font-black text-indigo-700 tabular-nums">
                      {formatMoney(currencySymbol, Number(snapshot?.calculatedAmount || 0))}
                    </div>
                  </div>
                </div>
              ))}
              {Math.abs(summary.roundingTotal) > 0.0001 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">Rounding Adjustment</p>
                      <p className="text-[11px] text-slate-500 font-medium">Automatic precision</p>
                    </div>
                    <div className={`text-right text-[13px] font-black tabular-nums ${summary.roundingTotal >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                      {summary.roundingTotal >= 0 ? '+' : ''}
                      {formatMoney(currencySymbol, summary.roundingTotal)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionPricingInsights;
