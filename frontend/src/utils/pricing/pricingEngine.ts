import { getEffectiveMargin, applyMargin } from '../../../utils/getEffectiveMargin';
import { roundToCurrency, safeNumber } from './helpers';
import {
  PricingInput,
  PricingResult,
  SnapshotEntry,
  EffectiveMargin,
  PricingBreakdown
} from './types';

export const PRICING_ENGINE_VERSION = "1.0.0";

const normalizeAdjustment = (adj: any): SnapshotEntry => ({
  name: adj.name || 'Adjustment',
  type: adj.type || (adj.percentage !== undefined ? 'PERCENTAGE' : 'FIXED'),
  value: Number(adj.value) || 0,
  percentage: adj.percentage ?? (adj.type === 'PERCENTAGE' ? adj.value : undefined),
  adjustmentId: adj.adjustmentId,
  adjustmentCategory: adj.adjustmentCategory,
  isActive: adj.isActive !== false
});

const normalizeAdjustments = (input: any[] | undefined): SnapshotEntry[] => {
  if (!input || !Array.isArray(input)) return [];
  return input.map(normalizeAdjustment);
};

const validatePricingInput = (input: any): void => {
  if (input.adjustments !== undefined && !Array.isArray(input.adjustments)) {
    throw new Error("Invalid adjustments format: must be array of snapshots");
  }
  if (!input.context) {
    throw new Error("Pricing context is required");
  }
  if (input.baseCost == null || isNaN(input.baseCost)) {
    throw new Error("Invalid base cost");
  }
  if (input.baseCost < 0) {
    throw new Error("Base cost cannot be negative");
  }
};

const getCompanyConfig = (): any | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem('nexus_company_config');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getRoundingSettings = () => {
  const config = getCompanyConfig();
  return config?.pricingSettings || { enableRounding: true, defaultMethod: 'ALWAYS_UP_50', customStep: 50 };
};

const applyRounding = (price: number): number => {
  const settings = getRoundingSettings();
  if (!settings?.enableRounding) return roundToCurrency(price);

  const method = settings.defaultMethod || 'ALWAYS_UP_50';
  const step = settings.customStep || 50;
  const original = roundToCurrency(price);

  let rounded: number;
  switch (method) {
    case 'NEAREST_10':
    case 'NEAREST_50':
    case 'NEAREST_100':
      const nearestStep = method === 'NEAREST_10' ? 10 : method === 'NEAREST_50' ? 50 : 100;
      rounded = Math.round(original / nearestStep) * nearestStep;
      break;
    case 'ALWAYS_UP_10':
    case 'ALWAYS_UP_50':
    case 'ALWAYS_UP_100':
    case 'ALWAYS_UP_500':
    case 'ALWAYS_UP_CUSTOM':
      const upStep = method === 'ALWAYS_UP_10' ? 10 : method === 'ALWAYS_UP_50' ? 50 : method === 'ALWAYS_UP_100' ? 100 : method === 'ALWAYS_UP_500' ? 500 : (step || 50);
      rounded = Math.ceil(original / upStep) * upStep;
      break;
    case 'PSYCHOLOGICAL':
      const mag = original >= 1000 ? 1000 : original >= 100 ? 100 : 10;
      rounded = Math.floor(original / mag) * mag + (mag - 1);
      if (rounded < original) rounded += mag;
      break;
    default:
      rounded = original;
  }

  if (rounded < original) {
    const minStep = method.includes('10') ? 10 : method.includes('50') ? 50 : method.includes('100') ? 100 : 50;
    rounded = Math.ceil(original / minStep) * minStep;
  }

  return roundToCurrency(rounded);
};

const resolveMargin = async (
  itemId?: string | null,
  categoryId?: string | null
): Promise<{ margin: EffectiveMargin; shouldApply: boolean }> => {
  const margin = await getEffectiveMargin(itemId, categoryId);
  const shouldApply = margin.source !== 'system' || margin.margin_value > 0;
  return { margin, shouldApply };
};

/**
 * Volume-discount tier resolver.
 * Returns the effective margin % for the given page count.
 * Tiers: 0-179→0%, 180-249→10%, 250-499→15%, 500-1000→25%.
 */
const resolveVolumeMarginValue = (pages: number): number => {
  if (pages >= 500) return 25;
  if (pages >= 250) return 15;
  if (pages >= 180) return 10;
  return 0;
};

