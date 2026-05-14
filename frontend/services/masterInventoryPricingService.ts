import { AdjustmentSnapshot, BOMTemplate, CompanyConfig, Item, MarketAdjustment, PricingRoundingMethod, ProductVariant } from '../types';
import { dbService } from './db';
import { pricingService } from './pricingService';
import { calculateItemFinancials, resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredSellingPrice } from '../utils/pricing';
import { roundToCurrency } from '../utils/helpers';
import { applyProductPriceRounding } from './pricingRoundingService';
import { logRoundingEvents, LogRoundingEventInput } from './roundingAnalyticsService';

interface RepricedVariantResult {
    variant: ProductVariant;
    changed: boolean;
    roundingLog?: LogRoundingEventInput;
}

export interface MasterInventoryRepriceResult {
    totalCandidates: number;
    activeAdjustments: number;
    updatedItems: number;
    updatedVariants: number;
}

export interface ProductRecalculateResult {
    found: boolean;
    changed: boolean;
    item?: Item;
}

const DEFAULT_ROUNDING_METHOD: PricingRoundingMethod = 'ALWAYS_UP_50';

const isAdjustmentActive = (adjustment: MarketAdjustment): boolean => {
    return adjustment.active ?? adjustment.isActive ?? false;
};

const isPercentageType = (type?: string): boolean => {
    const normalized = String(type || '').toUpperCase();
    return normalized === 'PERCENTAGE' || normalized === 'PERCENT';
};

const toSnapshotType = (type?: string): AdjustmentSnapshot['type'] => {
    const normalized = String(type || '').toUpperCase();
    if (normalized === 'FIXED') return 'FIXED';
    if (normalized === 'PERCENT') return 'PERCENT';
    return 'PERCENTAGE';
};

const getApplicableAdjustments = (
    itemCategory: string | undefined,
    allAdjustments: MarketAdjustment[]
): MarketAdjustment[] => {
    return allAdjustments.filter((adj) => {
        if (!isAdjustmentActive(adj)) return false;
        const categories = adj.applyToCategories || [];
        if (categories.length === 0) return true;
        if (!itemCategory) return false;
        return categories.includes(itemCategory);
    });
};

const buildSnapshotsFromBaseCost = (
    baseCost: number,
    adjustments: MarketAdjustment[]
): AdjustmentSnapshot[] => {
    return adjustments.map((adj) => {
        const amount = isPercentageType(adj.type)
            ? baseCost * ((adj.percentage ?? adj.value ?? 0) / 100)
            : (adj.value || 0);

        return {
            name: adj.name,
            type: toSnapshotType(adj.type),
            value: Number(adj.value || 0),
            percentage: isPercentageType(adj.type) ? Number(adj.percentage ?? adj.value ?? 0) : undefined,
            calculatedAmount: roundToCurrency(amount)
        };
    });
};

const sumSnapshotAmounts = (snapshots: AdjustmentSnapshot[]): number => {
    return roundToCurrency(snapshots.reduce((sum, snapshot) => sum + (snapshot.calculatedAmount || 0), 0));
};

const resolveGlobalMargin = (
    companyConfig: CompanyConfig | undefined,
    fallbackMarginPercent?: number
): { marginAmount: (baseAmount: number) => number; marginPercent: (baseAmount: number) => number } => {
    const configuredMargin = companyConfig?.pricingSettings?.globalDefaultMargin;
    const marginType = configuredMargin?.margin_type;
    const marginValue = Number(configuredMargin?.margin_value ?? fallbackMarginPercent ?? 0) || 0;

    if (marginType === 'fixed_amount') {
        return {
            marginAmount: () => roundToCurrency(marginValue),
            marginPercent: (baseAmount: number) => (
                baseAmount > 0
                    ? roundToCurrency((marginValue / baseAmount) * 100)
                    : 0
            )
        };
    }

    return {
        marginAmount: (baseAmount: number) => roundToCurrency(baseAmount * (marginValue / 100)),
        marginPercent: () => roundToCurrency(marginValue)
    };
};

