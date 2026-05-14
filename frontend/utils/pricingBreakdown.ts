import { PricingBreakdownSnapshot } from '../types';
import { resolveStoredRoundingDifference } from './pricing';

const roundMoney = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const PROFIT_MARGIN_LABEL = 'profit margin';

const toFiniteAmount = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveQuantity = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

const normalizeSnapshotName = (snapshot: any): string =>
  String(snapshot?.name || snapshot?.adjustmentName || '').trim().toLowerCase();

export const isProfitMarginSnapshot = (snapshot: any): boolean =>
  normalizeSnapshotName(snapshot) === PROFIT_MARGIN_LABEL;

export const getSnapshotCalculatedAmount = (snapshot: any): number => {
  const explicitAmount = [
    snapshot?.calculatedAmount,
    snapshot?.amount,
    snapshot?.appliedAmount,
    snapshot?.totalApplied
  ]
    .map(toFiniteAmount)
    .find((value) => value !== undefined);

  if (explicitAmount !== undefined) {
    return roundMoney(explicitAmount);
  }

  const snapshotType = String(snapshot?.type || '').trim().toUpperCase();
  const snapshotValue = toFiniteAmount(snapshot?.value);
  const rawValue = toFiniteAmount(snapshot?.rawValue);

  if (snapshotValue !== undefined && (rawValue !== undefined || (snapshotType && !snapshotType.startsWith('PERCENT')))) {
    return roundMoney(snapshotValue);
  }

  return 0;
};

export const getMarketAdjustmentSnapshots = <T extends Record<string, any>>(snapshots: T[] = []): T[] => {
  return (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => !isProfitMarginSnapshot(snapshot));
};