const calculateMarginAmount = (
  baseCost: number,
  margin: EffectiveMargin
): number => {
  if (margin.margin_type === 'percentage') {
    return roundToCurrency(baseCost * (margin.margin_value / 100));
  }
  return roundToCurrency(margin.margin_value);
};

const normalizeSnapshots = (
  rawSnapshots: SnapshotEntry[] | undefined,
  baseAmount: number
): SnapshotEntry[] => {
  if (!rawSnapshots || rawSnapshots.length === 0) return [];

  return rawSnapshots.map(snap => {
    const value = safeNumber(snap.value, 0);
    const isPct = snap.type === 'PERCENTAGE' || snap.type === 'PERCENT' || snap.type === 'percentage';
    const calculatedAmount = isPct
      ? roundToCurrency(baseAmount * (value / 100))
      : roundToCurrency(value);

    return {
      name: snap.name || 'Adjustment',
      type: isPct ? 'PERCENTAGE' : 'FIXED',
      value,
      percentage: isPct ? value : undefined,
      calculatedAmount,
      adjustmentId: snap.adjustmentId,
      adjustmentCategory: snap.adjustmentCategory,
      isActive: snap.isActive
    };
  });
};

const injectProfitMarginSnapshot = (
  existingSnapshots: SnapshotEntry[],
  margin: EffectiveMargin,
  marginAmount: number
): SnapshotEntry[] => {
  const filtered = existingSnapshots.filter(s => s.name !== 'Profit Margin');

  if (marginAmount <= 0) {
    return filtered;
  }

  const snapshot: SnapshotEntry = {
    name: 'Profit Margin',
    type: margin.margin_type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
    value: margin.margin_value,
    percentage: margin.margin_type === 'percentage' ? margin.margin_value : undefined,
    calculatedAmount: roundToCurrency(marginAmount)
  };

  return [...filtered, snapshot];
};

const calculateAdjustmentTotal = (snapshots: SnapshotEntry[]): number => {
  return roundToCurrency(
    snapshots.reduce((sum, s) => sum + (s.calculatedAmount || 0), 0)
  );
};

export async function calculateSellingPrice(
  input: PricingInput
): Promise<PricingResult> {
  validatePricingInput(input);

  const {
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity = 1,
    adjustments,
    context
  } = input;

  const safeCost = safeNumber(baseCost, 0);
  const safeQty = Math.max(1, Math.floor(safeNumber(quantity, 1)));
  const initialBase = safeNumber(basePrice, safeCost);

  // If basePrice is provided (item has a configured selling price), use it as the base.
  // This ensures inventory items with manually set prices use their own selling price
  // instead of recalculating from cost + margin.
  if (basePrice != null && !isNaN(basePrice) && basePrice > 0) {
    // Use the provided basePrice as unit price directly
    const unitPrice = applyRounding(basePrice);
    const totalPrice = roundToCurrency(unitPrice * safeQty);
    
    // For manual overrides, we still need to report the margin.
    // Margin = Unit Price - Cost - Other Adjustments
    const normalizedAdjustments = normalizeSnapshots(adjustments, safeCost);
    const adjustmentTotal = calculateAdjustmentTotal(normalizedAdjustments);
    const marginAmount = roundToCurrency(unitPrice - safeCost - adjustmentTotal);
    
    return {
      unitPrice,
      totalPrice,
      cost: safeCost,
      marginAmount,
      adjustmentSnapshots: (Object.freeze(normalizedAdjustments) as unknown) as SnapshotEntry[],
      adjustmentTotal,
      roundingDifference: 0,
      breakdown: {
        baseCost: safeCost,
        adjustments: adjustmentTotal,
        margin: marginAmount
      },
      pricingVersion: PRICING_ENGINE_VERSION
    };
  }

  const normalizedAdjustments = normalizeSnapshots(adjustments, initialBase);
  
  let runningCost = safeCost;
  let adjustmentTotal = calculateAdjustmentTotal(normalizedAdjustments);
  let currentBaseAmount = initialBase;
  let currentSnapshots = [...normalizedAdjustments];

  const { margin, shouldApply } = await resolveMargin(itemId, categoryId);
  
  let marginAmount = 0;
  if (shouldApply) {
    const costAfterAdjustments = runningCost + adjustmentTotal;

    // Volume-discount override (Products & Services only — never EXAMINATION)
    if (margin.apply_volume_margins && (context as string) !== 'EXAMINATION') {
      const pageCount = Number(input.pages) || 0;
      margin.margin_value = resolveVolumeMarginValue(pageCount);
      margin.margin_type = 'percentage';
    }

    marginAmount = calculateMarginAmount(costAfterAdjustments, margin);
  }

  currentSnapshots = injectProfitMarginSnapshot(currentSnapshots, margin, marginAmount);
  adjustmentTotal = calculateAdjustmentTotal(currentSnapshots);

  const totalBeforeRounding = currentBaseAmount + adjustmentTotal;
  const unitPrice = applyRounding(totalBeforeRounding);
  const totalPrice = roundToCurrency(unitPrice * safeQty);

  const breakdown: PricingBreakdown = {
    baseCost: runningCost,
    adjustments: adjustmentTotal - marginAmount,
    margin: marginAmount
  };

  return {
    unitPrice,
    totalPrice,
    cost: runningCost,
    marginAmount,
    adjustmentSnapshots: (Object.freeze(currentSnapshots) as unknown) as SnapshotEntry[],
    adjustmentTotal,
    roundingDifference: roundToCurrency(unitPrice - totalBeforeRounding),
    breakdown,
    pricingVersion: PRICING_ENGINE_VERSION
  };
}

