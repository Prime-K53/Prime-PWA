import React from 'react';

interface AgingSummaryProps {
  current: number;
  thirty: number;
  sixty: number;
  ninetyPlus: number;
  currencySymbol?: string;
}

/**
 * AgingSummary Component
 * Displays a professional debt aging footer for statements.
 * Helps customers see overdue amounts at a glance.
 */
const AgingSummary: React.FC<AgingSummaryProps> = ({
  current,
  thirty,
  sixty,
  ninetyPlus,
  currencySymbol = '$'
}) => {
  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const buckets = [
    { label: 'Current', value: current, color: 'text-slate-600', bgColor: 'bg-slate-50' },
    { label: '30 Days', value: thirty, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    { label: '60 Days', value: sixty, color: 'text-orange-600', bgColor: 'bg-orange-50' },
    { label: '90+ Days', value: ninetyPlus, color: 'text-rose-600', bgColor: 'bg-rose-50' }
  ];

  return (
    <div className="aging-summary mt-8 pt-4 border-t border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Aging Analysis Summary</p>
      <div className="grid grid-cols-4 gap-2">
        {buckets.map((bucket, index) => (
          <div 
            key={index} 
            className={`p-3 rounded-xl border border-slate-100 ${bucket.bgColor} flex flex-col items-center justify-center text-center`}
          >
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">
              {bucket.label}
            </span>
            <span className={`text-[13px] font-black ${bucket.color} font-mono`}>
              {formatCurrency(bucket.value)}
            </span>
          </div>
        ))}
      </div>
      
      <style>{`
        @media print {
          .aging-summary {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default AgingSummary;
