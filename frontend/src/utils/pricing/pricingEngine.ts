import { getEffectiveMargin } from '../../../utils/getEffectiveMargin';
import { roundToCurrency, safeNumber } from './helpers';
import { applyProductPriceRounding } from '../../../services/pricingRoundingService';
import { calculateMargin } from '../../../utils/roundingUtils';
import {
  calculatePricingAdjustmentTotal,
  normalizePricingSnapshots,
  resolveVolumeMarginValue,
} from '../../../utils/pricingEngineShared';
import {
  PricingInput,
  PricingResult,
  SnapshotEntry,
  EffectiveMargin,
  PricingBreakdown
} from './types';

export const PRICING_ENGINE_VERSION = "1.0.0";

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

const applyRounding = (price: number): number => {
  return applyProductPriceRounding({
    calculatedPrice: price,
    companyConfig: getCompanyConfig(),
    trackAnalytics: false,
  }).roundedPrice;
};

const resolveMargin = async (
  itemId?: string | null,
  categoryId?: string | null
): Promise<{ margin: EffectiveMargin; shouldApply: boolean }> => {
  const margin = await getEffectiveMargin(itemId, categoryId);
  const shouldApply = margin.source !== 'system' || margin.margin_value > 0;
  return { margin, shouldApply };
};

const calculateMarginAmount = (baseCost: number, margin: EffectiveMargin): number => {
  return calculateMargin(baseCost, margin);
};

const normalizeSnapshots = (
  rawSnapshots: SnapshotEntry[] | undefined,
  baseAmount: number
): SnapshotEntry[] => {
  return normalizePricingSnapshots(rawSnapshots, baseAmount) as SnapshotEntry[];
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
  return calculatePricingAdjustmentTotal(snapshots);
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
      adjustmentSnapshots: normalizedAdjustments,
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
    adjustmentSnapshots: currentSnapshots,
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