export async function calculateServicePrice(
  input: Omit<PricingInput, 'baseCost'> & {
    baseCost: number;
    pages: number;
    copies: number;
    inventory?: any[];
    bomTemplates?: any[];
    marketAdjustments?: any[];
  }
): Promise<PricingResult> {
  const { pages = 1, copies = 1, inventory = [], bomTemplates = [], marketAdjustments = [] } = input;
  const inputWithDefaults: PricingInput = {
    itemId: input.itemId,
    categoryId: input.categoryId,
    baseCost: input.baseCost,
    basePrice: input.basePrice,
    quantity: copies,
    adjustments: input.adjustments,
    context: 'SERVICE'
  };

  const basePricing = await calculateSellingPrice(inputWithDefaults);

  if (marketAdjustments && marketAdjustments.length > 0) {
    const activeAdjustments = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
    const serviceSnapshots = activeAdjustments.map((adj: any) => {
      const isPct = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
      const value = safeNumber(adj.value, 0);
      const calculatedAmount = isPct
        ? roundToCurrency(basePricing.unitPrice * (value / 100))
        : value;

      return {
        name: adj.name || 'Market Adjustment',
        type: isPct ? 'PERCENTAGE' as const : 'FIXED' as const,
        value,
        percentage: isPct ? value : undefined,
        calculatedAmount: roundToCurrency(calculatedAmount * copies)
      };
    });

    const serviceAdjustments = calculateAdjustmentTotal(serviceSnapshots);
    const adjustedUnitPrice = applyRounding(basePricing.unitPrice + serviceAdjustments / copies);
    const adjustedTotalPrice = roundToCurrency(adjustedUnitPrice * copies);

    return {
      ...basePricing,
      unitPrice: roundToCurrency(adjustedUnitPrice),
      totalPrice: adjustedTotalPrice,
      adjustmentTotal: basePricing.adjustmentTotal + serviceAdjustments,
      roundingDifference: roundToCurrency(adjustedUnitPrice - (basePricing.unitPrice + serviceAdjustments / copies)),
      adjustmentSnapshots: [...basePricing.adjustmentSnapshots, ...serviceSnapshots]
    };
  }

  return basePricing;
}

export async function calculatePOSPrice(
  itemId: string,
  categoryId: string,
  baseCost: number,
  basePrice?: number,
  quantity?: number,
  existingAdjustments?: SnapshotEntry[]
): Promise<PricingResult> {
  return calculateSellingPrice({
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity,
    adjustments: existingAdjustments,
    context: 'POS'
  });
}

export async function calculateOrderPrice(
  itemId: string,
  categoryId: string,
  baseCost: number,
  basePrice?: number,
  quantity?: number,
  existingAdjustments?: SnapshotEntry[]
): Promise<PricingResult> {
  return calculateSellingPrice({
    itemId,
    categoryId,
    baseCost,
    basePrice,
    quantity,
    adjustments: existingAdjustments,
    context: 'ORDER'
  });
}