export const getProfitMarginAmountFromSnapshots = (snapshots: any[] = []): number | undefined => {
  const profitSnapshots = (Array.isArray(snapshots) ? snapshots : []).filter(isProfitMarginSnapshot);
  if (profitSnapshots.length === 0) return undefined;
  return roundMoney(
    profitSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
};

const normalizeAdjustmentSnapshot = (snapshot: any, index: number) => ({
  ...snapshot,
  adjustmentId: snapshot?.adjustmentId || snapshot?.id || `ADJ-${index}`,
  name: String(snapshot?.name || snapshot?.adjustmentName || 'Adjustment'),
  type: String(snapshot?.type || 'FIXED'),
  calculatedAmount: getSnapshotCalculatedAmount(snapshot)
});

const buildSmartPricingAdjustmentSnapshots = (smartPricingSnapshot: any): any[] => {
  const marketAdjustments = Array.isArray(smartPricingSnapshot?.marketAdjustments)
    ? smartPricingSnapshot.marketAdjustments
    : [];

  return marketAdjustments.map((snapshot: any, index: number) => {
    const snapshotType = String(snapshot?.type || 'FIXED').toUpperCase();
    const rawValue = snapshot?.rawValue ?? snapshot?.value ?? 0;

    return normalizeAdjustmentSnapshot({
      ...snapshot,
      type: snapshotType,
      value: Number(rawValue),
      percentage: snapshotType.startsWith('PERCENT') ? Number(rawValue) : undefined,
      calculatedAmount: snapshot?.value
    }, index);
  });
};

export const resolveItemAdjustmentSnapshots = (item: any): any[] => {
  const directSnapshots = (Array.isArray(item?.adjustmentSnapshots) ? item.adjustmentSnapshots : [])
    .map((snapshot: any, index: number) => normalizeAdjustmentSnapshot(snapshot, index));

  const directTotal = roundMoney(
    getMarketAdjustmentSnapshots(directSnapshots).reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );

  const smartSnapshots = buildSmartPricingAdjustmentSnapshots(item?.smartPricingSnapshot);
  const smartTotal = roundMoney(
    smartSnapshots.reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );

  const explicitSmartTotal = roundMoney(item?.smartPricingSnapshot?.marketAdjustmentTotal ?? 0);

  // SmartPricing variant whose price is fully computed: if it has a smartPricingSnapshot
  // but no marketAdjustments in it, return empty so the caller does NOT fall back to
  // re-applying global market adjustments on an already-final price.
  const isSmartPricingItem = !!(item?.smartPricingSnapshot || item?.pricingSource === "smart");
  if (isSmartPricingItem && directSnapshots.length === 0 && smartSnapshots.length === 0) {
    return [];
  }

  if (
    smartSnapshots.length > 0
    && (directSnapshots.length === 0 || (directTotal === 0 && (smartTotal > 0 || explicitSmartTotal > 0)))
  ) {
    return smartSnapshots;
  }

  return directSnapshots;
};

const toAdjustmentAmount = (snapshots: any[] = []): number => {
  return roundMoney(
    getMarketAdjustmentSnapshots(snapshots).reduce((sum, snapshot) => sum + getSnapshotCalculatedAmount(snapshot), 0)
  );
};

const toAdjustmentLines = (snapshots: any[] = []) => {
  return getMarketAdjustmentSnapshots(snapshots).map((snapshot: any) => ({
    name: String(snapshot?.name || 'Adjustment'),
    type: String(snapshot?.type || 'FIXED'),
    value: getSnapshotCalculatedAmount(snapshot)
  }));
};

export const buildPricingBreakdownSnapshot = (
  item: any
): PricingBreakdownSnapshot | undefined => {
  if (!item) return undefined;

  const existing = item.pricingBreakdown as PricingBreakdownSnapshot | undefined;
  if (existing) {
    return {
      paperCost: roundMoney(existing.paperCost),
      tonerCost: roundMoney(existing.tonerCost),
      finishingCost: roundMoney(existing.finishingCost),
      baseMaterialCost: roundMoney(existing.baseMaterialCost),
      adjustmentTotal: roundMoney(existing.adjustmentTotal),
      adjustmentLines: Array.isArray(existing.adjustmentLines) ? existing.adjustmentLines : [],
      profitMarginAmount: roundMoney(existing.profitMarginAmount),
      marginType: existing.marginType,
      marginValue: existing.marginValue,
      roundingDifference: roundMoney(existing.roundingDifference),
      wasRounded: Boolean(existing.wasRounded),
      roundingMethod: existing.roundingMethod,
      sellingPrice: roundMoney(existing.sellingPrice),
      pages: existing.pages,
      copies: existing.copies
    };
  }

  const smartSnapshot = item.smartPricingSnapshot || item.smartPricing;
  const adjustmentSnapshots = resolveItemAdjustmentSnapshots(item);
  const sellingPrice = roundMoney(
    item.price
    ?? item.unitPrice
    ?? item.selling_price
    ?? smartSnapshot?.roundedPrice
    ?? 0
  );
  const baseMaterialCost = roundMoney(
    smartSnapshot?.baseCost
    ?? item.basePrice
    ?? item.cost_price
    ?? item.cost
    ?? item.productionCostSnapshot?.baseProductionCost
    ?? 0
  );
  const explicitMarketAdjustmentTotal = [
    smartSnapshot?.marketAdjustmentTotal,
    item.marketAdjustmentTotal
  ].find((value) => Number.isFinite(Number(value)));
  const adjustmentTotal = roundMoney(
    explicitMarketAdjustmentTotal
    ?? (adjustmentSnapshots.length > 0 ? toAdjustmentAmount(adjustmentSnapshots) : item.adjustmentTotal)
  );
  const roundingDifference = roundMoney(
    smartSnapshot?.roundingDifference
    ?? item.roundingDifference
    ?? item.rounding_difference
    ?? resolveStoredRoundingDifference(item)
  );

  const explicitMargin = Number(
    smartSnapshot?.profitMarginAmount
    ?? item.profitMarginAmount
    ?? item.marginAmount
    ?? getProfitMarginAmountFromSnapshots(adjustmentSnapshots)
  );
  const profitMarginAmount = Number.isFinite(explicitMargin)
    ? roundMoney(explicitMargin)
    : roundMoney(sellingPrice - baseMaterialCost - adjustmentTotal - roundingDifference);

  const pages = smartSnapshot?.pages ?? item.pagesOverride ?? item.pages;
  const copies = smartSnapshot?.copies ?? item.quantity ?? item.serviceDetails?.copies;

  const paperCost = roundMoney(smartSnapshot?.paperCost ?? 0);
  const tonerCost = roundMoney(smartSnapshot?.tonerCost ?? 0);
  const finishingCost = roundMoney(smartSnapshot?.finishingCost ?? 0);

  if (
    sellingPrice === 0
    && baseMaterialCost === 0
    && adjustmentTotal === 0
    && profitMarginAmount === 0
    && roundingDifference === 0
    && paperCost === 0
    && tonerCost === 0
    && finishingCost === 0
  ) {
    return undefined;
  }

  return {
    paperCost,
    tonerCost,
    finishingCost,
    baseMaterialCost,
    adjustmentTotal,
    adjustmentLines: toAdjustmentLines(adjustmentSnapshots),
    profitMarginAmount,
    marginType: smartSnapshot?.marginType ?? item.marginType,
    marginValue: smartSnapshot?.marginValue ?? item.marginValue,
    roundingDifference,
    wasRounded: Math.abs(roundingDifference) > 0.0001 || Boolean(smartSnapshot?.wasRounded),
    roundingMethod: smartSnapshot?.roundingMethod ?? item.roundingMethod ?? item.rounding_method,
    sellingPrice,
    pages,
    copies
  };
};

export const attachPricingBreakdown = <T extends Record<string, any>>(item: T): T => {
  const pricingBreakdown = buildPricingBreakdownSnapshot(item);
  if (!pricingBreakdown) return item;
  return {
    ...item,
    pricingBreakdown
  };
};

export const summarizePricingBreakdown = (items: any[] = []) => {
  return items.reduce((summary, rawItem) => {
    const item = attachPricingBreakdown(rawItem);
    const breakdown = item.pricingBreakdown as PricingBreakdownSnapshot | undefined;
    const quantity = toPositiveQuantity(item.quantity);

    const materialTotal = roundMoney((breakdown?.baseMaterialCost ?? Number(item.cost || 0)) * quantity);
    const adjustmentTotal = roundMoney((breakdown?.adjustmentTotal ?? Number(item.adjustmentTotal || 0)) * quantity);
    const roundingTotal = roundMoney((breakdown?.roundingDifference ?? item.roundingDifference ?? item.rounding_difference ?? 0) * quantity);

    const marginPerUnit = breakdown
      ? breakdown.profitMarginAmount
      : roundMoney(
          Number(item.price || item.unitPrice || 0)
          - Number(item.cost || 0)
          - Number(item.adjustmentTotal || 0)
          - Number(item.roundingDifference || item.rounding_difference || 0)
        );

    summary.materialTotal = roundMoney(summary.materialTotal + materialTotal);
    summary.adjustmentTotal = roundMoney(summary.adjustmentTotal + adjustmentTotal);
    summary.profitMarginTotal = roundMoney(summary.profitMarginTotal + (marginPerUnit * quantity));
    summary.roundingTotal = roundMoney(summary.roundingTotal + roundingTotal);
    return summary;
  }, {
    materialTotal: 0,
    adjustmentTotal: 0,
    profitMarginTotal: 0,
    roundingTotal: 0
  });
};

export const aggregateMarketAdjustmentSnapshots = (items: any[] = []) => {
  const map = new Map<string, any>();

  items.forEach((rawItem) => {
    const item = attachPricingBreakdown(rawItem);
    const quantity = toPositiveQuantity(item.quantity);
    const snapshots = getMarketAdjustmentSnapshots(resolveItemAdjustmentSnapshots(item));

    snapshots.forEach((snapshot: any, index: number) => {
      const key = String(snapshot?.adjustmentId || snapshot?.name || `ADJ-${index}`);
      const existing = map.get(key);
      const calculatedAmount = roundMoney(getSnapshotCalculatedAmount(snapshot) * quantity);

      if (existing) {
        existing.calculatedAmount = roundMoney(existing.calculatedAmount + calculatedAmount);
        return;
      }

      map.set(key, {
        ...snapshot,
        adjustmentId: snapshot?.adjustmentId || key,
        name: snapshot?.name || 'Adjustment',
        calculatedAmount
      });
    });
  });

  return Array.from(map.values());
};

export const resolveTransactionPricingSummary = (transaction: any) => {
  const normalizedItems = Array.isArray(transaction?.items)
    ? transaction.items.map((item: any) => attachPricingBreakdown(item))
    : [];
  const derivedSummary = summarizePricingBreakdown(normalizedItems);

  const pickMetric = (rootValue: unknown, derivedValue: number) => {
    if (Math.abs(derivedValue) > 0.0001) {
      return roundMoney(derivedValue);
    }

    const parsedRoot = Number(rootValue);
    return Number.isFinite(parsedRoot) ? roundMoney(parsedRoot) : 0;
  };

  const rootSnapshots = Array.isArray(transaction?.adjustmentSnapshots)
    ? getMarketAdjustmentSnapshots(transaction.adjustmentSnapshots).map((snapshot: any) => ({
        ...snapshot,
        calculatedAmount: getSnapshotCalculatedAmount(snapshot)
      }))
    : [];

  return {
    items: normalizedItems,
    materialTotal: pickMetric(transaction?.materialTotal ?? transaction?.material_total, derivedSummary.materialTotal),
    adjustmentTotal: pickMetric(transaction?.adjustmentTotal ?? transaction?.adjustment_total, derivedSummary.adjustmentTotal),
    profitMarginTotal: pickMetric(transaction?.profitMarginTotal ?? transaction?.profit_margin_total ?? transaction?.profitAdjustment, derivedSummary.profitMarginTotal),
    roundingTotal: pickMetric(
      transaction?.roundingTotal ?? transaction?.rounding_total ?? transaction?.roundingDifference ?? transaction?.rounding_difference,
      derivedSummary.roundingTotal
    ),
    adjustmentSnapshots: rootSnapshots.length > 0 ? rootSnapshots : aggregateMarketAdjustmentSnapshots(normalizedItems)
  };
};