const calculateStationeryLinePricing = ({
    baseCost,
    selectedAdjustmentIds,
    applicableAdjustments,
    companyConfig,
    fallbackMarginPercent
}: {
    baseCost: number;
    selectedAdjustmentIds?: string[];
    applicableAdjustments: MarketAdjustment[];
    companyConfig?: CompanyConfig;
    fallbackMarginPercent?: number;
}) => {
    const safeBaseCost = roundToCurrency(Math.max(0, Number(baseCost) || 0));
    const selectedIds = Array.from(new Set((selectedAdjustmentIds || []).filter(Boolean)));
    const selectedAdjustments = applicableAdjustments.filter(adj => selectedIds.includes(adj.id));
    const adjustmentSnapshots = buildSnapshotsFromBaseCost(safeBaseCost, selectedAdjustments);
    const adjustmentTotal = sumSnapshotAmounts(adjustmentSnapshots);
    const subtotalBeforeMargin = roundToCurrency(safeBaseCost + adjustmentTotal);
    const marginResolver = resolveGlobalMargin(companyConfig, fallbackMarginPercent);
    const marginAmount = marginResolver.marginAmount(subtotalBeforeMargin);
    const marginPercent = marginResolver.marginPercent(subtotalBeforeMargin);

    return {
        cost: safeBaseCost,
        selectedAdjustmentIds: selectedIds,
        adjustmentSnapshots,
        adjustmentTotal,
        marginAmount,
        marginPercent,
        calculatedPrice: roundToCurrency(subtotalBeforeMargin + marginAmount)
    };
};

const snapshotsChanged = (oldSnapshots: AdjustmentSnapshot[] | undefined, newSnapshots: AdjustmentSnapshot[]): boolean => {
    return JSON.stringify(oldSnapshots || []) !== JSON.stringify(newSnapshots || []);
};

const pricingConfigChanged = (oldConfig: Item['pricingConfig'], newConfig: Item['pricingConfig']): boolean => {
    return JSON.stringify(oldConfig || null) !== JSON.stringify(newConfig || null);
};

const numbersDiffer = (a: number | undefined, b: number | undefined): boolean => {
    return Math.abs((a || 0) - (b || 0)) > 0.00001;
};

const getStoredConfig = (): CompanyConfig | undefined => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    try {
        const raw = localStorage.getItem('nexus_company_config');
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
};

const resolveRoundingDifference = (
    calculatedPrice: number | undefined,
    roundedPrice: number | undefined,
    persistedDifference: number | undefined
): number => {
    if (Number.isFinite(Number(persistedDifference))) {
        return roundToCurrency(Number(persistedDifference));
    }
    return roundToCurrency((Number(roundedPrice || 0)) - (Number(calculatedPrice || 0)));
};

const applyRoundedFieldsToVariant = (
    sourceVariant: ProductVariant,
    targetVariant: ProductVariant,
    calculatedPrice: number,
    companyConfig?: CompanyConfig,
    options?: {
        methodOverride?: PricingRoundingMethod;
        customStepOverride?: number;
    }
): void => {
    const normalizedCalculatedPrice = roundToCurrency(Number(calculatedPrice || 0));
    const existingRoundedPrice = resolveStoredSellingPrice(sourceVariant);
    const existingCalculatedPrice = resolveStoredCalculatedPrice(sourceVariant);
    const existingDifference = resolveRoundingDifference(
        existingCalculatedPrice,
        existingRoundedPrice,
        sourceVariant.rounding_difference
    );

    const rounded = applyProductPriceRounding({
        calculatedPrice: normalizedCalculatedPrice,
        companyConfig,
        methodOverride: options?.methodOverride,
        customStepOverride: options?.customStepOverride,
        existingCalculatedPrice: Number.isFinite(existingCalculatedPrice) ? existingCalculatedPrice : undefined,
        existingRoundedPrice: Number.isFinite(existingRoundedPrice) ? existingRoundedPrice : undefined,
        existingRoundingDifference: Number.isFinite(existingDifference) ? existingDifference : undefined,
        existingRoundingMethod: sourceVariant.rounding_method,
        skipIfAlreadyRounded: true
    });

    targetVariant.calculated_price = rounded.originalPrice;
    targetVariant.selling_price = rounded.roundedPrice;
    targetVariant.rounding_difference = rounded.roundingDifference;
    targetVariant.rounding_method = rounded.methodUsed;
    targetVariant.price = rounded.roundedPrice;
};

