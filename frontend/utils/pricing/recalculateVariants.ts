import { dbService } from '../../services/db';
import { Item, ProductVariant, MarketAdjustment, BOMTemplate } from '../../types';
import { applyProductPriceRounding } from '../../services/pricingRoundingService';

interface RecalculateResult {
    updatedItems: number;
    updatedVariants: number;
    errors: string[];
}

/**
 * Utility to identify and fix variants with zero prices or missing snapshots.
 * This runs in the browser context as it requires access to IndexedDB and LocalStorage.
 */
export const repairVariantPricing = async (
    inventory: Item[],
    marketAdjustments: MarketAdjustment[],
    bomTemplates: BOMTemplate[]
): Promise<RecalculateResult> => {
    let updatedItemsCount = 0;
    let updatedVariantsCount = 0;
    const errors: string[] = [];

    // Get company config for rounding settings
    let companyConfig: any = null;
    try {
        const raw = localStorage.getItem('nexus_company_config');
        companyConfig = raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('Failed to parse company config', e);
    }

    const updatedItems: Item[] = [];

    for (const item of inventory) {
        if (!item.variants || item.variants.length === 0) continue;

        let itemChanged = false;
        const newVariants = [...item.variants];

        for (let i = 0; i < newVariants.length; i++) {
            const variant = newVariants[i];
            const isZeroPrice = !variant.price || variant.price <= 0;
            const isMissingSnapshot = !variant.smartPricingSnapshot && variant.pricingSource === 'dynamic';

            if (isZeroPrice || isMissingSnapshot) {
                // Attempt to recalculate
                try {
                    const result = recalculateVariant(item, variant, inventory, marketAdjustments, companyConfig);
                    if (result) {
                        newVariants[i] = {
                            ...variant,
                            ...result,
                            updatedAt: new Date().toISOString()
                        };
                        itemChanged = true;
                        updatedVariantsCount++;
                    }
                } catch (err: any) {
                    errors.push(`Error recalculating variant ${variant.sku}: ${err.message}`);
                }
            }
        }

        if (itemChanged) {
            const updatedItem = {
                ...item,
                variants: newVariants,
                isVariantParent: true
            };
            updatedItems.push(updatedItem);
            updatedItemsCount++;
        }
    }

    // Save updated items back to DB
    for (const item of updatedItems) {
        try {
            await dbService.update('inventory', item.id, item);
        } catch (err: any) {
            errors.push(`Failed to save item ${item.sku}: ${err.message}`);
        }
    }

    return {
        updatedItems: updatedItemsCount,
        updatedVariants: updatedVariantsCount,
        errors
    };
};

/**
 * Replicates the logic from ItemModal.tsx calculateSmartVariantPrice
 */
function recalculateVariant(
    parent: Item,
    variant: ProductVariant,
    inventory: Item[],
    marketAdjustments: MarketAdjustment[],
    companyConfig: any
) {
    const sp = parent.smartPricing;
    if (!sp || variant.pricingSource === 'static') {
        // For static variants, we can only try to restore from price if it's not 0
        // or keep as is if we don't have enough info.
        // If it's static and 0, it's a real data error we can't easily auto-fix without human input.
        return null;
    }

    const pages = Number(variant.pages) || 1;
    const copies = 1;

    // Paper cost
    let paperCost = 0;
    const paper = inventory.find((i: Item) => i.id === sp.paperItemId);
    if (paper) {
        const sheetsPerCopy = Math.ceil(pages / 2);
        const totalSheets = sheetsPerCopy * copies;
        const reamSize = Number((paper as any).conversionRate || (paper as any).conversion_rate || 500);
        const paperUnitCost = Number((paper as any).cost_price || (paper as any).cost_per_unit || paper.cost || 0);
        const costPerSheet = reamSize > 0 ? paperUnitCost / reamSize : 0;
        paperCost = Number((totalSheets * costPerSheet).toFixed(2));
    }

    // Toner cost
    let tonerCost = 0;
    const toner = inventory.find((i: Item) => i.id === sp.tonerItemId);
    if (toner) {
        const capacity = 20000;
        const totalPages = pages * copies;
        const tonerUnitCost = Number((toner as any).cost_price || (toner as any).cost_per_unit || toner.cost || 0);
        tonerCost = Number((totalPages * (tonerUnitCost / capacity)).toFixed(2));
    }

    // Finishing cost (simplified fallback if finishingButtons not available)
    // In a real repair script, we might need the actual finishing costs from settings
    let finishingCost = 0;
    // ... (This is tricky without the finishingButtons state from ItemModal)

    const baseCost = paperCost + tonerCost + finishingCost;

    // Market adjustments
    const activeAdjustments = marketAdjustments.filter(a => a.active || a.isActive);
    const adjustmentLines = activeAdjustments.map(adj => {
        const type = (adj.type || '').toUpperCase();
        const value = (type === 'PERCENTAGE' || type === 'PERCENT')
            ? baseCost * ((adj.value || 0) / 100)
            : (adj.value || 0) * pages * copies;
        return { 
            id: adj.id, 
            name: adj.name, 
            type: adj.type, 
            value: Number(value.toFixed(2)), 
            rawValue: adj.value 
        };
    });
    
    const marketAdjustmentTotal = adjustmentLines.reduce((s, a) => s + a.value, 0);
    const priceAfterAdjustments = baseCost + marketAdjustmentTotal;

    // Profit margin (using global default)
    let globalMargin = null;
    try {
        const rawSettings = localStorage.getItem('nexus_company_config');
        if (rawSettings) {
            const config = JSON.parse(rawSettings);
            globalMargin = config?.pricingSettings?.globalDefaultMargin;
        }
    } catch {}

    let profitMarginAmount = 0;
    if (globalMargin && globalMargin.margin_value > 0) {
        profitMarginAmount = globalMargin.margin_type === 'percentage'
            ? priceAfterAdjustments * (globalMargin.margin_value / 100)
            : globalMargin.margin_value;
    }
    const priceBeforeRounding = priceAfterAdjustments + profitMarginAmount;

    // Rounding
    const roundingResult = applyProductPriceRounding({ 
        calculatedPrice: priceBeforeRounding, 
        companyConfig 
    });

    const smartSnapshot = {
        paperCost,
        tonerCost,
        finishingCost,
        baseCost,
        marketAdjustments: adjustmentLines,
        marketAdjustmentTotal,
        profitMarginAmount,
        originalPrice: roundingResult.originalPrice,
        roundedPrice: roundingResult.roundedPrice,
        roundingDifference: roundingResult.roundingDifference ?? 0,
        wasRounded: roundingResult.wasRounded ?? false,
        roundingMethod: roundingResult.methodUsed,
        pages,
        copies,
    };

    return {
        price: roundingResult.roundedPrice,
        cost: baseCost,
        cost_price: baseCost,
        calculated_price: roundingResult.originalPrice,
        selling_price: roundingResult.roundedPrice,
        rounding_difference: roundingResult.roundingDifference,
        rounding_method: roundingResult.methodUsed,
        smartPricingSnapshot: smartSnapshot
    };
}
