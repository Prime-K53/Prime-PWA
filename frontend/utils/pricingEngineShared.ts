import { roundToCurrency } from './helpers';

type PricingAdjustmentLike = {
  name?: string;
  type?: string;
  value?: unknown;
  percentage?: unknown;
  calculatedAmount?: unknown;
  adjustmentId?: string;
  adjustmentCategory?: string;
  isActive?: boolean;
};

const isPercentageAdjustment = (type?: string, percentage?: unknown) => {
  return percentage !== undefined
    || type === 'PERCENTAGE'
    || type === 'PERCENT'
    || type === 'percentage';
};

export const normalizePricingSnapshot = (adjustment: PricingAdjustmentLike) => {
  const isPercent = isPercentageAdjustment(adjustment?.type, adjustment?.percentage);
  const value = Number(adjustment?.value);

  return {
    name: adjustment?.name || 'Adjustment',
    type: isPercent ? 'PERCENTAGE' : 'FIXED',
    value: Number.isFinite(value) ? value : 0,
    percentage: isPercent ? Number(adjustment?.percentage ?? adjustment?.value ?? 0) : undefined,
    calculatedAmount: roundToCurrency(Number(adjustment?.calculatedAmount) || 0),
    adjustmentId: adjustment?.adjustmentId,
    adjustmentCategory: adjustment?.adjustmentCategory,
    isActive: adjustment?.isActive !== false,
  };
};

export const normalizePricingSnapshots = (
  rawSnapshots: PricingAdjustmentLike[] | undefined,
  baseAmount?: number
) => {
  if (!rawSnapshots || rawSnapshots.length === 0) return [];

  return rawSnapshots.map((snapshot) => {
    const normalized = normalizePricingSnapshot(snapshot);
    if (baseAmount === undefined) {
      return normalized;
    }

    const calculatedAmount = normalized.type === 'PERCENTAGE'
      ? roundToCurrency((Number(baseAmount) || 0) * ((normalized.value || 0) / 100))
      : roundToCurrency(normalized.value || 0);

    return {
      ...normalized,
      calculatedAmount,
    };
  });
};

export const calculatePricingAdjustmentTotal = (
  snapshots: Array<{ calculatedAmount?: number }> | undefined
) => {
  return roundToCurrency(
    (snapshots || []).reduce((sum, snapshot) => sum + (snapshot.calculatedAmount || 0), 0)
  );
};

export const resolveVolumeMarginValue = (pages: number) => {
  if (pages >= 500) return 25;
  if (pages >= 250) return 15;
  if (pages >= 180) return 10;
  return 0;
};