const applyRoundedFieldsToItem = (
    sourceItem: Item,
    targetItem: Item,
    calculatedPrice: number,
    companyConfig?: CompanyConfig,
    options?: {
        methodOverride?: PricingRoundingMethod;
        customStepOverride?: number;
    }
): void => {
    const normalizedCalculatedPrice = roundToCurrency(Number(calculatedPrice || 0));
    const existingRoundedPrice = resolveStoredSellingPrice(sourceItem);
    const existingCalculatedPrice = resolveStoredCalculatedPrice(sourceItem);
    const existingDifference = resolveRoundingDifference(
        existingCalculatedPrice,
        existingRoundedPrice,
        sourceItem.rounding_difference
    );

    const rounded = applyProductPriceRounding({
        calculatedPrice: normalizedCalculatedPrice,
        companyConfig,
        methodOverride: options?.methodOverride,
        customStepOverride: options?.customStepOverride,
        existingCalculatedPrice: Number.isFinite(existingCalculatedPrice) ? existingCalculatedPrice : undefined,
        existingRoundedPrice: Number.isFinite(existingRoundedPrice) ? existingRoundedPrice : undefined,
        existingRoundingDifference: Number.isFinite(existingDifference) ? existingDifference : undefined,
        existingRoundingMethod: sourceItem.rounding_method,
        skipIfAlreadyRounded: true
    });

    targetItem.calculated_price = rounded.originalPrice;
    targetItem.selling_price = rounded.roundedPrice;
    targetItem.rounding_difference = rounded.roundingDifference;
    targetItem.rounding_method = rounded.methodUsed;
    targetItem.price = rounded.roundedPrice;
};

