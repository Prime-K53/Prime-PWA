import React, { useState, useMemo } from 'react';
import { X, Copy, Printer } from 'lucide-react';

interface QuickPrintModalProps {
  open: boolean;
  onClose: () => void;
  type: 'photocopy' | 'printing';
  pricePerPage: number;
  currency: string;
  staplePrice?: number;
  onConfirm: (quantity: number, pages: number, total: number, type: 'photocopy' | 'printing', pinningCost?: number, pinningCount?: number) => void;
  pinningItem?: {
    costPerUnit: number;
    conversionRate: number;
    materialId?: string;
  } | null;
}

const QuickPrintModal: React.FC<QuickPrintModalProps> = ({
  open,
  onClose,
  type,
  pricePerPage,
  currency,
  onConfirm,
  pinningItem,
  staplePrice
}) => {
  const [quantity, setQuantity] = useState(1);
  const [pagesPerCopy, setPagesPerCopy] = useState(1);

  const totalPages = quantity * pagesPerCopy;
  const printTotal = totalPages * pricePerPage;

  // Auto-calculate pinning/stapling cost per copy (based on settings) - not visible to customer
  const pinningCost = useMemo(() => {
    // If staple price is defined in settings, charge per copy automatically
    if (typeof staplePrice === 'number' && staplePrice > 0) {
      return Number((quantity * staplePrice).toFixed(2));
    }
    // Fallback to inventory item if no settings price
    if (!pinningItem || pinningItem.conversionRate <= 0) return 0;
    const unitsNeeded = Math.ceil(quantity / pinningItem.conversionRate);
    return Number((unitsNeeded * pinningItem.costPerUnit).toFixed(2));
  }, [quantity, pinningItem, staplePrice]);

  const finalTotal = printTotal + pinningCost;

  const handleConfirm = () => {
    // Always include pinning cost if configured (quantity = number of copies)
    if (pinningCost > 0) {
      onConfirm(quantity, pagesPerCopy, finalTotal, type, pinningCost, quantity);
    } else {
      onConfirm(quantity, pagesPerCopy, finalTotal, type, undefined, undefined);
    }
    setQuantity(1);
    setPagesPerCopy(1);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="app-modal fixed inset-0 z-50 flex items-center justify-center p-4 font-sans" style={{ fontFamily: 'Inter, Roboto, system-ui, sans-serif' }}>
      <div
        className="absolute inset-0 bg-slate-800/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="modal-content relative rounded-[1.25rem] shadow-2xl w-full max-w-md overflow-hidden bg-white">
        <div className="modal-header flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${type === 'photocopy' ? 'bg-slate-100' : 'bg-blue-100'}`}>
              {type === 'photocopy' ? (
                <Copy className="w-5 h-5 text-slate-600" />
              ) : (
                <Printer className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h2 className="modal-title text-[22px] font-bold leading-snug text-slate-800">
                {type === 'photocopy' ? 'Quick Photocopy' : 'Type & Printing'}
              </h2>
              <p className="modal-sub text-[12.5px] font-medium text-slate-500 leading-tight">
                {currency}{pricePerPage} per page
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="modal-label block text-[12.5px] font-semibold text-slate-700 mb-1.5 leading-tight">
              Number of Copies
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-[7px] border border-slate-200 rounded-lg text-slate-800 font-medium text-[13.5px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 tabular-nums"
            />
          </div>

          <div>
            <label className="modal-label block text-[12.5px] font-semibold text-slate-700 mb-1.5 leading-tight">
              Pages per Copy
            </label>
            <input
              type="number"
              min={1}
              value={pagesPerCopy}
              onChange={(e) => setPagesPerCopy(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-[7px] border border-slate-200 rounded-lg text-slate-800 font-medium text-[13.5px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 tabular-nums"
            />
          </div>

{/*
           * Pinning/Stapling is now charged automatically per copy based on settings.
           * Not visible in UI - cost is included in total.
           * 
           * The pinning cost is calculated based on staplePrice in settings:
           * - If staplePrice > 0: charged as staplePrice × quantity (copies)
           * - If no settings price: charged based on inventory item cost
           * 
           * User won't see pinning option in the modal.
           */}

<div className="p-3 bg-slate-50/80 rounded-lg space-y-1.5" style={{ lineHeight: '1.45' }}>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-medium text-slate-600">Total Pages:</span>
              <span className="font-semibold text-slate-800 tabular-nums text-right">{totalPages}</span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
              <span className="font-semibold text-slate-700" style={{ fontSize: '13.5px' }}>Total:</span>
              <span className="font-bold text-emerald-600 tabular-nums text-right" style={{ fontSize: '18px' }}>
                {currency}{finalTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer flex gap-3 p-3 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={onClose}
            className="modal-btn-secondary flex-1 font-semibold text-slate-600 hover:text-slate-800 transition-colors py-[7px] px-3 rounded-lg text-[13px]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="modal-btn-primary flex-1 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors py-[7px] px-3 text-[13px]"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickPrintModal;