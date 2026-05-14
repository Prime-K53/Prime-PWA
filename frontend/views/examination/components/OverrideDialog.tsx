import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Textarea } from '../../../components/Textarea';
import { DollarSign, AlertTriangle } from 'lucide-react';

interface OverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (manualPrice: number, reason: string) => void;
  currentPrice: number;
  expectedPrice?: number;
  currencySymbol?: string;
}

const OverrideDialog: React.FC<OverrideDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentPrice,
  expectedPrice,
  currencySymbol = 'MWK'
}) => {
  const [manualPrice, setManualPrice] = useState(currentPrice);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const safeCurrentPrice = Number(currentPrice || 0);
  const safeExpectedPrice = Number(expectedPrice ?? currentPrice ?? 0);

  useEffect(() => {
    if (!isOpen) return;
    setManualPrice(safeCurrentPrice);
    setReason('');
  }, [isOpen, safeCurrentPrice]);

  const handleSubmit = async () => {
    if (manualPrice <= 0) {
      alert('Manual price must be greater than 0');
      return;
    }

    if (!reason.trim()) {
      alert('Please provide a reason for the manual override');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(manualPrice, reason);
      setManualPrice(safeCurrentPrice);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setManualPrice(safeCurrentPrice);
    setReason('');
    onClose();
  };

  const priceDifference = manualPrice - safeCurrentPrice;
  const percentageChange = safeCurrentPrice > 0 ? (priceDifference / safeCurrentPrice) * 100 : 0;
  const autoVsCurrentDelta = useMemo(() => {
    const delta = safeCurrentPrice - safeExpectedPrice;
    if (Math.abs(delta) < 0.005) return 0;
    return delta;
  }, [safeCurrentPrice, safeExpectedPrice]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span>Manual Price Override</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
              <span>Expected Auto Price:</span>
              <span className="font-medium">{currencySymbol} {safeExpectedPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
              <span>Current Final Price:</span>
              <span className="font-medium">{currencySymbol} {safeCurrentPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
              <span>Manual Price:</span>
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(parseFloat(e.target.value) || 0)}
                  className="w-32 text-right"
                />
              </div>
            </div>
            {autoVsCurrentDelta !== 0 && (
              <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                <span>Current vs Expected:</span>
                <span className={autoVsCurrentDelta > 0 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                  {autoVsCurrentDelta > 0 ? '+' : ''}{currencySymbol} {autoVsCurrentDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm font-medium">
              <span>Change:</span>
              <span className={percentageChange > 0 ? 'text-green-600' : percentageChange < 0 ? 'text-red-600' : 'text-gray-600'}>
                {percentageChange > 0 ? '+' : ''}{percentageChange.toFixed(2)}%
                {priceDifference !== 0 && ` (${currencySymbol} ${priceDifference.toLocaleString()})`}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Override
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you are overriding the auto-calculated price..."
              rows={4}
            />
          </div>

          {percentageChange !== 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="text-sm text-yellow-800">
                <strong>Note:</strong> This override will {percentageChange > 0 ? 'increase' : 'decrease'} the price by {Math.abs(percentageChange).toFixed(2)}%.
                This change will be recorded in the audit trail.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="space-x-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || manualPrice <= 0 || !reason.trim()}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Applying Override...
              </>
            ) : (
              'Apply Override'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OverrideDialog;