const repriceVariant = (
    parentItem: Item,
    variant: ProductVariant,
    inventory: Item[],
    bomTemplates: BOMTemplate[],
    applicableAdjustments: MarketAdjustment[],
    companyConfig?: CompanyConfig
): RepricedVariantResult => {
    const nextVariant: ProductVariant = { ...variant };
    const hasDynamicSource = pricingService.shouldUseDynamicPricing(variant, parentItem);
    const hasBomSource = Boolean(
        variant.bomOverrideId ||
        parentItem.smartPricing?.hiddenBOMId ||
        parentItem.smartPricing?.bomTemplateId
    );

    let nextCost = roundToCurrency(resolveStoredCost(variant));
    let nextCalculatedPrice = roundToCurrency(resolveStoredCalculatedPrice(variant));
    let nextSnapshots: AdjustmentSnapshot[] = [...(variant.adjustmentSnapshots || [])];
    const variantRoundingMethod = ((variant as any).selectedRoundingMethod || parentItem.pricingConfig?.selectedRoundingMethod) as PricingRoundingMethod | undefined;
    const variantCustomRoundingStep = Number((variant as any).customRoundingStep ?? parentItem.pricingConfig?.customRoundingStep) || undefined;

    if (parentItem.type === 'Stationery' && !(variant as any).manualOverride) {
        const stationeryPricing = calculateStationeryLinePricing({
            baseCost: resolveStoredCost(variant),
            selectedAdjustmentIds: (variant as any).selectedAdjustmentIds || parentItem.pricingConfig?.selectedAdjustmentIds,
            applicableAdjustments,
            companyConfig,
            fallbackMarginPercent: Number(variant.marginPercent ?? parentItem.marginPercent ?? 0)
        });

        nextCost = stationeryPricing.cost;
        nextCalculatedPrice = stationeryPricing.calculatedPrice;
        nextSnapshots = stationeryPricing.adjustmentSnapshots || [];
        nextVariant.marginAmount = stationeryPricing.marginAmount;
        nextVariant.marginPercent = stationeryPricing.marginPercent;
        (nextVariant as any).selectedAdjustmentIds = stationeryPricing.selectedAdjustmentIds;
        (nextVariant as any).selectedRoundingMethod = variantRoundingMethod;
        (nextVariant as any).customRoundingStep = variantCustomRoundingStep;
    } else if (variant.pricingSource === 'static' || parentItem.pricingConfig?.manualOverride) {
        nextCost = roundToCurrency(resolveStoredCost(variant));
        nextCalculatedPrice = roundToCurrency(resolveStoredCalculatedPrice(variant));
        nextSnapshots = variant.adjustmentSnapshots || [];
    } else if (
        (variant as any).smartPricingSnapshot?.roundedPrice ||
        // Also protect variants whose parent is a SmartPricing product and already have a stored price.
        // These variants were priced by the engine (via handleAddVariant in ItemModal) and stored
        // with price/selling_price/calculated_price set. Re-running the BOM pipeline would corrupt them.
        (parentItem.smartPricing?.roundedPrice && resolveStoredSellingPrice(variant) > 0)
    ) {
        // SmartPricing variant: price is fully computed by the engine and stored.
        // This guard MUST come before hasDynamicSource && hasBomSource — every SmartPricing variant
        // has a BOM source, but re-running calculateVariantPrice re-applies all market adjustments
        // and produces prices in the millions. Preserve the stored values exactly.
        nextCost = roundToCurrency(resolveStoredCost(variant));
        nextCalculatedPrice = roundToCurrency(
            Number((variant as any).smartPricingSnapshot?.originalPrice ?? (variant as any).smartPricingSnapshot?.roundedPrice)
            || resolveStoredCalculatedPrice(variant)
        );
        nextSnapshots = variant.adjustmentSnapshots || [];
    } else if (hasDynamicSource && hasBomSource) {
        const dynamicResult = pricingService.calculateVariantPrice(
            parentItem,
            variant,
            1,
            inventory,
            bomTemplates,
            applicableAdjustments
        );

        nextCost = roundToCurrency(dynamicResult.cost || 0);
        nextCalculatedPrice = roundToCurrency(dynamicResult.price || 0);
        nextSnapshots = dynamicResult.adjustmentSnapshots || [];
    } else if (parentItem.pricingConfig && !parentItem.pricingConfig.manualOverride) {
        const staticSpec = calculateItemFinancials(
            Number(variant.pages || parentItem.pages || 1),
            parentItem.pricingConfig,
            inventory,
            applicableAdjustments
        );

        if (staticSpec) {
            nextCost = roundToCurrency(staticSpec.cost || 0);
            nextCalculatedPrice = roundToCurrency(staticSpec.price || 0);
            nextSnapshots = staticSpec.adjustmentSnapshots || [];
        }
    } else {
        const baseCost = roundToCurrency(resolveStoredCost(variant));
        const snapshots = buildSnapshotsFromBaseCost(baseCost, applicableAdjustments);
        nextCost = baseCost;
        nextCalculatedPrice = roundToCurrency(baseCost + sumSnapshotAmounts(snapshots));
        nextSnapshots = snapshots;
    }

    nextVariant.cost = nextCost;
    nextVariant.cost_price = nextCost;
    nextVariant.adjustmentSnapshots = nextSnapshots;
    nextVariant.adjustmentTotal = sumSnapshotAmounts(nextSnapshots);
    applyRoundedFieldsToVariant(variant, nextVariant, nextCalculatedPrice, companyConfig, {
        methodOverride: variantRoundingMethod,
        customStepOverride: variantCustomRoundingStep
    });

    const pricingChanged =
        numbersDiffer(variant.calculated_price, nextVariant.calculated_price) ||
        numbersDiffer(variant.selling_price, nextVariant.selling_price) ||
        numbersDiffer(variant.rounding_difference, nextVariant.rounding_difference) ||
        variant.rounding_method !== nextVariant.rounding_method;

    const changed =
        numbersDiffer(variant.cost, nextVariant.cost) ||
        numbersDiffer(variant.cost_price, nextVariant.cost_price) ||
        numbersDiffer(variant.price, nextVariant.price) ||
        pricingChanged ||
        numbersDiffer(variant.adjustmentTotal, nextVariant.adjustmentTotal) ||
        snapshotsChanged(variant.adjustmentSnapshots, nextVariant.adjustmentSnapshots || []);

    if (changed) {
        nextVariant.calculatedAt = new Date().toISOString();
    }

    const roundingLog = pricingChanged ? {
        productId: parentItem.id,
        productName: parentItem.name,
        variantId: nextVariant.id,
        variantName: nextVariant.name,
        calculatedPrice: roundToCurrency(resolveStoredCalculatedPrice(nextVariant)),
        roundedPrice: roundToCurrency(resolveStoredSellingPrice(nextVariant)),
        roundingDifference: roundToCurrency(nextVariant.rounding_difference ?? 0),
        roundingMethod: nextVariant.rounding_method || DEFAULT_ROUNDING_METHOD,
        date: new Date().toISOString()
    } : undefined;

    return { variant: nextVariant, changed, roundingLog };
};

const repriceItem = (
    item: Item,
    inventory: Item[],
    bomTemplates: BOMTemplate[],
    allAdjustments: MarketAdjustment[],
    companyConfig?: CompanyConfig
): { item: Item; changed: boolean; variantChanges: number; roundingLogs: LogRoundingEventInput[] } => {
    const applicableAdjustments = getApplicableAdjustments(item.category, allAdjustments);
    const nextItem: Item = { ...item };
    let nextCost = roundToCurrency(resolveStoredCost(item));
    let nextCalculatedPrice = roundToCurrency(resolveStoredCalculatedPrice(item));
    let nextSnapshots: AdjustmentSnapshot[] = [...(item.adjustmentSnapshots || [])];
    const nextPricingConfig = item.pricingConfig ? { ...item.pricingConfig } : item.pricingConfig;
    let variantChanges = 0;
    const roundingLogs: LogRoundingEventInput[] = [];
    const itemRoundingMethod = item.pricingConfig?.selectedRoundingMethod as PricingRoundingMethod | undefined;
    const itemCustomRoundingStep = Number(item.pricingConfig?.customRoundingStep) || undefined;

    if (item.pricingConfig?.manualOverride) {
        nextCost = roundToCurrency(resolveStoredCost(item));
        nextCalculatedPrice = roundToCurrency(resolveStoredCalculatedPrice(item));
        nextSnapshots = item.adjustmentSnapshots || [];
    } else if (item.type === 'Stationery') {
        const stationeryPricing = calculateStationeryLinePricing({
            baseCost: resolveStoredCost(item),
            selectedAdjustmentIds: item.pricingConfig?.selectedAdjustmentIds,
            applicableAdjustments,
            companyConfig,
            fallbackMarginPercent: Number(item.marginPercent || 0)
        });

        nextCost = stationeryPricing.cost;
        nextCalculatedPrice = stationeryPricing.calculatedPrice;
        nextSnapshots = stationeryPricing.adjustmentSnapshots || [];
        nextItem.marginPercent = stationeryPricing.marginPercent;
        nextItem.costPerPiece = stationeryPricing.cost;
        nextItem.profitPerPiece = roundToCurrency(nextCalculatedPrice - stationeryPricing.cost);

        if (nextPricingConfig) {
            nextPricingConfig.totalCost = stationeryPricing.cost;
            nextPricingConfig.marketAdjustment = stationeryPricing.adjustmentTotal;
            nextPricingConfig.selectedAdjustmentIds = stationeryPricing.selectedAdjustmentIds;
        }
    } else if (item.pricingConfig && !item.pricingConfig.manualOverride) {
        const spec = calculateItemFinancials(
            Number(item.pages || 1),
            item.pricingConfig,
            inventory,
            applicableAdjustments
        );
        if (spec) {
            nextCost = roundToCurrency(spec.cost || 0);
            nextCalculatedPrice = roundToCurrency(spec.price || 0);
            nextSnapshots = spec.adjustmentSnapshots || [];

            if (nextPricingConfig) {
                nextPricingConfig.totalCost = nextCost;
                nextPricingConfig.marketAdjustment = sumSnapshotAmounts(nextSnapshots);
                nextPricingConfig.marketAdjustmentId = applicableAdjustments[0]?.id;
            }
        }
    } else if (item.type === 'Service') {
        const serviceResult = pricingService.calculateDynamicServicePrice(
            item,
            Number(item.pages || 1),
            1,
            inventory,
            bomTemplates,
            applicableAdjustments
        );
        nextCost = roundToCurrency(serviceResult.unitCostPerCopy || resolveStoredCost(item));
        nextCalculatedPrice = roundToCurrency(serviceResult.calculatedTotalPrice ?? serviceResult.totalPrice ?? resolveStoredSellingPrice(item));
        nextSnapshots = serviceResult.adjustmentSnapshots || [];

        if (nextPricingConfig) {
            nextPricingConfig.totalCost = nextCost;
            nextPricingConfig.marketAdjustment = sumSnapshotAmounts(nextSnapshots);
            nextPricingConfig.marketAdjustmentId = applicableAdjustments[0]?.id;
        }
    } else if (item.smartPricing?.roundedPrice) {
        // SmartPricing product: price was fully computed and stored by the engine (snapshot is authoritative).
        // This guard MUST come before the BOM branch — every SmartPricing product has a BOM attached,
        // but re-running calculateItemPrice re-applies all market adjustments and produces prices in the millions.
        // Any edit (name, SKU, category, description, etc.) must preserve the snapshot price exactly.
        nextCost = roundToCurrency(resolveStoredCost(item));
        nextCalculatedPrice = roundToCurrency(Number(item.smartPricing.originalPrice ?? item.smartPricing.roundedPrice) || resolveStoredCalculatedPrice(item));
        nextSnapshots = item.adjustmentSnapshots || [];
    } else if (item.smartPricing?.bomTemplateId || item.smartPricing?.hiddenBOMId) {
        const bomTemplateId = item.smartPricing?.bomTemplateId || item.smartPricing?.hiddenBOMId;
        const virtualItem: Item = {
            ...item,
            smartPricing: {
                ...item.smartPricing,
                bomTemplateId
            }
        };
        (virtualItem as any).printConsumptionEnabled = true;

        const bomResult = pricingService.calculateItemPrice(
            virtualItem,
            1,
            undefined,
            Number(item.pages || 1),
            inventory,
            bomTemplates,
            applicableAdjustments
        );

        nextCost = roundToCurrency(bomResult.cost || resolveStoredCost(item));
        nextCalculatedPrice = roundToCurrency(bomResult.price || resolveStoredSellingPrice(item));
        nextSnapshots = bomResult.adjustmentSnapshots || [];
    } else {
        const baseCost = roundToCurrency(resolveStoredCost(item));
        const snapshots = buildSnapshotsFromBaseCost(baseCost, applicableAdjustments);
        nextCost = baseCost;
        nextCalculatedPrice = roundToCurrency(baseCost + sumSnapshotAmounts(snapshots));
        nextSnapshots = snapshots;
    }

    nextItem.cost = nextCost;
    nextItem.cost_price = nextCost;
    nextItem.adjustmentSnapshots = nextSnapshots;

    if (item.type === 'Raw Material') {
        // Materials are cost-only entities in this workflow.
        const storedCalculatedPrice = resolveStoredCalculatedPrice(item);
        const storedRoundedPrice = resolveStoredSellingPrice(item);
        nextItem.calculated_price = roundToCurrency(storedCalculatedPrice > 0 ? storedCalculatedPrice : nextCost);
        nextItem.selling_price = roundToCurrency(storedRoundedPrice > 0 ? storedRoundedPrice : nextItem.calculated_price);
        nextItem.rounding_difference = resolveRoundingDifference(
            nextItem.calculated_price,
            nextItem.selling_price,
            item.rounding_difference
        );
        nextItem.rounding_method = item.rounding_method;
        nextItem.price = nextItem.selling_price;
    } else {
        applyRoundedFieldsToItem(item, nextItem, nextCalculatedPrice, companyConfig, {
            methodOverride: itemRoundingMethod,
            customStepOverride: itemCustomRoundingStep
        });
    }

    if (nextPricingConfig) {
        nextItem.pricingConfig = nextPricingConfig;
    }

    if (item.type === 'Stationery') {
        nextItem.sellingPricePerPiece = nextItem.selling_price ?? nextItem.price;
        nextItem.costPerPiece = nextCost;
        nextItem.profitPerPiece = roundToCurrency((nextItem.selling_price ?? nextItem.price ?? 0) - nextCost);
        nextItem.markup_percent = roundToCurrency(nextItem.marginPercent ?? item.marginPercent ?? 0);
    }

    if (item.variants && item.variants.length > 0) {
        const repricedVariants = item.variants.map((variant) => {
            const result = repriceVariant(item, variant, inventory, bomTemplates, applicableAdjustments, companyConfig);
            if (result.changed) variantChanges += 1;
            if (result.roundingLog) {
                roundingLogs.push(result.roundingLog);
            }
            return result.variant;
        });
        nextItem.variants = repricedVariants;
    }

    const itemPricingChanged =
        numbersDiffer(item.calculated_price, nextItem.calculated_price) ||
        numbersDiffer(item.selling_price, nextItem.selling_price) ||
        numbersDiffer(item.rounding_difference, nextItem.rounding_difference) ||
        item.rounding_method !== nextItem.rounding_method;

    const changed =
        numbersDiffer(item.cost, nextItem.cost) ||
        numbersDiffer(item.cost_price, nextItem.cost_price) ||
        numbersDiffer(item.price, nextItem.price) ||
        itemPricingChanged ||
        snapshotsChanged(item.adjustmentSnapshots, nextItem.adjustmentSnapshots || []) ||
        pricingConfigChanged(item.pricingConfig, nextItem.pricingConfig) ||
        JSON.stringify(item.variants || []) !== JSON.stringify(nextItem.variants || []);

    if (item.type !== 'Raw Material' && itemPricingChanged) {
        roundingLogs.push({
            productId: nextItem.id,
            productName: nextItem.name,
            calculatedPrice: roundToCurrency(resolveStoredCalculatedPrice(nextItem)),
            roundedPrice: roundToCurrency(resolveStoredSellingPrice(nextItem)),
            roundingDifference: roundToCurrency(nextItem.rounding_difference ?? 0),
            roundingMethod: nextItem.rounding_method || DEFAULT_ROUNDING_METHOD,
            date: new Date().toISOString()
        });
    }

    return { item: nextItem, changed, variantChanges, roundingLogs };
};

export const recalculatePrice = async (
    productId: string,
    companyConfig?: CompanyConfig
): Promise<ProductRecalculateResult> => {
    const [inventory, bomTemplates, adjustments] = await Promise.all([
        dbService.getAll<Item>('inventory'),
        dbService.getAll<BOMTemplate>('bomTemplates'),
        dbService.getAll<MarketAdjustment>('marketAdjustments')
    ]);

    const item = inventory.find((entry) => entry.id === productId);
    if (!item) {
        return { found: false, changed: false };
    }

    const activeAdjustments = adjustments.filter(isAdjustmentActive);
    const configToUse = companyConfig || getStoredConfig();
    const result = repriceItem(item, inventory, bomTemplates, activeAdjustments, configToUse);

    if (result.changed) {
        await dbService.put('inventory', result.item);
        if (result.roundingLogs.length > 0) {
            await logRoundingEvents(result.roundingLogs);
        }
    }

    return {
        found: true,
        changed: result.changed,
        item: result.item
    };
};

export const repriceMasterInventoryFromAdjustments = async (
    companyConfig?: CompanyConfig
): Promise<MasterInventoryRepriceResult> => {
    const [inventory, bomTemplates, adjustments] = await Promise.all([
        dbService.getAll<Item>('inventory'),
        dbService.getAll<BOMTemplate>('bomTemplates'),
        dbService.getAll<MarketAdjustment>('marketAdjustments')
    ]);

    const activeAdjustments = adjustments.filter(isAdjustmentActive);
    const candidates = inventory.filter((item) => item.type !== 'Raw Material');
    const updatedItems: Item[] = [];
    let updatedVariantCount = 0;
    const roundingLogs: LogRoundingEventInput[] = [];
    const configToUse = companyConfig || getStoredConfig();

    candidates.forEach((item) => {
        const result = repriceItem(item, inventory, bomTemplates, activeAdjustments, configToUse);
        if (result.changed) {
            updatedItems.push(result.item);
            updatedVariantCount += result.variantChanges;
            roundingLogs.push(...result.roundingLogs);
        }
    });

    await Promise.all(updatedItems.map((item) => dbService.put('inventory', item)));
    if (roundingLogs.length > 0) {
        await logRoundingEvents(roundingLogs);
    }

    return {
        totalCandidates: candidates.length,
        activeAdjustments: activeAdjustments.length,
        updatedItems: updatedItems.length,
        updatedVariants: updatedVariantCount
    };
};
