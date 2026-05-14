import React, { useState, useEffect, useMemo } from 'react';
// PRICING RULE: Do NOT implement pricing logic here. All pricing MUST go through pricingEngine.ts
import { X, Save, Plus, Trash2, AlertCircle, Package, DollarSign, Hash, MapPin, Truck, Tag, FileText, Box, Layers, ArrowRight, Wand2, Grid, Scale, RefreshCw, Eye, EyeOff, Info, Check, Edit3, TrendingUp } from 'lucide-react';
import { Item, Warehouse, ProductVariant, PricingConfig, FinishingOption, AdjustmentSnapshot, BOMTemplate, PricingRoundingMethod } from '../../../types';
import { useData } from '../../../context/DataContext';
import { generateAutoSKU, generateAutoBarcode, generateBulkVariants } from '../../../utils/skuGenerator';
import { pricingService } from '../../../services/pricingService';
import { dbService } from '../../../services/db';
import { applyProductPriceRounding, ROUNDING_METHOD_OPTIONS } from '../../../services/pricingRoundingService';
import { calculateBaseSellingPrice, normalizeInventoryItemPricing } from '../../../utils/pricing';
import { calculateSellingPrice } from '../../../utils/pricing/pricingEngine';
import { getGlobalDefaultMargin } from '../../../services/pricingService';

// Generate a unique ID without external dependency
const generateId = (): string => {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
};

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Item) => Promise<void> | void;
    onUpdate: (item: Item) => Promise<void> | void;
    item?: Item | null; // For edit mode
    warehouses: Warehouse[];
    mode: 'add' | 'edit';
}

interface FormErrors {
    name?: string;
    sku?: string;
    category?: string;
    type?: string;
    price?: string;
    cost?: string;
    stock?: string;
    unit?: string;
}

const defaultItem: Partial<Item> = {
    name: '',
    sku: '',
    description: '',
    price: 0,
    cost: 0,
    stock: 0,
    category: '',
    type: 'Product',
    unit: 'pcs',
    minStockLevel: 0,
    preferredSupplierId: '',
    binLocation: '',
    barcode: '',
    purchaseUnit: '',
    usageUnit: '',
    conversionRate: 1,
    isLargeFormat: false,
    rollWidth: 0,
    rollLength: 0,
    pages: 1,
    leadTimeDays: 0,
    minOrderQty: 1,
    reorderPoint: 0,
    marginPercent: 0,
    variants: [],
    isVariantParent: false,
    isStationeryPack: false,
    costPerPack: 0,
    unitsPerPack: 0,

    locationStock: [],
    isCustomizableService: false, // Default: not a customizable service
    pricingConfig: {
        marketAdjustment: 0,
        finishingOptions: [],
        manualOverride: false
    }
};

const DEFAULT_FINISHING_BUTTONS: Array<{ id: string; name: string; cost: number; description?: string }> = [
    { id: 'binding', name: 'Binding', cost: 150, description: 'Book binding - comb or spiral' },
    { id: 'coverPages', name: 'Cover Pages', cost: 20, description: 'Front and back cover pages per copy' },
    { id: 'cutting', name: 'Cutting & Trimming', cost: 30, description: 'Trim edges to clean finish' },
    { id: 'holePunch', name: 'Hole Punching', cost: 20, description: 'Punch holes for folder binding' },
    { id: 'folding', name: 'Folding', cost: 15, description: 'Fold pages for insertion' },
    { id: 'stapling', name: 'Stapling', cost: 10, description: 'Corner or saddle stapling' }
];



const ItemModal: React.FC<ItemModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onUpdate,
    item,
    warehouses,
    mode
}) => {

    const { suppliers, companyConfig, inventory, marketAdjustments } = useData();
    const currency = companyConfig.currencySymbol || '$';

    const [formData, setFormData] = useState<Partial<Item>>(defaultItem);
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'basic' | 'pricing' | 'inventory' | 'variants'>('basic');
    
    // Style constants for modern redesign - dimensions preserved exactly
    const styles = {
        label: "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 block mb-2",
        sectionTitle: "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-4 pb-2 border-b border-slate-100",
        input: "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300",
        textarea: "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder:text-slate-400 min-h-[90px] resize-none hover:border-slate-300",
        select: "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none cursor-pointer hover:border-slate-300",
        card: "bg-white border border-slate-100 rounded-2xl p-5 mb-4 shadow-sm hover:shadow-md transition-shadow",
        modal: "bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden",
        priceValue: "text-[18px] font-semibold text-slate-900",
        metricValue: "text-[15px] font-semibold text-slate-800",
        row: "flex items-center justify-between py-3 border-b border-slate-100 last:border-0",
        summaryRow: "flex items-center justify-between py-3.5 px-5 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl mb-3",
        highlightRow: "flex items-center justify-between py-5 px-6 -mx-6 bg-gradient-to-r from-blue-50 to-indigo-50 mt-4 border-y border-blue-100",
        title: "text-[16px] font-semibold text-slate-900",
        tableHeader: "text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 border-b border-slate-100 bg-slate-50",
        tableCell: "text-[13px] text-slate-700 px-4 py-3 border-b border-slate-50",
        premiumCard: "relative overflow-hidden bg-gradient-to-br from-white via-white to-slate-50/30 border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300",
        premiumSectionTitle: "text-[13px] font-semibold text-slate-800 mb-5 flex items-center gap-2",
        glassMetric: "backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl px-4 py-3",
        premiumDivider: "h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4",
        priceTag: "px-3 py-1.5 rounded-lg font-semibold text-sm",
    };

    const [newVariant, setNewVariant] = useState<Partial<ProductVariant>>({
        id: '',
        sku: '',
        name: '',
        attributes: {},
        price: 0,
        cost: 0,
        stock: 0,
        marginPercent: 0,
        pages: 1
    });
    const [showVariantForm, setShowVariantForm] = useState(false);

    // Live price preview for the "Add Variant" form
    const [variantPreview, setVariantPreview] = useState<ReturnType<typeof calculateSmartVariantPrice>>(null);

    // Bulk Variant Generation State
    const [showBulkGenerator, setShowBulkGenerator] = useState(false);
    const [bulkAttributes, setBulkAttributes] = useState<{ name: string, values: string[] }[]>([{ name: 'Size', values: [] }]);
    const [bulkInputValue, setBulkInputValue] = useState<{ [key: number]: string }>({});
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [bomLoading, setBomLoading] = useState<boolean>(true);
    const [finishingButtons, setFinishingButtons] = useState<Array<{ id: string; name: string; cost: number; description?: string }>>([]);

    // Rounding Engine State
    const [showInternalPricing, setShowInternalPricing] = useState(true);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [showManualOverrideCard, setShowManualOverrideCard] = useState(false);

    // Stationery Pack Conversion State
    const [usePackConversion, setUsePackConversion] = useState(false);

    // Live pricing preview from engine
    const [enginePreview, setEnginePreview] = useState<{
        unitPrice: number;
        cost: number;
        marginAmount: number;
        adjustmentTotal: number;
        adjustmentSnapshots: any[];
        breakdown: any;
    } | null>(null);

    // Global Default Margin from Settings
    const [globalMargin, setGlobalMargin] = useState<{ margin_type: 'percentage' | 'fixed_amount'; margin_value: number } | null>(null);

    // Load global margin on mount
    useEffect(() => {
        const loadGlobalMargin = async () => {
            try {
                const margin = await getGlobalDefaultMargin();
                setGlobalMargin(margin);
            } catch (err) {
                console.error('[ItemModal] Failed to load global margin:', err);
            }
        };
        loadGlobalMargin();
    }, []);

    // Helper for active margin percentage
    const activeMarginPercent = useMemo(() => {
        if (globalMargin && globalMargin.margin_type === 'percentage') {
            return globalMargin.margin_value;
        }
        return formData.marginPercent || 0;
    }, [globalMargin, formData.marginPercent]);

    // Computed values for pack conversion
    const derivedCostPerPiece = useMemo(() => {
        if (!formData.isStationeryPack) return formData.cost || 0;
        if (!formData.unitsPerPack || formData.unitsPerPack === 0) return 0;
        return (formData.costPerPack || 0) / formData.unitsPerPack;
    }, [formData.isStationeryPack, formData.cost, formData.costPerPack, formData.unitsPerPack]);

    const activeMarginAmount = useMemo(() => {
        const cost = derivedCostPerPiece || formData.cost || 0;
        if (globalMargin) {
            if (globalMargin.margin_type === 'fixed_amount') {
                return globalMargin.margin_value;
            }
            return cost * (globalMargin.margin_value / 100);
        }
        return cost * (activeMarginPercent / 100);
    }, [globalMargin, derivedCostPerPiece, formData.cost, activeMarginPercent]);


    // â”€â”€â”€ Smart Pricing engine helper for variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Mirrors SmartPricing.tsx calculateCosts() exactly, using the parent product's
    // smartPricing snapshot (paper/toner/finishing/margin config) with a variant's pages.
    const calculateSmartVariantPrice = (pages: number, copies: number = 1) => {
        const sp = formData.smartPricing;
        if (!sp) return null;

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

        // Finishing cost â€” reuse saved finishing button costs (same source as SmartPricing)
        const finishingCost = ((sp.finishingEnabled || []) as string[]).reduce((sum: number, id: string) => {
            const opt = finishingButtons.find(f => f.id === id);
            return sum + ((opt?.cost || 0) * copies);
        }, 0);

        const baseCost = paperCost + tonerCost + finishingCost;

        // Market adjustments â€” same logic as SmartPricing
        const adjustmentLines = marketAdjustments.map(adj => {
            const type = (adj.type || '').toUpperCase();
            const value = (type === 'PERCENTAGE' || type === 'PERCENT')
                ? baseCost * ((adj.value || 0) / 100)
                : (adj.value || 0) * pages * copies;
            return { id: adj.id, name: adj.name, type: adj.type, value: Number(value.toFixed(2)), rawValue: adj.value };
        });
        const marketAdjustmentTotal = adjustmentLines.reduce((s: number, a: any) => s + a.value, 0);
        const priceAfterAdjustments = baseCost + marketAdjustmentTotal;

        // Profit margin
        let profitMarginAmount = 0;
        if (globalMargin && globalMargin.margin_value > 0) {
            profitMarginAmount = globalMargin.margin_type === 'percentage'
                ? priceAfterAdjustments * (globalMargin.margin_value / 100)
                : globalMargin.margin_value;
        }
        const priceBeforeRounding = priceAfterAdjustments + profitMarginAmount;

        // Rounding
        let roundingResult: any;
        try {
            roundingResult = applyProductPriceRounding({ calculatedPrice: priceBeforeRounding, companyConfig });
        } catch {
            roundingResult = { originalPrice: priceBeforeRounding, roundedPrice: priceBeforeRounding, roundingDifference: 0, wasRounded: false, methodUsed: 'NONE' };
        }

        return {
            paperCost,
            tonerCost,
            finishingCost,
            baseCost,
            marketAdjustments: adjustmentLines,
            marketAdjustmentTotal,
            profitMarginAmount,
            marginType: globalMargin?.margin_type,
            marginValue: globalMargin?.margin_value,
            originalPrice: roundingResult.originalPrice,
            roundedPrice: roundingResult.roundedPrice,
            roundingDifference: roundingResult.roundingDifference ?? 0,
            wasRounded: roundingResult.wasRounded ?? false,
            roundingMethod: roundingResult.methodUsed,
            pages,
            copies,
        };
    };
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Contextual unit options per type
    const getUnitOptions = () => {
        switch (formData.type) {
            case 'Product': 
            case 'Service': return ['pcs', 'units', 'sets', 'packs', 'hours', 'sessions', 'fixed'];
            case 'Raw Material': return ['kg', 'g', 'l', 'ml', 'm', 'cm', 'rolls', 'sheets', 'reams', 'boxes', 'packs'];
            case 'Stationery': return ['pcs', 'packs', 'boxes', 'reams'];
            default: return ['pcs'];
        }
    };

    // ... (keep useMemo and useEffect hooks for pricing engine logic) ...

    const calculatedPrice = useMemo(() => {
        const cost = derivedCostPerPiece;
        
        // PHASE 1: Base Margin Layer - Use globalMargin if available
        let effectiveMargin = formData.marginPercent || 0;
        if (globalMargin && globalMargin.margin_type === 'percentage') {
            effectiveMargin = globalMargin.margin_value;
        }

        const baseMarginPrice = calculateBaseSellingPrice(cost, effectiveMargin);
        
        // If global margin is fixed amount, we need to handle it differently than calculateBaseSellingPrice
        let finalBasePrice = baseMarginPrice;
        if (globalMargin && globalMargin.margin_type === 'fixed_amount') {
            finalBasePrice = cost + globalMargin.margin_value;
        }

        const markup = formData.pricingConfig?.markup || 0;
        return finalBasePrice * (1 + markup / 100);
    }, [derivedCostPerPiece, formData.pricingConfig?.markup, formData.marginPercent, globalMargin]);

    const finalPrice = useMemo(() => {
        const roundingResult = applyProductPriceRounding({
            calculatedPrice,
            methodOverride: formData.pricingConfig?.selectedRoundingMethod,
            customStepOverride: formData.pricingConfig?.customRoundingStep
        });
        return roundingResult.roundedPrice;
    }, [calculatedPrice, formData.pricingConfig?.selectedRoundingMethod, formData.pricingConfig?.customRoundingStep]);

    const isStockTrackedItemType = (type?: string) => type === 'Stationery' || type === 'Material' || type === 'Raw Material';
    const isServiceType = formData.type === 'Service';
    const hasStockFunctionality = isStockTrackedItemType(formData.type);
    const isItemManualOverride = Boolean(formData.pricingConfig?.manualOverride);
    const activeMarketAdjustments = useMemo(
        () => marketAdjustments.filter(ma => ma.active ?? ma.isActive),
        [marketAdjustments]
    );
    const stationeryAdjustmentOptions = useMemo(() => activeMarketAdjustments.filter(adj => {
        const categories = adj.applyToCategories || [];
        return categories.length === 0 || (formData.category ? categories.includes(formData.category) : false);
    }), [activeMarketAdjustments, formData.category]);

    // Helper: derive ready-state for inventory/market adjustments
    const isInventoryReady = inventory && inventory.length > 0;
    const isMarketAdjustmentsReady = marketAdjustments && marketAdjustments.length > 0;



    useEffect(() => {
        if (!hasStockFunctionality && activeTab === 'inventory') {
            setActiveTab('basic');
        }
    }, [activeTab, hasStockFunctionality]);

    useEffect(() => {
        let mounted = true;
        const updatePreview = async () => {
            const cost = derivedCostPerPiece || formData.cost || 0;
            if (cost <= 0) {
                setEnginePreview(null);
                return;
            }

            const selectedIds = formData.pricingConfig?.selectedAdjustmentIds || [];
            const adjustmentsInput = marketAdjustments
                .filter(adj => selectedIds.includes(adj.id))
                .map(adj => ({
                    name: adj.name,
                    type: adj.type,
                    value: adj.value,
                    percentage: adj.percentage ?? adj.value,
                    adjustmentId: adj.id,
                    isActive: true
                }));

            try {
                const preview = await calculateSellingPrice({
                    itemId: formData.id,
                    categoryId: formData.category,
                    baseCost: cost,
                    adjustments: adjustmentsInput,
                    context: 'POS'
                });

                if (mounted) {
                    setEnginePreview({
                        unitPrice: preview.unitPrice,
                        cost: preview.cost,
                        marginAmount: preview.marginAmount,
                        adjustmentTotal: preview.adjustmentTotal,
                        adjustmentSnapshots: preview.adjustmentSnapshots,
                        breakdown: preview.breakdown
                    });
                }
            } catch (err) {
                console.error('[ItemModal] Pricing engine error:', err);
            }
        };

        updatePreview();
        return () => { mounted = false; };
    }, [derivedCostPerPiece, formData.cost, formData.category, formData.id, formData.pricingConfig?.selectedAdjustmentIds, marketAdjustments]);

    const automaticProductPricing = useMemo(() => {
        const smartRoundedPrice = Number((formData as any).smartPricing?.roundedPrice);
        const smartOriginalPrice = Number((formData as any).smartPricing?.originalPrice);

        if (Number.isFinite(smartRoundedPrice) && smartRoundedPrice > 0) {
            return {
                price: smartRoundedPrice,
                sellingPrice: smartRoundedPrice,
                calculatedPrice: Number.isFinite(smartOriginalPrice) && smartOriginalPrice > 0 ? smartOriginalPrice : smartRoundedPrice,
                roundingDifference: Number((formData as any).smartPricing?.roundingDifference ?? 0) || 0,
                roundingMethod: (formData as any).smartPricing?.roundingMethod as string | undefined
            };
        }

        const previewPrice = Number(enginePreview?.unitPrice);
        if (Number.isFinite(previewPrice) && previewPrice > 0) {
            return {
                price: previewPrice,
                sellingPrice: previewPrice,
                calculatedPrice: previewPrice,
                roundingDifference: 0,
                roundingMethod: undefined as string | undefined
            };
        }

        const currentPrice = Number(formData.price) || 0;
        const currentCalculated = Number(formData.calculated_price) || currentPrice;
        return {
            price: currentPrice,
            sellingPrice: Number(formData.selling_price) || currentPrice,
            calculatedPrice: currentCalculated,
            roundingDifference: Number(formData.rounding_difference) || 0,
            roundingMethod: formData.rounding_method as string | undefined
        };
    }, [
        formData.smartPricing,
        enginePreview?.unitPrice,
        formData.price,
        formData.selling_price,
        formData.calculated_price,
        formData.rounding_difference,
        formData.rounding_method
    ]);

    const displayedProductPrice = isItemManualOverride
        ? Number(formData.price) || 0
        : automaticProductPricing.price;

    const handleManualProductPriceChange = (value: number) => {
        const safeValue = Math.max(0, Number(value) || 0);
        setFormData(prev => ({
            ...prev,
            price: safeValue,
            selling_price: safeValue,
            calculated_price: safeValue,
            rounding_difference: 0,
            rounding_method: undefined,
            pricingConfig: {
                ...prev.pricingConfig!,
                manualOverride: true
            }
        }));
    };

    const toggleProductManualOverride = (enabled: boolean) => {
        setFormData(prev => {
            if (enabled) {
                const currentPrice = Number(prev.price) || automaticProductPricing.price;
                return {
                    ...prev,
                    price: currentPrice,
                    selling_price: currentPrice,
                    calculated_price: currentPrice,
                    rounding_difference: 0,
                    rounding_method: undefined,
                    pricingConfig: {
                        ...prev.pricingConfig!,
                        manualOverride: true
                    }
                };
            }

            return {
                ...prev,
                price: automaticProductPricing.price,
                selling_price: automaticProductPricing.sellingPrice,
                calculated_price: automaticProductPricing.calculatedPrice,
                rounding_difference: automaticProductPricing.roundingDifference,
                rounding_method: automaticProductPricing.roundingMethod,
                pricingConfig: {
                    ...prev.pricingConfig!,
                    manualOverride: false
                }
            };
        });
    };

    const handleManualStationeryPriceChange = (value: number) => {
        const safeValue = roundMoney(Math.max(0, Number(value) || 0));
        setFormData(prev => ({
            ...prev,
            price: safeValue,
            selling_price: safeValue,
            calculated_price: safeValue,
            rounding_difference: 0,
            rounding_method: undefined,
            pricingConfig: {
                ...prev.pricingConfig!,
                manualOverride: true
            }
        }));
    };

    const toggleStationeryManualOverride = (enabled: boolean) => {
        setFormData(prev => {
            if (enabled) {
                const currentPrice = Number(prev.price) || stationeryAutoPricing.sellingPrice;
                return {
                    ...prev,
                    price: currentPrice,
                    selling_price: currentPrice,
                    calculated_price: currentPrice,
                    rounding_difference: 0,
                    rounding_method: undefined,
                    pricingConfig: {
                        ...prev.pricingConfig!,
                        manualOverride: true
                    }
                };
            }

            return {
                ...prev,
                cost: stationeryAutoPricing.costPrice,
                cost_price: stationeryAutoPricing.costPrice,
                marginPercent: stationeryAutoPricing.marginPercent,
                price: stationeryAutoPricing.sellingPrice,
                selling_price: stationeryAutoPricing.sellingPrice,
                calculated_price: stationeryAutoPricing.calculatedPrice,
                rounding_difference: stationeryAutoPricing.roundingDifference,
                rounding_method: stationeryAutoPricing.roundingMethod,
                adjustmentSnapshots: stationeryAutoPricing.adjustmentSnapshots,
                pricingConfig: {
                    ...prev.pricingConfig!,
                    manualOverride: false,
                    marketAdjustment: stationeryAutoPricing.adjustmentTotal,
                    totalCost: stationeryAutoPricing.costPrice
                }
            };
        });
    };

    const resolveRoundingBasePrice = () => {
        if (formData.pricingConfig?.manualOverride) {
            return Number(formData.price) || 0;
        }
        // SmartPricing product: use the snapshot's roundedPrice as the authoritative price
        const snapPrice = Number((formData as any).smartPricing?.roundedPrice);
        if (Number.isFinite(snapPrice) && snapPrice > 0) return snapPrice;
        const raw = Number(formData.calculated_price);
        if (Number.isFinite(raw) && raw > 0) return raw;
        return Number(formData.price) || 0;
    };

    const resolveVariantBasePrice = (variant: ProductVariant) => {
        // Prefer SmartPricing snapshot (most accurate â€” set by the engine)
        const snapPrice = Number((variant as any).smartPricingSnapshot?.roundedPrice);
        if (Number.isFinite(snapPrice) && snapPrice > 0) return snapPrice;
        // Then selling_price (already rounded and persisted)
        const sp = Number((variant as any).selling_price);
        if (Number.isFinite(sp) && sp > 0) return sp;
        // Then calculated_price
        const cp = Number(variant.calculated_price);
        if (Number.isFinite(cp) && cp > 0) return cp;
        // Finally raw price
        return Number(variant.price) || 0;
    };

    // Helper function to apply rounding to a price
    const applyRoundingToPrice = (price: number, existingItem?: Partial<Item> | Partial<ProductVariant>) => {
        // Materials are cost-only, no rounding needed
        if (formData.type === 'Raw Material' || formData.type === 'Material' || formData.type === 'Stationery') {
            return {
                calculatedPrice: price,
                sellingPrice: price,
                roundingDifference: 0,
                roundingMethod: undefined as string | undefined
            };
        }
        // Guard: never run rounding on a zero price â€” return zero passthrough
        if (!price || price <= 0) {
            return {
                calculatedPrice: 0,
                sellingPrice: 0,
                roundingDifference: 0,
                roundingMethod: undefined as string | undefined
            };
        }

        const roundingResult = applyProductPriceRounding({
            calculatedPrice: price,
            companyConfig: companyConfig,
            existingCalculatedPrice: existingItem?.calculated_price,
            existingRoundedPrice: existingItem?.selling_price,
            existingRoundingDifference: existingItem?.rounding_difference,
            existingRoundingMethod: existingItem?.rounding_method,
            skipIfAlreadyRounded: true
        });

        return {
            calculatedPrice: roundingResult.originalPrice,
            sellingPrice: roundingResult.roundedPrice,
            roundingDifference: roundingResult.roundingDifference,
            roundingMethod: roundingResult.methodUsed
        };
    };

    // Load BOM templates on mount
    useEffect(() => {
        let mounted = true;
        setBomLoading(true);
dbService.getAll<BOMTemplate>('bomTemplates')
    .then((templates) => {
        if (mounted) setBomTemplates(templates || []);
    })
    .catch((err) => {
        console.error('Failed to load BOM templates for variant pricing', err);
    })
    .finally(() => { if (mounted) setBomLoading(false); });
        // Load finishing option costs (saved settings) to match SmartPricing UI
        dbService.getSetting<Record<string, number>>('finishingOptionCosts')
            .then(savedCosts => {
                if (!mounted) return;
                const merged = DEFAULT_FINISHING_BUTTONS.map(d => ({ ...d, cost: savedCosts?.[d.id] ?? d.cost }));
                setFinishingButtons(merged);
            })
            .catch(() => {
                // fallback to defaults
                setFinishingButtons(DEFAULT_FINISHING_BUTTONS);
            });
        return () => { mounted = false; };
    }, []);

    // Populate form when editing
    useEffect(() => {
        if (item && mode === 'edit') {
            const normalizedItem = normalizeInventoryItemPricing(item);
            const shouldBeManual =
                normalizedItem.pricingConfig?.manualOverride ??
                (normalizedItem.type === 'Service' || normalizedItem.type === 'Raw Material' || normalizedItem.type === 'Material');

            setFormData({
                ...defaultItem,
                ...normalizedItem,
                variants: normalizedItem.variants || [],
                pricingConfig: {
                    ...defaultItem.pricingConfig,
                    ...normalizedItem.pricingConfig,
                    manualOverride: shouldBeManual
                }
            });
        } else {
            setFormData({
                ...defaultItem,
                sku: generateAutoSKU('ITEM', 'NEW')
            });
        }
        setErrors({});
        setActiveTab('basic');
        setShowVariantForm(false);
        setShowBulkGenerator(false);
        setShowManualOverrideCard(false);
    }, [item, mode, isOpen]);

    // Material filtering for BOM
    const materials = useMemo(() => (inventory || []).filter((i: Item) => i.type === 'Raw Material' || i.type === 'Material'), [inventory]);
    const paperMaterials = useMemo(() => materials.filter((i: Item) => i.category?.toLowerCase().includes('paper') || i.name.toLowerCase().includes('paper')), [materials]);
    const tonerMaterials = useMemo(() => materials.filter((i: Item) => i.category?.toLowerCase().includes('toner') || i.category?.toLowerCase().includes('cartridge') || i.name.toLowerCase().includes('toner')), [materials]);

    // Calculate BOM costs from stored template
    const bomCosts = useMemo(() => {
        if (!formData.smartPricing?.bomTemplateId || !bomTemplates.length) {
            return { paper: 0, toner: 0, finishing: 0, total: 0 };
        }
        const template = bomTemplates.find(b => b.id === formData.smartPricing.bomTemplateId);
        if (!template?.components?.length) {
            return { paper: 0, toner: 0, finishing: 0, total: 0 };
        }
        let paper = 0, toner = 0, finishing = 0;
        template.components.forEach(comp => {
            const item = materials.find(m => m.id === comp.itemId);
            if (!item) return;
            const cost = item.cost || 0;
            const qty = parseFloat(comp.quantityFormula) || 1;
            if (comp.name?.toLowerCase().includes('paper')) {
                paper += cost * qty;
            } else if (comp.name?.toLowerCase().includes('toner')) {
                toner += cost * qty;
            } else {
                finishing += cost * qty;
            }
        });
        return { paper, toner, finishing, total: paper + toner + finishing };
    }, [formData.smartPricing?.bomTemplateId, bomTemplates, materials]);

    // Helper to calculate cost/price based on pages and config
    const calculateItemFinancials = (pPages: number, pConfig: PricingConfig | undefined, pItemType?: string, pManualCost?: number) => {
        const rawCost = pManualCost || (pItemType === 'Stationery' ? derivedCostPerPiece : formData.cost) || 0;
        const safePages = Math.max(1, pPages);
        // For services, the unit cost is interpreted as the total cost per copy (all pages).
        // Dividing by pages here ensures the baseCost calculation (cost * pages) remains consistent with the original unit cost.
        const cost = pItemType === 'Service' ? (rawCost / safePages) : rawCost;
        let baseCost = cost * safePages;
        
        // Simple calculation for now - this can be expanded to use the pricing engine
        const finishingCost = pConfig?.finishingOptions?.reduce((sum, opt) => sum + opt.quantity * 5, 0) || 0;
        let adjustments = 0;
        
        if (pConfig?.selectedAdjustmentIds) {
            adjustments = pConfig.selectedAdjustmentIds.reduce((sum, adjId) => {
                const adj = marketAdjustments.find(a => a.id === adjId);
                if (adj) {
                    if (adj.type === 'PERCENTAGE') {
                        return sum + (cost * pPages * adj.value / 100);
                    } else {
                        return sum + adj.value * pPages;
                    }
                }
                return sum;
            }, 0);
        }
        
        const total = baseCost + finishingCost + adjustments;
        const margin = total * ((formData.marginPercent || 0) / 100);
        const finalPrice = total + margin;
        
        return {
            paperCost: cost * pPages,
            tonerCost: 0, // Will be implemented in the pricing engine
            finishingCost,
            adjustments,
            margin,
            total: finalPrice
        };
    };


    // Pricing Calculation Logic
    useEffect(() => {
        // Wait for BOM to load first
        if (bomLoading) return;
        if (formData.type === 'Raw Material' || formData.type === 'Material' || formData.type === 'Stationery' || !formData.pricingConfig || formData.pricingConfig.manualOverride) return;
        // SmartPricing products: price is computed by the engine and stored in smartPricing snapshot.
        // Do NOT overwrite with calculateItemFinancials which uses parent cost=0 and produces K0.
        if (formData.smartPricing && formData.type === 'Product') return;


        const financials = calculateItemFinancials(formData.pages || 1, formData.pricingConfig, formData.type, formData.cost);
        if (!financials) return;

        // Apply rounding
        const roundingResult = applyProductPriceRounding({
            calculatedPrice: financials.total ?? 0,
            companyConfig,
            methodOverride: formData.pricingConfig?.selectedRoundingMethod,
            customStepOverride: formData.pricingConfig?.customRoundingStep
        });

        setFormData(prev => ({
            ...prev,
            // price -> the rounded selling price, calculated_price -> the original (pre-rounding) value
            price: roundingResult.roundedPrice,
            selling_price: roundingResult.roundedPrice,
            calculated_price: roundingResult.originalPrice,
            pricingConfig: {
                ...prev.pricingConfig!,
                totalCost: Number((financials.total ?? 0).toFixed(2)),
                marketAdjustment: Number((financials.adjustments ?? 0).toFixed(2))
            }
        }));


    }, [
        bomLoading,
        formData.pricingConfig?.paperId,
        formData.pricingConfig?.tonerId,
        formData.pricingConfig?.finishingOptions,
        formData.pricingConfig?.manualOverride,
        formData.pricingConfig?.selectedAdjustmentIds,
        formData.pricingConfig?.selectedRoundingMethod,
        formData.pages,
        formData.cost,
        materials,
        activeMarketAdjustments,
        companyConfig
    ]);

    // Helper to calculate adjustments for any item/variant based on its cost
    const getAdjustmentSnapshots = (baseCost: number): AdjustmentSnapshot[] => {
        const snapshots: AdjustmentSnapshot[] = [];
        const pages = Number(formData.pages) || 1;

        activeMarketAdjustments.forEach(adj => {
            let amount = 0;
            if (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') {
                amount = baseCost * (adj.value / 100);
            } else {
                // Scale fixed adjustment by pages for consistency
                amount = adj.value * pages;
            }

            snapshots.push({
                name: adj.name,
                type: adj.type as any,
                value: adj.value,
                percentage: (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage') ? adj.value : undefined,
                calculatedAmount: Number(amount.toFixed(2))
            });
        });
        return snapshots;
    };

    const getVariantAttributeSummary = (variant: Partial<ProductVariant>) => {
        const attributes = variant.attributes || {};
        const values = Object.values(attributes).map(value => String(value).trim()).filter(Boolean);
        return values.join(', ');
    };

    const buildVariantAttributesFromText = (value: string) => {
        const trimmed = value.trim();
        return trimmed ? { Attribute: trimmed } : {};
    };

    const roundMoney = (value: number) => Number((Number(value) || 0).toFixed(2));

    const companyDefaultRoundingMethod = (companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50') as PricingRoundingMethod;
    const companyDefaultCustomRoundingStep = Number(companyConfig?.pricingSettings?.customStep) || 50;

    const getRoundingMethodLabel = (method?: string) => {
        if (!method) {
            return `Company Default (${ROUNDING_METHOD_OPTIONS.find(option => option.value === companyDefaultRoundingMethod)?.label || companyDefaultRoundingMethod})`;
        }

        return ROUNDING_METHOD_OPTIONS.find(option => option.value === method)?.label || method;
    };

    const calculateAdjustmentAmount = (adjustment: any, baseCost: number) => {
        const normalizedType = String(adjustment?.type || '').toUpperCase();
        const rawValue = Number(adjustment?.percentage ?? adjustment?.value ?? 0);
        const amount = (normalizedType === 'PERCENTAGE' || normalizedType === 'PERCENT')
            ? baseCost * (rawValue / 100)
            : Number(adjustment?.value || 0);

        return roundMoney(amount);
    };

    const buildStationeryAdjustmentSnapshots = (selectedAdjustmentIds: string[], baseCost: number) => {
        const uniqueIds = Array.from(new Set(selectedAdjustmentIds.filter(Boolean)));

        return uniqueIds
            .map((adjustmentId: string) => (
                stationeryAdjustmentOptions.find(adj => adj.id === adjustmentId)
                || activeMarketAdjustments.find(adj => adj.id === adjustmentId)
            ))
            .filter(Boolean)
            .map((adjustment: any) => ({
                name: adjustment.name,
                type: adjustment.type as any,
                value: Number(adjustment.value || 0),
                percentage: (String(adjustment.type || '').toUpperCase() === 'PERCENTAGE' || String(adjustment.type || '').toUpperCase() === 'PERCENT')
                    ? Number(adjustment.percentage ?? adjustment.value ?? 0)
                    : undefined,
                calculatedAmount: calculateAdjustmentAmount(adjustment, baseCost)
            })) as AdjustmentSnapshot[];
    };

    const resolveStationeryMargin = (baseForMargin: number, fallbackMarginPercent: number) => {
        if (globalMargin) {
            if (globalMargin.margin_type === 'fixed_amount') {
                const marginAmount = roundMoney(globalMargin.margin_value);
                return {
                    marginAmount,
                    marginPercent: baseForMargin > 0 ? roundMoney((marginAmount / baseForMargin) * 100) : 0,
                    label: `Global Fixed (${currency}${marginAmount.toFixed(2)})`
                };
            }

            const marginPercent = roundMoney(globalMargin.margin_value);
            return {
                marginAmount: roundMoney(baseForMargin * (marginPercent / 100)),
                marginPercent,
                label: `Global ${marginPercent}%`
            };
        }

        const marginPercent = roundMoney(fallbackMarginPercent);
        return {
            marginAmount: roundMoney(baseForMargin * (marginPercent / 100)),
            marginPercent,
            label: `${marginPercent}%`
        };
    };

    const calculateStationeryPricingLine = ({
        costPrice,
        selectedAdjustmentIds,
        marginPercentFallback,
        selectedRoundingMethod,
        customRoundingStep
    }: {
        costPrice: number;
        selectedAdjustmentIds?: string[];
        marginPercentFallback?: number;
        selectedRoundingMethod?: PricingRoundingMethod;
        customRoundingStep?: number;
    }) => {
        const safeCostPrice = roundMoney(Math.max(0, Number(costPrice) || 0));
        const normalizedSelectedIds = Array.from(new Set((selectedAdjustmentIds || []).filter(Boolean)));
        const adjustmentSnapshots = buildStationeryAdjustmentSnapshots(normalizedSelectedIds, safeCostPrice);
        const adjustmentTotal = roundMoney(
            adjustmentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.calculatedAmount || 0), 0)
        );
        const subtotalBeforeMargin = roundMoney(safeCostPrice + adjustmentTotal);
        const marginDetails = resolveStationeryMargin(
            subtotalBeforeMargin,
            Number(marginPercentFallback || 0)
        );
        const preRoundedPrice = roundMoney(subtotalBeforeMargin + marginDetails.marginAmount);
        const roundingResult = applyProductPriceRounding({
            calculatedPrice: preRoundedPrice,
            companyConfig,
            methodOverride: selectedRoundingMethod,
            customStepOverride: customRoundingStep,
            trackAnalytics: false
        });

        return {
            costPrice: safeCostPrice,
            selectedAdjustmentIds: normalizedSelectedIds,
            adjustmentSnapshots,
            adjustmentTotal,
            subtotalBeforeMargin,
            marginAmount: marginDetails.marginAmount,
            marginPercent: marginDetails.marginPercent,
            marginLabel: marginDetails.label,
            calculatedPrice: roundingResult.originalPrice,
            sellingPrice: roundingResult.roundedPrice,
            roundingDifference: roundMoney(roundingResult.roundingDifference ?? 0),
            roundingMethod: roundingResult.methodUsed,
            customRoundingStep: customRoundingStep ?? companyDefaultCustomRoundingStep,
            wasRounded: Boolean(roundingResult.wasRounded)
        };
    };

    const calculateStationeryVariantAutoPricing = (variantLike: Partial<ProductVariant>) => {
        return calculateStationeryPricingLine({
            costPrice: Number(variantLike.cost_price ?? variantLike.cost ?? 0),
            selectedAdjustmentIds: Array.isArray((variantLike as any).selectedAdjustmentIds)
                ? (variantLike as any).selectedAdjustmentIds
                : (formData.pricingConfig?.selectedAdjustmentIds || []),
            marginPercentFallback: Number(variantLike.marginPercent ?? formData.marginPercent ?? 0),
            selectedRoundingMethod: ((variantLike as any).selectedRoundingMethod || formData.pricingConfig?.selectedRoundingMethod) as PricingRoundingMethod | undefined,
            customRoundingStep: Number((variantLike as any).customRoundingStep ?? formData.pricingConfig?.customRoundingStep) || undefined
        });
    };

    const stationeryAutoPricing = useMemo(() => calculateStationeryPricingLine({
        costPrice: derivedCostPerPiece || formData.cost || 0,
        selectedAdjustmentIds: formData.pricingConfig?.selectedAdjustmentIds || [],
        marginPercentFallback: Number(formData.marginPercent || 0),
        selectedRoundingMethod: formData.pricingConfig?.selectedRoundingMethod,
        customRoundingStep: Number(formData.pricingConfig?.customRoundingStep) || undefined
    }), [
        derivedCostPerPiece,
        formData.cost,
        formData.marginPercent,
        formData.pricingConfig?.selectedAdjustmentIds,
        formData.pricingConfig?.selectedRoundingMethod,
        formData.pricingConfig?.customRoundingStep,
        stationeryAdjustmentOptions,
        activeMarketAdjustments,
        globalMargin,
        companyConfig
    ]);

    const displayedStationeryUnitPrice = isItemManualOverride
        ? Number(formData.price) || 0
        : stationeryAutoPricing.sellingPrice;

    useEffect(() => {
        if (formData.type !== 'Stationery' || formData.pricingConfig?.manualOverride) return;

        setFormData(prev => {
            if (prev.type !== 'Stationery' || prev.pricingConfig?.manualOverride) {
                return prev;
            }

            const adjustmentSnapshotsChanged = JSON.stringify(prev.adjustmentSnapshots || []) !== JSON.stringify(stationeryAutoPricing.adjustmentSnapshots || []);
            const selectedIdsChanged = JSON.stringify(prev.pricingConfig?.selectedAdjustmentIds || []) !== JSON.stringify(stationeryAutoPricing.selectedAdjustmentIds || []);
            const hasChanged =
                roundMoney(Number(prev.cost) || 0) !== stationeryAutoPricing.costPrice
                || roundMoney(Number(prev.cost_price ?? prev.cost) || 0) !== stationeryAutoPricing.costPrice
                || roundMoney(Number(prev.marginPercent) || 0) !== stationeryAutoPricing.marginPercent
                || roundMoney(Number(prev.calculated_price) || 0) !== stationeryAutoPricing.calculatedPrice
                || roundMoney(Number(prev.price) || 0) !== stationeryAutoPricing.sellingPrice
                || roundMoney(Number(prev.selling_price ?? prev.price) || 0) !== stationeryAutoPricing.sellingPrice
                || roundMoney(Number(prev.rounding_difference) || 0) !== stationeryAutoPricing.roundingDifference
                || prev.rounding_method !== stationeryAutoPricing.roundingMethod
                || adjustmentSnapshotsChanged
                || selectedIdsChanged
                || roundMoney(Number(prev.pricingConfig?.marketAdjustment) || 0) !== stationeryAutoPricing.adjustmentTotal
                || roundMoney(Number(prev.pricingConfig?.totalCost) || 0) !== stationeryAutoPricing.costPrice;

            if (!hasChanged) {
                return prev;
            }

            return {
                ...prev,
                cost: stationeryAutoPricing.costPrice,
                cost_price: stationeryAutoPricing.costPrice,
                marginPercent: stationeryAutoPricing.marginPercent,
                calculated_price: stationeryAutoPricing.calculatedPrice,
                price: stationeryAutoPricing.sellingPrice,
                selling_price: stationeryAutoPricing.sellingPrice,
                rounding_difference: stationeryAutoPricing.roundingDifference,
                rounding_method: stationeryAutoPricing.roundingMethod,
                adjustmentSnapshots: stationeryAutoPricing.adjustmentSnapshots,
                pricingConfig: {
                    ...prev.pricingConfig!,
                    selectedAdjustmentIds: stationeryAutoPricing.selectedAdjustmentIds,
                    marketAdjustment: stationeryAutoPricing.adjustmentTotal,
                    totalCost: stationeryAutoPricing.costPrice
                }
            };
        });
    }, [
        formData.type,
        formData.pricingConfig?.manualOverride,
        stationeryAutoPricing
    ]);

    useEffect(() => {
        if (formData.type !== 'Stationery' || !(formData.variants?.length)) return;

        setFormData(prev => {
            if (prev.type !== 'Stationery' || !(prev.variants?.length)) {
                return prev;
            }

            const updatedVariants = (prev.variants || []).map(variant => (
                recalculateStationeryVariantPrice(variant as ProductVariant, {}) as ProductVariant
            ));

            if (JSON.stringify(prev.variants || []) === JSON.stringify(updatedVariants)) {
                return prev;
            }

            return {
                ...prev,
                variants: updatedVariants
            };
        });
    }, [
        formData.type,
        formData.pricingConfig?.selectedAdjustmentIds,
        formData.pricingConfig?.selectedRoundingMethod,
        formData.pricingConfig?.customRoundingStep,
        globalMargin,
        stationeryAdjustmentOptions,
        activeMarketAdjustments
    ]);

    const patchPricingConfig = (patch: Partial<PricingConfig>) => {
        setFormData(prev => ({
            ...prev,
            pricingConfig: {
                ...prev.pricingConfig!,
                ...patch
            }
        }));
    };

    const handlePricingConfigChange = (field: string, value: any) => {
        patchPricingConfig({ [field]: value } as Partial<PricingConfig>);
    };

    const handleToggleAdjustment = (adjId: string) => {
        setFormData(prev => {
            const currentIds = prev.pricingConfig?.selectedAdjustmentIds || [];
            const isSelected = currentIds.includes(adjId);
            const nextIds = isSelected
                ? currentIds.filter(id => id !== adjId)
                : [...currentIds, adjId];

            return {
                ...prev,
                pricingConfig: {
                    ...prev.pricingConfig!,
                    selectedAdjustmentIds: nextIds
                }
            };
        });
    };

    const updateFinishingOption = (id: string, field: keyof FinishingOption, value: any) => {
        setFormData(prev => {
            const current = prev.pricingConfig?.finishingOptions || [];
            const updated = current.map(opt => opt.id === id ? { ...opt, [field]: value } : opt)
                // remove any with quantity <= 0
                .filter(o => Number(o.quantity || 0) > 0);

            return { ...prev, pricingConfig: { ...prev.pricingConfig!, finishingOptions: updated } };
        });
    };


    const generateVariantId = (): string => {
        return 'VAR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
    };

    const recalculateStationeryVariantPrice = (
        currentVariant: Partial<ProductVariant>,
        incomingPatch: Partial<ProductVariant>
    ): Partial<ProductVariant> => {
        const nextVariant = { ...currentVariant, ...incomingPatch };
        const autoPricing = calculateStationeryVariantAutoPricing(nextVariant);
        const manualOverride = Boolean((nextVariant as any).manualOverride);
        const manualPrice = roundMoney(Math.max(
            0,
            Number(nextVariant.selling_price ?? nextVariant.price ?? autoPricing.sellingPrice) || 0
        ));

        return {
            ...nextVariant,
            cost: autoPricing.costPrice,
            cost_price: autoPricing.costPrice,
            marginAmount: autoPricing.marginAmount,
            marginPercent: autoPricing.marginPercent,
            selectedAdjustmentIds: autoPricing.selectedAdjustmentIds,
            adjustmentSnapshots: autoPricing.adjustmentSnapshots,
            adjustmentTotal: autoPricing.adjustmentTotal,
            selectedRoundingMethod: ((nextVariant as any).selectedRoundingMethod || formData.pricingConfig?.selectedRoundingMethod) as PricingRoundingMethod | undefined,
            customRoundingStep: Number((nextVariant as any).customRoundingStep ?? formData.pricingConfig?.customRoundingStep) || undefined,
            autoCalculatedPrice: autoPricing.calculatedPrice,
            autoSellingPrice: autoPricing.sellingPrice,
            autoRoundingDifference: autoPricing.roundingDifference,
            autoRoundingMethod: autoPricing.roundingMethod,
            manualOverride,
            calculated_price: manualOverride ? manualPrice : autoPricing.calculatedPrice,
            price: manualOverride ? manualPrice : autoPricing.sellingPrice,
            selling_price: manualOverride ? manualPrice : autoPricing.sellingPrice,
            rounding_difference: manualOverride ? 0 : autoPricing.roundingDifference,
            rounding_method: manualOverride ? undefined : autoPricing.roundingMethod
        };
    };

    const handleStationeryVariantChange = (variantId: string, patch: Partial<ProductVariant>) => {
        setFormData(prev => ({
            ...prev,
            variants: (prev.variants || []).map(variant => (
                variant.id === variantId
                    ? recalculateStationeryVariantPrice(variant, patch) as ProductVariant
                    : variant
            ))
        }));
    };

    const toggleStationeryVariantAdjustment = (variant: Partial<ProductVariant>, adjustmentId: string) => {
        const currentIds = Array.isArray((variant as any).selectedAdjustmentIds)
            ? (variant as any).selectedAdjustmentIds
            : [];
        const nextIds = currentIds.includes(adjustmentId)
            ? currentIds.filter((id: string) => id !== adjustmentId)
            : [...currentIds, adjustmentId];

        return recalculateStationeryVariantPrice(variant, { selectedAdjustmentIds: nextIds });
    };

    const toggleNewStationeryAdjustment = (adjustmentId: string) => {
        const currentIds = Array.isArray((newVariant as any).selectedAdjustmentIds)
            ? (newVariant as any).selectedAdjustmentIds
            : [];
        const nextIds = currentIds.includes(adjustmentId)
            ? currentIds.filter((id: string) => id !== adjustmentId)
            : [...currentIds, adjustmentId];

        setNewVariant(recalculateStationeryVariantPrice(newVariant, { selectedAdjustmentIds: nextIds }));
    };

    const handleStationeryVariantManualPriceChange = (variantId: string, value: number) => {
        const safeValue = roundMoney(Math.max(0, Number(value) || 0));
        handleStationeryVariantChange(variantId, {
            manualOverride: true,
            price: safeValue,
            selling_price: safeValue,
            calculated_price: safeValue
        } as Partial<ProductVariant>);
    };

    const toggleStationeryVariantManualOverride = (variant: Partial<ProductVariant>, enabled: boolean) => {
        if (enabled) {
            const currentPrice = roundMoney(resolveVariantBasePrice(variant as ProductVariant) || calculateStationeryVariantAutoPricing(variant).sellingPrice);
            return recalculateStationeryVariantPrice(variant, {
                manualOverride: true,
                price: currentPrice,
                selling_price: currentPrice,
                calculated_price: currentPrice
            } as Partial<ProductVariant>);
        }

        return recalculateStationeryVariantPrice(variant, {
            manualOverride: false
        } as Partial<ProductVariant>);
    };

    const handleNewStationeryManualPriceChange = (value: number) => {
        const safeValue = roundMoney(Math.max(0, Number(value) || 0));
        setNewVariant(recalculateStationeryVariantPrice(newVariant, {
            manualOverride: true,
            price: safeValue,
            selling_price: safeValue,
            calculated_price: safeValue
        }));
    };

    const toggleNewStationeryManualOverride = (enabled: boolean) => {
        if (enabled) {
            const currentPrice = roundMoney(
                Number(newVariant.selling_price ?? newVariant.price ?? calculateStationeryVariantAutoPricing(newVariant).sellingPrice) || 0
            );
            setNewVariant(recalculateStationeryVariantPrice(newVariant, {
                manualOverride: true,
                price: currentPrice,
                selling_price: currentPrice,
                calculated_price: currentPrice
            }));
            return;
        }

        setNewVariant(recalculateStationeryVariantPrice(newVariant, {
            manualOverride: false
        }));
    };

    const createNewVariantDraft = (): Partial<ProductVariant> => {
        const baseDraft: Partial<ProductVariant> = {
            id: '',
            sku: '',
            name: '',
            attributes: {},
            price: 0,
            cost: formData.type === 'Stationery' ? (derivedCostPerPiece || 0) : 0,
            cost_price: formData.type === 'Stationery' ? (derivedCostPerPiece || 0) : 0,
            stock: 0,
            marginPercent: formData.type === 'Stationery' ? (formData.marginPercent || 0) : 0,
            pages: 1,
            pricingSource: 'static',
            inheritsParentBOM: false,
            manualOverride: false,
            selectedAdjustmentIds: formData.type === 'Stationery'
                ? [...(formData.pricingConfig?.selectedAdjustmentIds || [])]
                : [],
            selectedRoundingMethod: formData.type === 'Stationery'
                ? formData.pricingConfig?.selectedRoundingMethod
                : undefined,
            customRoundingStep: formData.type === 'Stationery'
                ? formData.pricingConfig?.customRoundingStep
                : undefined
        };

        if (formData.type === 'Stationery') {
            return recalculateStationeryVariantPrice(baseDraft, {});
        }

        return baseDraft;
    };

    useEffect(() => {
        if (formData.type !== 'Stationery' || !showVariantForm) return;

        setNewVariant(prev => {
            const updated = recalculateStationeryVariantPrice(prev, {});
            if (JSON.stringify(prev || {}) === JSON.stringify(updated || {})) {
                return prev;
            }
            return updated;
        });
    }, [
        formData.type,
        showVariantForm,
        formData.pricingConfig?.selectedAdjustmentIds,
        formData.pricingConfig?.selectedRoundingMethod,
        formData.pricingConfig?.customRoundingStep,
        globalMargin,
        stationeryAdjustmentOptions,
        activeMarketAdjustments
    ]);

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name?.trim()) {
            newErrors.name = 'Item name is required';
        }

        if (!formData.sku?.trim()) {
            newErrors.sku = 'SKU is required';
        }

        if (!formData.category?.trim()) {
            newErrors.category = 'Category is required';
        }

        if (!formData.type) {
            newErrors.type = 'Item type is required';
        }

        if (formData.price === undefined || formData.price < 0) {
            newErrors.price = 'Valid selling price is required';
        }

        if (formData.cost === undefined || formData.cost < 0) {
            newErrors.cost = 'Valid cost price is required';
        }

        if (hasStockFunctionality && (formData.stock === undefined || formData.stock < 0)) {
            newErrors.stock = 'Valid stock quantity is required';
        }

        if (!formData.unit?.trim()) {
            newErrors.unit = 'Unit of measure is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const effectiveStationeryPricing = formData.type === 'Stationery'
                ? stationeryAutoPricing
                : null;

            const normalizedPricingConfig = formData.pricingConfig
                ? {
                    ...formData.pricingConfig,
                    marketAdjustment: effectiveStationeryPricing
                        ? effectiveStationeryPricing.adjustmentTotal
                        : (Number(formData.pricingConfig.marketAdjustment) || 0),
                    totalCost: effectiveStationeryPricing
                        ? effectiveStationeryPricing.costPrice
                        : Number(formData.pricingConfig.totalCost) || formData.pricingConfig.totalCost,
                    finishingOptions: formData.pricingConfig.finishingOptions || [],
                    manualOverride:
                        formData.pricingConfig.manualOverride ??
                        (formData.type === 'Service' || formData.type === 'Raw Material' || formData.type === 'Material')
                }
                : undefined;

            // SmartPricing products: price is fully computed and stored in the snapshot.
            // Any non-price edit (name, SKU, category, etc.) must NOT re-run applyRoundingToPrice
            // because it can misinterpret the snapshot price as a new uncalculated value and
            // re-apply all market adjustment multipliers, producing prices in the millions.
            const isSmartPricingProduct = !!(formData as any).smartPricing?.roundedPrice;

            const roundedPricing = normalizedPricingConfig?.manualOverride
                ? {
                    calculatedPrice: Number(formData.price) || 0,
                    sellingPrice: Number(formData.price) || 0,
                    roundingDifference: 0,
                    roundingMethod: undefined as string | undefined
                }
                : effectiveStationeryPricing
                    ? {
                        calculatedPrice: effectiveStationeryPricing.calculatedPrice,
                        sellingPrice: effectiveStationeryPricing.sellingPrice,
                        roundingDifference: effectiveStationeryPricing.roundingDifference,
                        roundingMethod: effectiveStationeryPricing.roundingMethod
                    }
                : isSmartPricingProduct
                    ? {
                        // Use the snapshot values directly — price is already final
                        calculatedPrice: Number((formData as any).smartPricing?.originalPrice ?? (formData as any).smartPricing?.roundedPrice) || 0,
                        sellingPrice: Number((formData as any).smartPricing?.roundedPrice) || 0,
                        roundingDifference: Number((formData as any).smartPricing?.roundingDifference ?? 0) || 0,
                        roundingMethod: (formData as any).smartPricing?.roundingMethod as string | undefined
                    }
                : applyRoundingToPrice(resolveRoundingBasePrice(), item || undefined);

            const resolvedCost = formData.type === 'Stationery'
                ? roundMoney(effectiveStationeryPricing?.costPrice ?? derivedCostPerPiece ?? formData.cost ?? 0)
                : (Number(formData.cost) || 0);
            const resolvedMarginPercent = formData.type === 'Stationery'
                ? roundMoney(effectiveStationeryPricing?.marginPercent ?? formData.marginPercent ?? 0)
                : (Number(formData.marginPercent) || 0);

            const itemData: Item = {
                id: formData.id || generateId(),
                uuid: formData.uuid || generateId(),
                name: formData.name!.trim(),
                sku: formData.sku!.trim(),
                description: formData.description?.trim() || '',
                price: roundedPricing.sellingPrice,
                cost: resolvedCost,
                cost_price: resolvedCost,
                marginPercent: resolvedMarginPercent,
                calculated_price: roundedPricing.calculatedPrice,
                selling_price: roundedPricing.sellingPrice,
                rounding_difference: roundedPricing.roundingDifference,
                rounding_method: roundedPricing.roundingMethod,
                stock: hasStockFunctionality ? (Number(formData.stock) || 0) : 0,
                category: formData.category!.trim(),
                type: formData.type as Item['type'],
                unit: formData.unit!.trim(),
                minStockLevel: hasStockFunctionality ? (Number(formData.minStockLevel) || 0) : 0,
                preferredSupplierId: formData.preferredSupplierId || undefined,
                binLocation: formData.binLocation?.trim() || undefined,
                barcode: formData.barcode?.trim() || undefined,
                purchaseUnit: formData.purchaseUnit?.trim() || undefined,
                usageUnit: formData.usageUnit?.trim() || undefined,
                conversionRate: Number(formData.conversionRate) || 1,
                isLargeFormat: formData.isLargeFormat || false,
                rollWidth: Number(formData.rollWidth) || undefined,
                rollLength: Number(formData.rollLength) || undefined,
                pages: Number(formData.pages) || 1,
                leadTimeDays: Number(formData.leadTimeDays) || undefined,
                minOrderQty: hasStockFunctionality ? (Number(formData.minOrderQty) || undefined) : undefined,
                reorderPoint: hasStockFunctionality ? (Number(formData.reorderPoint) || undefined) : undefined,
                variants: formData.variants || [],
                isVariantParent: (formData.variants && formData.variants.length > 0) || formData.isVariantParent || false,
                locationStock: hasStockFunctionality ? (formData.locationStock || []) : [],
                reserved: hasStockFunctionality ? (formData.reserved || 0) : 0,
                adjustmentSnapshots: effectiveStationeryPricing?.adjustmentSnapshots || formData.adjustmentSnapshots || [],
                pricingConfig: normalizedPricingConfig,
                smartPricing: formData.smartPricing,
                sellingPricePerPiece: roundedPricing.sellingPrice,
                costPerPiece: resolvedCost,
                profitPerPiece: roundMoney(roundedPricing.sellingPrice - resolvedCost),
                markup_percent: resolvedMarginPercent,
                manual_override: Boolean(normalizedPricingConfig?.manualOverride)
            };

            // Ensure variants have correct saved prices
            if (itemData.variants && itemData.variants.length > 0) {
                itemData.variants = itemData.variants.map(v => {
                    if (formData.type === 'Stationery') {
                        return recalculateStationeryVariantPrice(v as ProductVariant, {}) as ProductVariant;
                    }

                    const snap = (v as any).smartPricingSnapshot;

                    // SmartPricing variants: price was already computed by the engine.
                    // Use the snapshot values directly â€” do NOT re-run applyRoundingToPrice
                    // because resolveVariantBasePrice may return 0 if calculated_price is missing.
                    if (snap && snap.roundedPrice > 0) {
                        return {
                            ...v,
                            // Preserve canonical fields: calculated_price is pre-rounding, price/selling_price store rounded value
                            calculated_price: snap.originalPrice ?? snap.roundedPrice,
                            price: snap.roundedPrice,
                            selling_price: snap.roundedPrice,
                            cost: snap.baseCost ?? v.cost,
                            cost_price: snap.baseCost ?? Number(v.cost_price ?? v.cost) ?? 0,
                            rounding_difference: snap.roundingDifference ?? 0,
                            rounding_method: snap.roundingMethod,
                            // Prefer the snapshot's recorded adjustment lines (they are the exact values used by the engine)
                            adjustmentSnapshots: v.adjustmentSnapshots || ((snap.marketAdjustments || []).map((a: any) => ({
                                name: a.name,
                                type: (a.type || 'PERCENTAGE') as any,
                                value: Number(a.rawValue ?? a.value ?? 0),
                                percentage: (String(a.type || '').toUpperCase() === 'PERCENT' || String(a.type || '').toUpperCase() === 'PERCENTAGE') ? Number(a.rawValue ?? a.value ?? 0) : undefined,
                                calculatedAmount: Number(a.value ?? 0)
                            }) as any)),
                            adjustmentTotal: snap.marketAdjustmentTotal ?? v.adjustmentTotal,
                            smartPricingSnapshot: snap
                        };
                    }

                    // Non-SmartPricing variants: apply rounding as before
                    const basePrice = resolveVariantBasePrice(v);
                    if (basePrice <= 0) {
                        // No valid price â€” preserve whatever is already stored
                        return {
                            ...v,
                            cost_price: Number(v.cost_price ?? v.cost) || 0,
                            adjustmentSnapshots: v.adjustmentSnapshots || getAdjustmentSnapshots(v.cost)
                        };
                    }
                    const variantRounding = applyRoundingToPrice(basePrice, v as any);
                    return {
                        ...v,
                        // calculated_price should be original, price/selling_price hold rounded
                        calculated_price: variantRounding.calculatedPrice,
                        price: variantRounding.sellingPrice,
                        adjustmentSnapshots: v.adjustmentSnapshots || getAdjustmentSnapshots(v.cost),
                        cost_price: Number(v.cost_price ?? v.cost) || 0,
                        selling_price: variantRounding.sellingPrice,
                        rounding_difference: variantRounding.roundingDifference,
                        rounding_method: variantRounding.roundingMethod
                    };
                });
            }

            if (mode === 'edit') {
                await onUpdate(itemData);
            } else {
                await onSave(itemData);
            }

            handleClose();
        } catch (error) {
            console.error('Error saving item:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setFormData(defaultItem);
        setErrors({});
        setShowVariantForm(false);
        setNewVariant(createNewVariantDraft());
        onClose();
    };

    const handleAddVariant = () => {
        if (!newVariant.name) {
            return;
        }

        const variantPages = Number(newVariant.pages) || 1;
        const isDynamic = newVariant.pricingSource === 'dynamic' || newVariant.inheritsParentBOM === true;
        const variantSku = newVariant.sku || generateAutoSKU(
            formData.type || 'ITEM',
            formData.name || newVariant.name || 'VAR',
            newVariant.attributes
        );
        
        let smartResult = null;
        if (isDynamic) {
            // Use SmartPricing engine if parent has a smartPricing snapshot AND variant is dynamic
            smartResult = calculateSmartVariantPrice(variantPages, 1);
        }

        const variant: ProductVariant = {
            id: newVariant.id || generateVariantId(),
            productId: formData.id || generateId(),
            uuid: generateId(),
            sku: variantSku,
            name: newVariant.name,
            attributes: newVariant.attributes || {},
            // For dynamic variants, store pre-rounded calculated_price and rounded selling price separately
            calculated_price: (isDynamic && smartResult) ? smartResult.originalPrice : (Number(newVariant.price) || 0),
            price: (isDynamic && smartResult) ? smartResult.roundedPrice : (Number(newVariant.price) || 0),
            selling_price: (isDynamic && smartResult) ? smartResult.roundedPrice : (Number(newVariant.price) || 0),
            cost: (isDynamic && smartResult) ? smartResult.baseCost : (Number(newVariant.cost) || 0),
            cost_price: (isDynamic && smartResult) ? smartResult.baseCost : (Number(newVariant.cost) || 0),
            rounding_difference: (isDynamic && smartResult) ? smartResult.roundingDifference : 0,
            rounding_method: (isDynamic && smartResult) ? smartResult.roundingMethod : undefined,
            stock: Number(newVariant.stock) || 0,
            pages: variantPages,
            
            // Use snapshot adjustments when available (smartResult)
            adjustmentSnapshots: (isDynamic && smartResult)
                ? (smartResult.marketAdjustments || []).map((a: any) => ({
                    name: a.name,
                    type: (a.type || 'PERCENTAGE') as any,
                    value: Number(a.rawValue ?? a.value ?? 0),
                    percentage: (String(a.type || '').toUpperCase() === 'PERCENT' || String(a.type || '').toUpperCase() === 'PERCENTAGE') ? Number(a.rawValue ?? a.value ?? 0) : undefined,
                    calculatedAmount: Number(a.value ?? 0)
                }))
                : getAdjustmentSnapshots((isDynamic && smartResult) ? smartResult.baseCost : (Number(newVariant.cost) || 0)),
            adjustmentTotal: (isDynamic && smartResult) ? (smartResult.marketAdjustmentTotal ?? 0) : undefined,
            pricingSource: newVariant.pricingSource || 'static',
            inheritsParentBOM: newVariant.inheritsParentBOM ?? false,
            manualOverride: Boolean((newVariant as any).manualOverride),
            selectedRoundingMethod: (newVariant as any).selectedRoundingMethod,
            customRoundingStep: (newVariant as any).customRoundingStep,
            ...(isDynamic && smartResult ? { smartPricingSnapshot: smartResult } : {})
        };
        const nextVariant = formData.type === 'Stationery'
            ? recalculateStationeryVariantPrice({
                ...variant,
                attributes: newVariant.attributes || {},
                marginAmount: (newVariant as any).marginAmount,
                selectedAdjustmentIds: (newVariant as any).selectedAdjustmentIds || formData.pricingConfig?.selectedAdjustmentIds || [],
                selectedRoundingMethod: (newVariant as any).selectedRoundingMethod || formData.pricingConfig?.selectedRoundingMethod,
                customRoundingStep: (newVariant as any).customRoundingStep ?? formData.pricingConfig?.customRoundingStep,
                manualOverride: Boolean((newVariant as any).manualOverride)
            }, {}) as ProductVariant
            : variant;

        setFormData(prev => ({
            ...prev,
            variants: [...(prev.variants || []), nextVariant],
            isVariantParent: true
        }));

        setNewVariant(createNewVariantDraft());
        setVariantPreview(null);
        setShowVariantForm(false);
    };

    const handleRemoveVariant = (variantId: string) => {
        setFormData(prev => {
            const newVariants = (prev.variants || []).filter(v => v.id !== variantId);
            return {
                ...prev,
                variants: newVariants,
                isVariantParent: newVariants.length > 0
            };
        });
    };

    const openVariantForm = () => {
        setNewVariant(createNewVariantDraft());
        setShowVariantForm(true);
        if (formData.smartPricing) {
            setVariantPreview(calculateSmartVariantPrice(1, 1));
        } else {
            setVariantPreview(null);
        }
    };

    const handleLocationStockChange = (warehouseId: string, quantity: number) => {
        setFormData(prev => {
            const currentLocations = prev.locationStock || [];
            const existingIndex = currentLocations.findIndex(l => l.warehouseId === warehouseId);

            if (existingIndex >= 0) {
                const updated = [...currentLocations];
                updated[existingIndex] = { warehouseId, quantity };
                return { ...prev, locationStock: updated };
            } else {
                return { ...prev, locationStock: [...currentLocations, { warehouseId, quantity }] };
            }
        });
    };

    const handleVariantPagesChange = async (variantId: string, newPages: number) => {
        // Find the variant to check pricing mode
        const variant = formData.variants?.find(v => v.id === variantId);

        // Guard against undefined variant - exit early if variant not found
        if (!variant) {
            console.warn(`Variant with id ${variantId} not found`);
            return;
        }

        // â”€â”€ Legacy BOM dynamic path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const hasHiddenBOM = formData.smartPricing?.hiddenBOMId || formData.smartPricing?.bomTemplateId;
        const useDynamicPricing = variant?.pricingSource === 'dynamic' ||
            variant?.inheritsParentBOM ||
            (hasHiddenBOM && variant?.pricingSource !== 'static');

        // â”€â”€ Smart Pricing path (preferred): parent was created via SmartPricing engine â”€â”€
        if (useDynamicPricing) {
            const smartResult = calculateSmartVariantPrice(newPages, 1);
            if (smartResult) {
                setFormData(prev => ({
                    ...prev,
                    variants: (prev.variants || []).map(v => v.id !== variantId ? v : {
                        ...v,
                        pages: newPages,
                        cost: smartResult.baseCost,
                        cost_price: smartResult.baseCost,
                        price: smartResult.roundedPrice,
                        selling_price: smartResult.roundedPrice,
                        calculated_price: smartResult.originalPrice,
                        rounding_difference: smartResult.roundingDifference,
                        rounding_method: smartResult.roundingMethod,
                        smartPricingSnapshot: smartResult,
                        adjustmentTotal: smartResult.marketAdjustmentTotal ?? v.adjustmentTotal,
                        adjustmentSnapshots: (smartResult.marketAdjustments || []).map((a: any) => ({
                            name: a.name,
                            type: (a.type || 'PERCENTAGE') as any,
                            value: Number(a.rawValue ?? a.value ?? 0),
                            percentage: (String(a.type || '').toUpperCase() === 'PERCENT' || String(a.type || '').toUpperCase() === 'PERCENTAGE') ? Number(a.rawValue ?? a.value ?? 0) : undefined,
                            calculatedAmount: Number(a.value ?? 0)
                        })),
                        calculatedAt: new Date().toISOString()
                    })
                }));
                return;
            }
        }

        if (useDynamicPricing && hasHiddenBOM) {
                try {
                    const result = pricingService.calculateVariantPrice(
                        formData as Item,
                        { ...variant, pages: newPages } as ProductVariant,
                        1,
                        inventory,
                        bomTemplates,
                        marketAdjustments
                    );
                // Ensure we persist both calculated_price (pre-rounding) and the rounded selling_price
                const rounding = applyRoundingToPrice(result.price, variant as any);
                setFormData(prev => ({
                    ...prev,
                    variants: (prev.variants || []).map(v => v.id !== variantId ? v : {
                        ...v,
                        pages: newPages,
                        cost: result.cost,
                        cost_price: result.cost,
                        calculated_price: rounding.calculatedPrice,
                        price: rounding.sellingPrice,
                        selling_price: rounding.sellingPrice,
                        adjustmentSnapshots: result.adjustmentSnapshots,
                        rounding_difference: rounding.roundingDifference,
                        rounding_method: rounding.roundingMethod,
                        calculatedAt: new Date().toISOString()
                    })
                }));
            } catch (error) {
                console.error('Error calculating variant price:', error);
                setFormData(prev => ({
                    ...prev,
                    variants: (prev.variants || []).map(v => v.id !== variantId ? v : { ...v, pages: newPages })
                }));
            }
        } else {
            // â”€â”€ Simple fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const specs = calculateItemFinancials(newPages, formData.pricingConfig, formData.type, variant.cost);
            let finalPrice = resolveVariantBasePrice(variant);
            let calculatedPrice = finalPrice;
            const baseVariantCost = specs
                ? Number((specs.paperCost || 0) + (specs.tonerCost || 0) + (specs.finishingCost || 0))
                : Number(variant.cost) || 0;
            let roundingDifference = Number(variant.rounding_difference) || 0;
            let roundingMethod = variant.rounding_method;
            if (specs) {
                const roundingResult = applyProductPriceRounding({
                    calculatedPrice: specs.total ?? 0,
                    companyConfig,
                    methodOverride: formData.pricingConfig?.selectedRoundingMethod,
                    customStepOverride: formData.pricingConfig?.customRoundingStep
                });
                finalPrice = roundingResult.roundedPrice;
                calculatedPrice = roundingResult.originalPrice;
                roundingDifference = roundingResult.roundingDifference;
                roundingMethod = roundingResult.methodUsed;
            }
            setFormData(prev => ({
                ...prev,
                variants: (prev.variants || []).map(v => v.id !== variantId ? v : {
                    ...v,
                    pages: newPages,
                    cost: baseVariantCost,
                    cost_price: baseVariantCost,
                    calculated_price: calculatedPrice,
                    price: finalPrice,
                    selling_price: finalPrice,
                    rounding_difference: roundingDifference,
                    rounding_method: roundingMethod,
                    adjustmentSnapshots: v.adjustmentSnapshots
                })
            }));
        }
    };

    const handleBulkGenerate = () => {
        // Implement bulk generation logic
        const variants = generateBulkVariants(
            Number(formData.price) || 0,
            Number(formData.cost) || 0,
            bulkAttributes.filter(a => a.values.length > 0)
        );

        const taggedVariants = variants.map(v => ({
            ...v,
            id: generateId(),
            sku: generateAutoSKU(formData.type || 'ITEM', formData.name || 'UNK', v.attributes),
            name: `${formData.name} - ${v.name}`,
            adjustmentSnapshots: getAdjustmentSnapshots(Number(v.cost) || 0),
            manualOverride: false,
            selectedAdjustmentIds: formData.type === 'Stationery'
                ? [...(formData.pricingConfig?.selectedAdjustmentIds || [])]
                : [],
            selectedRoundingMethod: formData.type === 'Stationery'
                ? formData.pricingConfig?.selectedRoundingMethod
                : undefined,
            customRoundingStep: formData.type === 'Stationery'
                ? formData.pricingConfig?.customRoundingStep
                : undefined,
            attributes: v.attributes || {}
        })).map(variant => (
            formData.type === 'Stationery'
                ? recalculateStationeryVariantPrice(variant as ProductVariant, {}) as ProductVariant
                : variant
        )) as ProductVariant[];

        setFormData(prev => ({
            ...prev,
            variants: [...(prev.variants || []), ...taggedVariants],
            isVariantParent: true
        }));

        setShowBulkGenerator(false);
    };

    const addBulkValue = (index: number) => {
        const val = bulkInputValue[index]?.trim();
        if (!val) return;

        setBulkAttributes(prev => {
            const updated = [...prev];
            if (!updated[index].values.includes(val)) {
                updated[index].values.push(val);
            }
            return updated;
        });

        setBulkInputValue(prev => ({ ...prev, [index]: '' }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Package className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className={styles.title}>
                                {mode === 'edit' ? 'Edit Item' : 'Add New Item'}
                            </h2>
                            <p className="text-xs text-slate-500">
                                {mode === 'edit' ? `Editing: ${item?.name}` : 'Create a new inventory item'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-[8px] hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    {mode === 'edit' ? 'Update Item' : 'Save Item'}
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Top Tab Bar */}
                <div className="flex items-center px-6 bg-slate-50 border-b border-slate-200 overflow-x-auto scrollbar-hide">
                    {([
                        { id: 'basic', label: 'Basic Info', icon: Tag },
                        { id: 'pricing', label: 'Pricing', icon: DollarSign },
                        { id: 'inventory', label: 'Inventory', icon: Box },
                        { id: 'variants', label: 'Variants', icon: Layers }
                    ] as { id: 'basic' | 'pricing' | 'inventory' | 'variants'; label: string; icon: any }[])
                        .filter(tab => tab.id !== 'inventory' || hasStockFunctionality)
                        .filter(tab => tab.id !== 'pricing' || formData.type === 'Product' || formData.type === 'Service' || formData.type === 'Stationery' || formData.type === 'Material')
                        .filter(tab => tab.id !== 'variants' || formData.type !== 'Material')
                        .map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id
                                ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                                : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100/50'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto">
                        <form onSubmit={handleSubmit} className="p-6">
                             {/* Basic Info Tab */}
                             {activeTab === 'basic' && (
                                 <div className="space-y-6">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                         {/* Name */}
                                         <div className="flex items-center gap-2">
                                             <label htmlFor="itemName" className={styles.label}>Item name</label>
                                             <input
                                                 type="text"
                                                 id="itemName"
                                                 value={formData.name || ''}
                                                 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                 className={`${styles.input} ${errors.name ? 'border-red-300 bg-red-50' : ''}`}
                                                 placeholder="e.g. Glossy Photo Paper"
                                             />
                                         </div>
                                         {errors.name && (
                                             <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                 <AlertCircle className="w-3 h-3" /> {errors.name}
                                             </p>
                                         )}

                                         {/* SKU */}
                                         <div className="flex items-center gap-2">
                                             <label htmlFor="itemSKU" className={styles.label}>SKU/code</label>
                                             <div className="flex gap-2 flex-1">
                                                 <input
                                                     type="text"
                                                     id="itemSKU"
                                                     value={formData.sku || ''}
                                                     onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                     className={`${styles.input} ${errors.sku ? 'border-red-300 bg-red-50' : ''}`}
                                                     placeholder="e.g. SKU-GPP-001"
                                                 />
                                                 <button
                                                     type="button"
                                                     onClick={() => {
                                                         const sku = generateAutoSKU(formData.type || 'ITEM', formData.name || 'UNK');
                                                         setFormData({ ...formData, sku });
                                                     }}
                                                     className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                                                     title="Auto-Generate SKU"
                                                 >
                                                     <Wand2 className="w-5 h-5" />
                                                 </button>
                                             </div>
                                         </div>
                                         {errors.sku && (
                                             <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                 <AlertCircle className="w-3 h-3" /> {errors.sku}
                                             </p>
                                         )}

                                         {/* Category */}
                                         <div className="flex items-center gap-2">
                                             <label htmlFor="itemCategory" className={styles.label}>Category</label>
                                             <input
                                                 type="text"
                                                 id="itemCategory"
                                                 value={formData.category || ''}
                                                 onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                 className={`${styles.input} ${errors.category ? 'border-red-300 bg-red-50' : ''}`}
                                                 placeholder="e.g. Office Supplies"
                                                 list="categories"
                                             />
                                         </div>
                                         {errors.category && (
                                             <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                 <AlertCircle className="w-3 h-3" /> {errors.category}
                                             </p>
                                         )}

                                         {/* Type */}
                                         <div className="flex items-center gap-2">
                                             <label htmlFor="itemType" className={styles.label}>Item type</label>
                                            <select
                                                id="itemType"
                                                value={formData.type || 'Product'}
                                                onChange={(e) => {
                                                    const nextType = e.target.value as Item['type'];
                                                    const nextSupportsStock = isStockTrackedItemType(nextType);
                                                    
                                                    // Preserve price when converting Product to Service (for products without variants)
                                                    const isConvertingToService = nextType === 'Service' && formData.type === 'Product';
                                                    const hasNoVariants = !formData.variants || formData.variants.length === 0;
                                                    // Check if product has BOM (Bill of Materials)
                                                    const hasBOM = Boolean(formData.bomTemplateId || (formData.smartPricing && formData.smartPricing.bomTemplateId));
                                                    
                                                    // FIX: Always preserve price, BOM, and details when converting Product to Service
                                                    if (isConvertingToService) {
                                                        // Preserve current price, cost, BOM and all details by enabling manual override
                                                        // FIX: Reset conversionRate to 1 to prevent price multiplication bug
                                                        // If product has BOM, make it a customizable service
                                                        setFormData({
                                                            ...formData,
                                                            type: nextType,
                                                            price: formData.price,
                                                            selling_price: formData.selling_price,
                                                            cost: formData.cost,
                                                            cost_price: formData.cost_price,
                                                            conversionRate: 1, // FIX: Reset to prevent price * conversionRate multiplication
                                                            ...(hasBOM ? {
                                                                // Product has BOM - make it a customizable service
                                                                bomTemplateId: formData.bomTemplateId,
                                                                smartPricing: {
                                                                    ...formData.smartPricing,
                                                                    bomTemplateId: formData.smartPricing?.bomTemplateId || formData.bomTemplateId,
                                                                    isCustomizableService: true
                                                                }
                                                            } : {}),
                                                            pricingConfig: {
                                                                ...formData.pricingConfig,
                                                                manualOverride: true
                                                            },
                                                            ...(nextSupportsStock ? {} : {
                                                                stock: 0,
                                                                reserved: 0,
                                                                minStockLevel: 0,
                                                                reorderPoint: 0,
                                                                locationStock: []
                                                            })
                                                        });
                                                    } else {
                                                        setFormData({
                                                            ...formData,
                                                            type: nextType,
                                                            ...(nextSupportsStock ? {} : {
                                                                stock: 0,
                                                                reserved: 0,
                                                                minStockLevel: 0,
                                                                reorderPoint: 0,
                                                                locationStock: []
                                                            })
                                                        });
                                                    }
                                                }}
                                                className={`${styles.select} ${errors.type ? 'border-red-300 bg-red-50' : ''}`}
                                            >
                                                 <option value="Product">Product</option>
                                                 <option value="Material">Material</option>
                                                 <option value="Service">Service</option>
                                                 <option value="Stationery">Stationery</option>
                                             </select>
                                         </div>
                                         {errors.type && (
                                             <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                 <AlertCircle className="w-3 h-3" /> {errors.type}
                                             </p>
                                         )}

                                         {/* Unit */}
                                         <div className="flex items-center gap-2">
                                             <label htmlFor="itemUnit" className={styles.label}>Unit of sale</label>
                                             <select
                                                 id="itemUnit"
                                                 value={formData.unit || 'pcs'}
                                                 onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                                 className={styles.select}
                                             >
                                                 {getUnitOptions().map(option => (
                                                     <option key={option} value={option}>{option}</option>
                                                 ))}
                                             </select>
                                         </div>
                                         {errors.unit && (
                                             <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                 <AlertCircle className="w-3 h-3" /> {errors.unit}
                                             </p>
                                         )}
                                     </div>

                                     {/* Description */}
                                     <div>
                                         <label htmlFor="itemDescription" className={styles.label}>Description</label>
                                         <textarea
                                             id="itemDescription"
                                             value={formData.description || ''}
                                             onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                             className={styles.textarea}
                                             rows={3}
                                             placeholder="e.g. High-quality paper for professional photography"
                                         />
                                     </div>

                                      {/* Product-specific sections removed: Print specifications eliminated per request */}

                                     

                                     {/* Large Format Toggle */}
                                     <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                         <input
                                             type="checkbox"
                                             id="isLargeFormat"
                                             checked={formData.isLargeFormat || false}
                                             onChange={(e) => setFormData({ ...formData, isLargeFormat: e.target.checked })}
                                             className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                         />
                                         <label htmlFor="isLargeFormat" className="text-sm font-medium text-slate-700">
                                             Large Format Item (Rolls/Bulk)
                                         </label>
                                     </div>

                                     {formData.isLargeFormat && (
                                         <div className="grid grid-cols-2 gap-4 pl-4 border-l-4 border-indigo-200">
                                             <div>
                                                 <label htmlFor="rollWidth" className={styles.label}>Roll Width (cm)</label>
                                                 <input
                                                     type="number"
                                                     id="rollWidth"
                                                     value={formData.rollWidth || ''}
                                                     onChange={(e) => setFormData({ ...formData, rollWidth: Number(e.target.value) })}
                                                     className={styles.input}
                                                     placeholder="e.g. 61"
                                                 />
                                             </div>
                                             <div>
                                                 <label htmlFor="rollLength" className={styles.label}>Roll Length (m)</label>
                                                 <input
                                                     type="number"
                                                     id="rollLength"
                                                     value={formData.rollLength || ''}
                                                     onChange={(e) => setFormData({ ...formData, rollLength: Number(e.target.value) })}
                                                     className={styles.input}
                                                     placeholder="e.g. 30"
                                                 />
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             )}

{/* Pricing Tab - Premium Design */}
                              {activeTab === 'pricing' && (
                                  <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                                      {(formData.type === 'Product' || formData.type === 'Service') && (
                                          <>
                                              {/* Premium Header Card */}
                                              <div className={styles.premiumCard + " bg-gradient-to-br from-blue-50 via-white to-indigo-50 border-blue-100/50"}>
                                                  <div className="flex items-center justify-between mb-6">
                                                      <div className="flex items-center gap-4">
                                                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                                                              <DollarSign className="w-6 h-6 text-white" />
                                                          </div>
                                                          <div>
                                                              <h3 className="text-lg font-bold text-slate-900">Smart Pricing Engine</h3>
                                                              <p className="text-xs text-slate-500">Dynamic cost & margin calculation</p>
                                                          </div>
                                                      </div>
                                                      <div className="text-right">
                                                       <div className="text-2xl font-bold text-blue-600">{currency}{displayedProductPrice.toFixed(2)}</div>
                                                          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Selling Price</div>
                                                      </div>
                                                  </div>
                                              </div>

                                              <div className="flex justify-end">
                                                  <button
                                                      type="button"
                                                      onClick={() => setShowManualOverrideCard(prev => !prev)}
                                                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${showManualOverrideCard ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                                  >
                                                      {showManualOverrideCard ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                      {showManualOverrideCard ? 'Hide Manual Override Pricing' : 'Manual Override Pricing'}
                                                  </button>
                                              </div>

                                              {showManualOverrideCard && (
                                              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 shadow-sm">
                                                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                      <div className="space-y-1.5">
                                                          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Manual Override Pricing</div>
                                                          <div className="text-xs text-slate-700">
                                                              Auto Price: <span className="font-semibold">{currency}{automaticProductPricing.price.toFixed(2)}</span>
                                                              <span className="mx-2 text-slate-400">|</span>
                                                              Final Price: <span className="font-semibold">{currency}{displayedProductPrice.toFixed(2)}</span>
                                                              <span className="mx-2 text-slate-400">|</span>
                                                              Difference: <span className={`font-semibold ${displayedProductPrice >= automaticProductPricing.price ? 'text-emerald-600' : 'text-rose-600'}`}>{displayedProductPrice >= automaticProductPricing.price ? '+' : '-'}{currency}{Math.abs(displayedProductPrice - automaticProductPricing.price).toFixed(2)}</span>
                                                          </div>
                                                          <div className={`text-[10px] font-bold uppercase tracking-wider ${isItemManualOverride ? 'text-amber-700' : 'text-slate-500'}`}>
                                                              {isItemManualOverride ? 'Status: Manual Override Active' : 'Status: Auto Pricing'}
                                                          </div>
                                                      </div>
                                                      <div className="flex flex-col sm:flex-row gap-2">
                                                          <div className="relative">
                                                              <input
                                                                  type="number"
                                                                  min="0"
                                                                  step="0.01"
                                                                  value={displayedProductPrice}
                                                                  onChange={(e) => handleManualProductPriceChange(Number(e.target.value))}
                                                                  className="w-full sm:w-40 px-3 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-100"
                                                              />
                                                              <div className="absolute left-3 top-1.5 text-[10px] uppercase tracking-wider text-slate-400">Override Price</div>
                                                          </div>
                                                          {!isItemManualOverride ? (
                                                              <button
                                                                  type="button"
                                                                  onClick={() => toggleProductManualOverride(true)}
                                                                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                                                              >
                                                                  <Edit3 className="w-3.5 h-3.5" />
                                                                  Activate Override
                                                              </button>
                                                          ) : (
                                                              <button
                                                                  type="button"
                                                                  onClick={() => toggleProductManualOverride(false)}
                                                                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100"
                                                              >
                                                                  <RefreshCw className="w-3.5 h-3.5" />
                                                                  Return to Auto
                                                              </button>
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                              )}

                                              {/* Cost Breakdown Metrics */}
                                              <div className={styles.premiumCard}>
                                                  <h3 className={styles.premiumSectionTitle}>
                                                      <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                                                      Cost Breakdown
                                                  </h3>
                                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                      <div className={styles.glassMetric}>
                                                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Paper Cost</div>
                                                          <div className="text-lg font-bold text-slate-800">
                                                              {currency}{(formData.smartPricing?.paperCost ?? bomCosts.paper).toFixed(2)}
                                                          </div>
                                                          <div className="text-[9px] text-slate-400 mt-1">
                                                              {formData.smartPricing?.paperItemId
                                                                  ? materials.find(m => m.id === formData.smartPricing?.paperItemId)?.name?.slice(0, 20) || 'Paper'
                                                                  : formData.pricingConfig?.paperId
                                                                  ? materials.find(m => m.id === formData.pricingConfig?.paperId)?.name?.slice(0, 20) || 'Unknown'
                                                                  : 'Not selected'}
                                                          </div>
                                                      </div>
                                                      <div className={styles.glassMetric}>
                                                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Toner Cost</div>
                                                          <div className="text-lg font-bold text-slate-800">
                                                              {currency}{(formData.smartPricing?.tonerCost ?? bomCosts.toner).toFixed(2)}
                                                          </div>
                                                          <div className="text-[9px] text-slate-400 mt-1">
                                                              {formData.smartPricing?.tonerItemId
                                                                  ? materials.find(m => m.id === formData.smartPricing?.tonerItemId)?.name?.slice(0, 20) || 'Toner'
                                                                  : formData.pricingConfig?.tonerId
                                                                  ? materials.find(m => m.id === formData.pricingConfig?.tonerId)?.name?.slice(0, 20) || 'Unknown'
                                                                  : 'Not selected'}
                                                          </div>
                                                      </div>
                                                      <div className={styles.glassMetric}>
                                                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Finishing</div>
                                                          <div className="text-lg font-bold text-slate-800">
                                                              {currency}{(formData.smartPricing?.finishingCost ?? bomCosts.finishing).toFixed(2)}
                                                          </div>
                                                          <div className="text-[9px] text-slate-400 mt-1">
                                                              {(formData.smartPricing?.finishingEnabled?.length || 0) > 0 
                                                                  ? formData.smartPricing?.finishingEnabled?.join(', ')?.slice(0, 20) 
                                                                  : formData.pricingConfig?.finishingOptions?.length > 0
                                                                  ? formData.pricingConfig?.finishingOptions?.map(o => o.name).join(', ')?.slice(0, 20)
                                                                  : 'None'}
                                                          </div>
                                                      </div>
                                                  </div>
                                              </div>

                                              {/* Market Adjustments */}
                                              <div className={styles.premiumCard}>
                                                  <h3 className={styles.premiumSectionTitle}>
                                                      <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                                                      Market Adjustments
                                                  </h3>
                                                  <div className="space-y-2">
                                                      {formData.smartPricing?.marketAdjustments?.length > 0 ? (
                                                          formData.smartPricing.marketAdjustments.map((adj: any) => (
                                                              <div key={adj.id} className={styles.row + " rounded-lg bg-slate-50 px-4"}>
                                                                  <div className="flex items-center gap-3">
                                                                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                                      <div className="flex-1">
                                                                          <div className="text-sm font-medium text-slate-700">{adj.name}</div>
                                                                          <div className="text-[10px] text-slate-400">
                                                                              {adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' 
                                                                                  ? `${adj.rawValue}% applied` 
                                                                                  : `K${adj.rawValue} Ã— pages Ã— copies`}
                                                                          </div>
                                                                      </div>
                                                                  </div>
                                                                  <div className={styles.priceTag + " bg-emerald-50 text-emerald-700 border border-emerald-200"}>
                                                                      +{currency}{(adj.value || 0).toFixed(2)}
                                                                  </div>
                                                              </div>
                                                          ))
                                                      ) : (
                                                          activeMarketAdjustments.slice(0, 4).map(adj => {
                                                              const isSelected = formData.pricingConfig?.selectedAdjustmentIds?.includes(adj.id) || false;
                                                              return (
                                                                  <div key={adj.id} className={styles.row + " rounded-lg " + (isSelected ? "bg-slate-50" : "")}>
                                                                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                                                                          <input
                                                                              type="checkbox"
                                                                              checked={isSelected}
                                                                              onChange={() => handleToggleAdjustment(adj.id)}
                                                                              className="sr-only peer"
                                                                              disabled={isSubmitting}
                                                                          />
                                                                          <div className={`w-10 h-5 rounded-full transition-colors ${isSelected ? 'bg-blue-600' : 'bg-slate-200'} flex items-center ${isSelected ? 'justify-end' : 'justify-start'} px-0.5`}>
                                                                              <div className="w-4 h-4 bg-white rounded-full shadow"></div>
                                                                          </div>
                                                                          <div>
                                                                              <div className="text-sm font-medium text-slate-700">{adj.name}</div>
                                                                              <div className="text-[10px] text-slate-400">
                                                                                  {adj.type === 'PERCENTAGE' ? `${adj.value}%` : `${currency}${adj.value}`}
                                                                              </div>
                                                                          </div>
                                                                      </label>
                                                                      {isSelected && (
                                                                          <div className={styles.priceTag + " bg-emerald-50 text-emerald-700 border border-emerald-200"}>
                                                                              +{currency}{adj.type === 'PERCENTAGE' 
                                                                                  ? ((enginePreview?.cost || 0) * adj.value / 100).toFixed(2)
                                                                                  : adj.value.toFixed(2)}
                                                                          </div>
                                                                      )}
                                                                  </div>
                                                              );
                                                          })
                                                      )}
                                                  </div>
                                              </div>

                                              {/* Price Summary - Premium */}
                                              <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 shadow-xl">
                                                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
                                                  <h3 className="text-[13px] font-semibold text-slate-300 mb-6 flex items-center gap-2">
                                                      <span className="w-1.5 h-4 bg-blue-400 rounded-full"></span>
                                                      Price Summary
                                                  </h3>
                                                  
                                                  {formData.smartPricing ? (
                                                      <div className="space-y-3 relative">
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-slate-400">Paper</span>
                                                              <span className="text-slate-200 font-medium">{currency}{(formData.smartPricing.paperCost || 0).toFixed(2)}</span>
                                                          </div>
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-slate-400">Toner</span>
                                                              <span className="text-slate-200 font-medium">{currency}{(formData.smartPricing.tonerCost || 0).toFixed(2)}</span>
                                                          </div>
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-slate-400">Finishing</span>
                                                              <span className="text-slate-200 font-medium">{currency}{(formData.smartPricing.finishingCost || 0).toFixed(2)}</span>
                                                          </div>
                                                           {(formData.smartPricing.marketAdjustments || []).map((adj: any, idx: number) => 
                                                               adj.value > 0 ? (
                                                                   <div key={idx} className="flex justify-between text-sm">
                                                                       <span className="text-emerald-400">{adj.name}{adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' ? ` (${adj.rawValue}%)` : ''}</span>
                                                                       <span className="text-emerald-400 font-medium">+{currency}{(adj.value || 0).toFixed(2)}</span>
                                                                   </div>
                                                               ) : null
                                                           )}
                                                          {(formData.smartPricing.profitMarginAmount ?? 0) > 0 && (
                                                              <div className="flex justify-between text-sm">
                                                                  <span className="text-green-400">Profit Margin</span>
                                                                  <span className="text-green-400 font-medium">+{currency}{(formData.smartPricing.profitMarginAmount || 0).toFixed(2)}</span>
                                                              </div>
                                                          )}
                                                           {formData.smartPricing.wasRounded && (
                                                               <div className="flex justify-between text-sm">
                                                                   <span className="text-purple-400">
                                                                       {(() => {
                                                                           const method = formData.smartPricing.roundingMethod || 'ALWAYS_UP_50';
                                                                           if (method.startsWith('ALWAYS_UP_')) {
                                                                               const step = method.replace('ALWAYS_UP_', '');
                                                                               return `(up ${step})`;
                                                                           } else if (method.startsWith('NEAREST_')) {
                                                                               const step = method.replace('NEAREST_', '');
                                                                               return `(nearest ${step})`;
                                                                           } else if (method === 'PSYCHOLOGICAL') {
                                                                               return '(psychological)';
                                                                           }
                                                                           return '(rounded)';
                                                                       })()}
                                                                   </span>
                                                                   <span className="text-purple-400 font-medium">
                                                                       {((formData.smartPricing.roundingDifference || 0) >= 0 ? '+' : '-')}
                                                                       {currency}{Math.abs(formData.smartPricing.roundingDifference || 0).toFixed(2)}
                                                                   </span>
                                                               </div>
                                                           )}
                                                          <div className={styles.premiumDivider + " my-4 bg-slate-600"}></div>
                                                          <div className="flex justify-between items-center">
                                                              <span className="text-slate-300 font-semibold">Final Price</span>
                                                              <span className="text-2xl font-bold text-white">
                                                                  {currency}{displayedProductPrice.toFixed(2)}
                                                              </span>
                                                          </div>
                                                          <div className="text-[10px] text-slate-500 text-right mt-1">
                                                              Per copy: {currency}{(displayedProductPrice / (formData.smartPricing.copies || 1)).toFixed(2)}
                                                          </div>
                                                      </div>
                                                  ) : (
                                                      <div className="space-y-3 relative">
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-slate-400">Cost Base</span>
                                                              <span className="text-slate-200 font-medium">{currency}{enginePreview?.cost?.toFixed(2) || '0.00'}</span>
                                                          </div>
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-emerald-400">Adjustments</span>
                                                              <span className="text-emerald-400 font-medium">+{currency}{(enginePreview?.adjustmentTotal - enginePreview?.marginAmount)?.toFixed(2) || '0.00'}</span>
                                                          </div>
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-green-400">Profit Margin</span>
                                                              <span className="text-green-400 font-medium">+{currency}{enginePreview?.marginAmount?.toFixed(2) || '0.00'}</span>
                                                          </div>
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-purple-400">Rounding</span>
                                                              <span className="text-purple-400 font-medium">
                                                                  {((enginePreview?.unitPrice || 0) - (enginePreview?.cost || 0) - (enginePreview?.adjustmentTotal || 0) - (enginePreview?.marginAmount || 0) >= 0 ? '+' : '-')}
                                                                  {currency}{Math.abs(((enginePreview?.unitPrice || 0) - (enginePreview?.cost || 0) - (enginePreview?.adjustmentTotal || 0) - (enginePreview?.marginAmount || 0))).toFixed(2)}
                                                              </span>
                                                          </div>
                                                          <div className={styles.premiumDivider + " my-4 bg-slate-600"}></div>
                                                          <div className="flex justify-between items-center">
                                                              <span className="text-slate-300 font-semibold">Selling Price</span>
                                                              <span className="text-2xl font-bold text-white">
                                                                  {currency}{enginePreview?.unitPrice?.toFixed(2) || '0.00'}
                                                              </span>
                                                          </div>
                                                      </div>
                                                  )}
                                              </div>
                                          </>
                                      )}

                                      {formData.type === 'Material' && (
                                          <div className="space-y-6">
                                              <div className={styles.premiumCard + " bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-emerald-100/50"}>
                                                  <div className="flex items-center gap-4 mb-6">
                                                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                                          <DollarSign className="w-6 h-6 text-white" />
                                                      </div>
                                                      <div>
                                                          <h3 className="text-lg font-bold text-slate-900">Material Pricing</h3>
                                                          <p className="text-xs text-slate-500">Manual cost and unit configuration</p>
                                                      </div>
                                                  </div>

                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                      <div>
                                                          <label className={styles.label}>Cost Price ({currency})</label>
                                                          <div className="relative">
                                                              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{currency}</div>
                                                              <input
                                                                  type="number"
                                                                  step="0.01"
                                                                  value={formData.cost || 0}
                                                                  onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value), cost_price: Number(e.target.value) })}
                                                                  className={styles.input + " pl-10"}
                                                                  placeholder="0.00"
                                                              />
                                                          </div>
                                                          <p className="mt-2 text-[10px] text-slate-500 italic">Enter the base purchase cost for this material.</p>
                                                      </div>
                                                  </div>
                                              </div>

                                              <div className={styles.premiumCard}>
                                                  <div className="flex items-center gap-2 mb-6">
                                                      <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                                                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Unit Conversion</h3>
                                                  </div>
                                                  
                                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                      <div>
                                                          <label className={styles.label}>Purchase Unit</label>
                                                          <select
                                                              value={formData.purchaseUnit || ''}
                                                              onChange={(e) => setFormData({ ...formData, purchaseUnit: e.target.value })}
                                                              className={styles.select}
                                                          >
                                                              <option value="">Select Unit</option>
                                                              {['Box', 'Pack', 'Roll', 'Ream', 'Kilogram', 'Liter', 'Pallet', 'Case', 'Set'].map(u => (
                                                                  <option key={u} value={u}>{u}</option>
                                                              ))}
                                                          </select>
                                                          <p className="mt-1.5 text-[10px] text-slate-400">Unit used when buying from suppliers</p>
                                                      </div>

                                                      <div>
                                                          <label className={styles.label}>Usage Unit</label>
                                                          <select
                                                              value={formData.usageUnit || ''}
                                                              onChange={(e) => setFormData({ ...formData, usageUnit: e.target.value })}
                                                              className={styles.select}
                                                          >
                                                              <option value="">Select Unit</option>
                                                              {['Sheet', 'Piece', 'Gram', 'Milliliter', 'Meter', 'Unit', 'Copy'].map(u => (
                                                                  <option key={u} value={u}>{u}</option>
                                                              ))}
                                                          </select>
                                                          <p className="mt-1.5 text-[10px] text-slate-400">Unit used for consumption/production</p>
                                                      </div>

                                                      <div>
                                                          <label className={styles.label}>Conversion Rate</label>
                                                          <div className="relative">
                                                              <input
                                                                  type="number"
                                                                  min="1"
                                                                  value={formData.conversionRate || 1}
                                                                  onChange={(e) => setFormData({ ...formData, conversionRate: Number(e.target.value) })}
                                                                  className={styles.input}
                                                                  placeholder="e.g. 500"
                                                              />
                                                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                                                  {formData.usageUnit || 'Units'} / {formData.purchaseUnit || 'Bulk'}
                                                              </div>
                                                          </div>
                                                          <p className="mt-1.5 text-[10px] text-slate-400">How many usage units in one purchase unit</p>
                                                      </div>
                                                  </div>

                                                  <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                                      <div className="flex items-center gap-3">
                                                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100">
                                                              <Scale className="w-5 h-5 text-emerald-600" />
                                                          </div>
                                                          <div>
                                                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Effective Cost Per {formData.usageUnit || 'Unit'}</div>
                                                              <div className="text-sm font-bold text-slate-800">
                                                                  {currency}{((formData.cost || 0) / (formData.conversionRate || 1)).toFixed(4)}
                                                              </div>
                                                          </div>
                                                      </div>
                                                      <ArrowRight className="w-4 h-4 text-slate-300" />
                                                      <div className="text-right">
                                                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Purchase Config</div>
                                                          <div className="text-sm font-medium text-slate-600">
                                                              1 {formData.purchaseUnit || 'Bulk'} = {formData.conversionRate || 1} {formData.usageUnit || 'Units'}
                                                          </div>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      )}



                                          {formData.type === 'Stationery' && (
                                              <>
                                                  {/* Stationery Pricing Header */}
                                                  <div className={styles.premiumCard + " bg-gradient-to-br from-amber-50 via-white to-orange-50 border-amber-100/50"}>
                                                      <div className="flex items-center justify-between mb-6">
                                                          <div className="flex items-center gap-4">
                                                              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/25">
                                                                  <DollarSign className="w-6 h-6 text-white" />
                                                              </div>
                                                              <div>
                                                                  <h3 className="text-lg font-bold text-slate-900">Stationery Pricing Engine</h3>
                                                                  <p className="text-xs text-slate-500">Inventory-based retail pricing</p>
                                                              </div>
                                                          </div>
                                                          <div className="text-right">
                                                              <div className="text-2xl font-bold text-amber-600">{currency}{displayedStationeryUnitPrice.toFixed(2)}</div>
                                                              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Selling Price</div>
                                                          </div>
                                                      </div>
                                                  </div>

                                                  <div className="flex justify-end">
                                                      <button
                                                          type="button"
                                                          onClick={() => setShowManualOverrideCard(prev => !prev)}
                                                          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${showManualOverrideCard ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                                      >
                                                          {showManualOverrideCard ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                          {showManualOverrideCard ? 'Hide Manual Override Pricing' : 'Manual Override Pricing'}
                                                      </button>
                                                  </div>

                                                  {showManualOverrideCard && (
                                                      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 shadow-sm">
                                                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                              <div className="space-y-1.5">
                                                                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Manual Override Pricing</div>
                                                                  <div className="text-xs text-slate-700">
                                                                      Auto Price: <span className="font-semibold">{currency}{stationeryAutoPricing.sellingPrice.toFixed(2)}</span>
                                                                      <span className="mx-2 text-slate-400">|</span>
                                                                      Final Price: <span className="font-semibold">{currency}{displayedStationeryUnitPrice.toFixed(2)}</span>
                                                                      <span className="mx-2 text-slate-400">|</span>
                                                                      Difference: <span className={`font-semibold ${displayedStationeryUnitPrice >= stationeryAutoPricing.sellingPrice ? 'text-emerald-600' : 'text-rose-600'}`}>{displayedStationeryUnitPrice >= stationeryAutoPricing.sellingPrice ? '+' : '-'}{currency}{Math.abs(displayedStationeryUnitPrice - stationeryAutoPricing.sellingPrice).toFixed(2)}</span>
                                                                  </div>
                                                                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isItemManualOverride ? 'text-amber-700' : 'text-slate-500'}`}>
                                                                      {isItemManualOverride ? 'Status: Manual Override Active' : 'Status: Auto Pricing'}
                                                                  </div>
                                                              </div>
                                                              <div className="flex flex-col sm:flex-row gap-2">
                                                                  <div className="relative">
                                                                      <input
                                                                          type="number"
                                                                          min="0"
                                                                          step="0.01"
                                                                          value={displayedStationeryUnitPrice}
                                                                          onChange={(e) => handleManualStationeryPriceChange(Number(e.target.value))}
                                                                          className="w-full sm:w-40 px-3 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-100"
                                                                      />
                                                                      <div className="absolute left-3 top-1.5 text-[10px] uppercase tracking-wider text-slate-400">Override Price</div>
                                                                  </div>
                                                                  {!isItemManualOverride ? (
                                                                      <button
                                                                          type="button"
                                                                          onClick={() => toggleStationeryManualOverride(true)}
                                                                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                                                                      >
                                                                          <Edit3 className="w-3.5 h-3.5" />
                                                                          Activate Override
                                                                      </button>
                                                                  ) : (
                                                                      <button
                                                                          type="button"
                                                                          onClick={() => toggleStationeryManualOverride(false)}
                                                                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100"
                                                                      >
                                                                          <RefreshCw className="w-3.5 h-3.5" />
                                                                          Return to Auto
                                                                      </button>
                                                                  )}
                                                              </div>
                                                          </div>
                                                      </div>
                                                  )}

                                                  {/* Costing Model */}
                                                  <div className={styles.premiumCard}>
                                                      <h3 className={styles.premiumSectionTitle}>
                                                          <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                                                          Costing Model
                                                      </h3>
                                                      {formData.isStationeryPack ? (
                                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                              <div>
                                                                  <label className={styles.label}>Cost Per Pack</label>
                                                                  <input
                                                                      type="number"
                                                                      value={formData.costPerPack || 0}
                                                                      onChange={(e) => setFormData({ ...formData, costPerPack: Number(e.target.value) })}
                                                                      className={styles.input}
                                                                      step="0.01"
                                                                      min="0"
                                                                  />
                                                              </div>
                                                              <div>
                                                                  <label className={styles.label}>Units per Pack</label>
                                                                  <input
                                                                      type="number"
                                                                      value={formData.unitsPerPack || 1}
                                                                      onChange={(e) => setFormData({ ...formData, unitsPerPack: Number(e.target.value) })}
                                                                      className={styles.input}
                                                                      min="1"
                                                                  />
                                                              </div>
                                                              <div>
                                                                  <label className={styles.label}>Global Margin</label>
                                                                  <div className={styles.input + " bg-slate-100 text-slate-500 cursor-not-allowed flex justify-between items-center"}>
                                                                      <span>{stationeryAutoPricing.marginLabel}</span>
                                                                      <Info className="w-3.5 h-3.5 text-slate-400" />
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                              <div>
                                                                  <label className={styles.label}>Cost Price (CP) / Unit</label>
                                                                  <input
                                                                      type="number"
                                                                      value={formData.cost || 0}
                                                                      onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value) })}
                                                                      className={styles.input}
                                                                      step="0.01"
                                                                      min="0"
                                                                  />
                                                              </div>
                                                              <div>
                                                                  <label className={styles.label}>Global Margin</label>
                                                                  <div className={styles.input + " bg-slate-100 text-slate-500 cursor-not-allowed flex justify-between items-center"}>
                                                                      <span>{stationeryAutoPricing.marginLabel}</span>
                                                                      <Info className="w-3.5 h-3.5 text-slate-400" />
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      )}

                                                      <div className={`grid grid-cols-1 ${((formData.pricingConfig?.selectedRoundingMethod || companyDefaultRoundingMethod) === 'ALWAYS_UP_CUSTOM') ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mt-4`}>
                                                          <div>
                                                              <label className={styles.label}>Rounding Rule</label>
                                                              <select
                                                                  value={formData.pricingConfig?.selectedRoundingMethod || '__DEFAULT__'}
                                                                  onChange={(e) => patchPricingConfig({
                                                                      selectedRoundingMethod: e.target.value === '__DEFAULT__'
                                                                          ? undefined
                                                                          : e.target.value as PricingRoundingMethod
                                                                  })}
                                                                  className={styles.select}
                                                              >
                                                                  <option value="__DEFAULT__">{getRoundingMethodLabel(undefined)}</option>
                                                                  {ROUNDING_METHOD_OPTIONS.map((option) => (
                                                                      <option key={option.value} value={option.value}>{option.label}</option>
                                                                  ))}
                                                              </select>
                                                          </div>
                                                          {((formData.pricingConfig?.selectedRoundingMethod || companyDefaultRoundingMethod) === 'ALWAYS_UP_CUSTOM') && (
                                                              <div>
                                                                  <label className={styles.label}>Custom Step</label>
                                                                  <input
                                                                      type="number"
                                                                      min="1"
                                                                      value={Number(formData.pricingConfig?.customRoundingStep ?? companyDefaultCustomRoundingStep)}
                                                                      onChange={(e) => patchPricingConfig({
                                                                          customRoundingStep: Math.max(1, Number(e.target.value) || companyDefaultCustomRoundingStep)
                                                                      })}
                                                                      className={styles.input}
                                                                  />
                                                              </div>
                                                          )}
                                                          <div>
                                                              <label className={styles.label}>Auto Price Before Rounding</label>
                                                              <div className={styles.input + " bg-slate-100 text-slate-600 cursor-not-allowed"}>
                                                                  {currency}{stationeryAutoPricing.calculatedPrice.toFixed(2)}
                                                              </div>
                                                          </div>
                                                      </div>
                                                  </div>

                                                  {/* Cost Breakdown */}
                                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                      <div className={styles.glassMetric}>
                                                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Pack Cost</div>
                                                          <div className="text-lg font-bold text-slate-800">{currency}{(formData.costPerPack || 0).toFixed(2)}</div>
                                                      </div>
                                                      <div className={styles.glassMetric}>
                                                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Cost/Unit</div>
                                                          <div className="text-lg font-bold text-slate-800">{currency}{stationeryAutoPricing.costPrice.toFixed(2)}</div>
                                                      </div>
                                                      <div className={styles.glassMetric + " border-green-200 bg-green-50"}>
                                                          <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">{isItemManualOverride ? 'Final / Unit' : 'Auto / Unit'}</div>
                                                          <div className="text-lg font-bold text-green-700">{currency}{displayedStationeryUnitPrice.toFixed(2)}</div>
                                                      </div>
                                                  </div>

                                                  {/* Market Adjustments */}
                                                  <div className={styles.premiumCard}>
                                                      <h3 className={styles.premiumSectionTitle}>
                                                          <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                                                          Market Adjustments
                                                      </h3>
                                                      <div className="space-y-2">
                                                          {stationeryAdjustmentOptions.length > 0 ? stationeryAdjustmentOptions.map((adj: any) => {
                                                              const isSelected = formData.pricingConfig?.selectedAdjustmentIds?.includes(adj.id) || false;
                                                              const adjustmentAmount = calculateAdjustmentAmount(adj, stationeryAutoPricing.costPrice);
                                                              return (
                                                                  <div key={adj.id} className={styles.row + " rounded-lg " + (isSelected ? "bg-slate-50" : "")}>
                                                                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                                                                          <input
                                                                              type="checkbox"
                                                                              checked={isSelected}
                                                                              onChange={() => handleToggleAdjustment(adj.id)}
                                                                              className="sr-only peer"
                                                                          />
                                                                          <div className={`w-10 h-5 rounded-full transition-colors ${isSelected ? 'bg-blue-600' : 'bg-slate-200'} flex items-center ${isSelected ? 'justify-end' : 'justify-start'} px-0.5`}>
                                                                              <div className="w-4 h-4 bg-white rounded-full shadow"></div>
                                                                          </div>
                                                                          <div>
                                                                              <div className="text-sm font-medium text-slate-700">{adj.name}</div>
                                                                              <div className="text-[10px] text-slate-400">
                                                                                  {String(adj.type || '').toUpperCase().includes('PERCENT')
                                                                                      ? `${adj.value}%`
                                                                                      : `${currency}${Number(adj.value || 0).toFixed(2)}`}
                                                                              </div>
                                                                          </div>
                                                                      </label>
                                                                      {isSelected && (
                                                                          <div className={styles.priceTag + " bg-emerald-50 text-emerald-700 border border-emerald-200"}>
                                                                              +{currency}{adjustmentAmount.toFixed(2)}
                                                                          </div>
                                                                      )}
                                                                  </div>
                                                              );
                                                          }) : (
                                                              <div className="text-sm text-slate-400 italic">No active adjustments for this category.</div>
                                                          )}
                                                      </div>
                                                  </div>

                                              {/* Final Pricing Summary */}
                                              <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 shadow-xl">
                                                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
                                                  <h3 className="text-[13px] font-semibold text-slate-300 mb-4 flex items-center gap-2">
                                                      <span className="w-1.5 h-4 bg-amber-400 rounded-full"></span>
                                                      Pricing Summary
                                                  </h3>
                                                  <div className="space-y-3 relative">
                                                      <div className="flex justify-between text-sm">
                                                          <span className="text-slate-400">Cost/Unit</span>
                                                          <span className="text-slate-200 font-medium">{currency}{stationeryAutoPricing.costPrice.toFixed(2)}</span>
                                                      </div>
                                                      {stationeryAutoPricing.adjustmentSnapshots.map((snapshot, idx) => (
                                                          <div key={`${snapshot.name}-${idx}`} className="flex justify-between text-sm">
                                                              <span className="text-emerald-400">{snapshot.name}</span>
                                                              <span className="text-emerald-400 font-medium">+{currency}{Number(snapshot.calculatedAmount || 0).toFixed(2)}</span>
                                                          </div>
                                                      ))}
                                                      <div className="flex justify-between text-sm">
                                                          <span className="text-slate-400">Subtotal Before Margin</span>
                                                          <span className="text-slate-200 font-medium">{currency}{stationeryAutoPricing.subtotalBeforeMargin.toFixed(2)}</span>
                                                      </div>
                                                      <div className="flex justify-between text-sm">
                                                          <span className="text-green-400">Margin ({stationeryAutoPricing.marginLabel})</span>
                                                          <span className="text-green-400 font-medium">+{currency}{stationeryAutoPricing.marginAmount.toFixed(2)}</span>
                                                      </div>
                                                      <div className="flex justify-between text-sm">
                                                          <span className="text-purple-400">Rounding ({getRoundingMethodLabel(stationeryAutoPricing.roundingMethod)})</span>
                                                          <span className="text-purple-400 font-medium">
                                                              {stationeryAutoPricing.roundingDifference >= 0 ? '+' : '-'}
                                                              {currency}{Math.abs(stationeryAutoPricing.roundingDifference).toFixed(2)}
                                                          </span>
                                                      </div>
                                                      <div className={styles.premiumDivider + " my-4 bg-slate-600"}></div>
                                                      <div className="flex justify-between text-sm">
                                                          <span className="text-slate-400">Auto Price</span>
                                                          <span className="text-slate-200 font-medium">{currency}{stationeryAutoPricing.sellingPrice.toFixed(2)}</span>
                                                      </div>
                                                      {isItemManualOverride && (
                                                          <div className="flex justify-between text-sm">
                                                              <span className="text-amber-300">Manual Override</span>
                                                              <span className="text-amber-300 font-medium">{currency}{displayedStationeryUnitPrice.toFixed(2)}</span>
                                                          </div>
                                                      )}
                                                      <div className="flex justify-between items-center">
                                                          <span className="text-slate-300 font-semibold">Final Selling Price</span>
                                                          <span className="text-2xl font-bold text-white">
                                                              {currency}{displayedStationeryUnitPrice.toFixed(2)}
                                                          </span>
                                                      </div>
                                                  </div>
                                              </div>
                                          </>
                                      )}
                                         </div>
                                     )}

                            {/* Inventory Tab */}
                            {activeTab === 'inventory' && (
                                <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                                    {/* Metric Tiles */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className={styles.card}>
                                            <div className="text-xs text-slate-500 mb-1">On hand</div>
                                            <div className="text-lg font-medium text-slate-800">
                                                {formData.stock || 0} <span className="text-xs font-normal text-slate-400">{formData.purchaseUnit || formData.unit || 'units'}</span>
                                            </div>
                                        </div>
                                        <div className={styles.card}>
                                            <div className="text-xs text-slate-500 mb-1">Reserved</div>
                                            <div className="text-lg font-medium text-slate-800">
                                                {formData.reserved || 0} <span className="text-xs font-normal text-slate-400">{formData.purchaseUnit || formData.unit || 'units'}</span>
                                            </div>
                                        </div>
                                        <div className={styles.card}>
                                            <div className="text-xs text-slate-500 mb-1">Available</div>
                                            <div className="text-lg font-medium text-slate-800">
                                                {(formData.stock || 0) - (formData.reserved || 0)} <span className="text-xs font-normal text-slate-400">{formData.purchaseUnit || formData.unit || 'units'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stock Status Badge for Stationery */}
                                    {(formData.type === 'Stationery' || formData.type === 'Service') && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500">Status:</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                ((formData.stock || 0) - (formData.reserved || 0)) <= 0 
                                                    ? 'bg-red-100 text-red-700'
                                                    : ((formData.stock || 0) - (formData.reserved || 0)) <= (formData.reorderPoint || 10)
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-green-100 text-green-700'
                                            }`}>
                                                {((formData.stock || 0) - (formData.reserved || 0)) <= 0 ? 'Out' : ((formData.stock || 0) - (formData.reserved || 0)) <= (formData.reorderPoint || 10) ? 'Low' : 'OK'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Reorder Settings */}
                                    <div className={styles.card}>
                                        <h3 className={styles.sectionTitle}>Reorder settings</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={styles.label}>Reorder point</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={formData.reorderPoint || 0}
                                                    onChange={(e) => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                                                    className={styles.input}
                                                    placeholder="e.g. 10"
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.label}>Reorder quantity</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={formData.minOrderQty || 1}
                                                    onChange={(e) => setFormData({ ...formData, minOrderQty: Number(e.target.value) })}
                                                    className={styles.input}
                                                    placeholder="e.g. 50"
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.label}>Storage location</label>
                                                <input
                                                    type="text"
                                                    value={formData.binLocation || ''}
                                                    onChange={(e) => setFormData({ ...formData, binLocation: e.target.value })}
                                                    className={styles.input}
                                                    placeholder="e.g. A-1-2"
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.label}>Stock status</label>
                                                <select className={styles.select}>
                                                    <option>In Stock</option>
                                                    <option>Low Stock</option>
                                                    <option>Out of Stock</option>
                                                    <option>Discontinued</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Track per Variant Toggle for Stationery */}
                                    {formData.type === 'Stationery' && (
                                        <div className={styles.card}>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-medium text-slate-700">Track per variant</div>
                                                    <div className="text-xs text-slate-500">Enable variant-level stock tracking</div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" className="sr-only peer" />
                                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* Variants Tab */}
                            {activeTab === 'variants' && (
                                <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                                    {/* Header Section */}
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                                                        <Layers className="w-5 h-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-lg font-bold text-slate-800">Product Variants</h4>
                                                        <p className="text-sm text-slate-600">Create and manage product variations</p>
                                                    </div>
                                                </div>
                                                {formData.variants && formData.variants.length > 0 && (
                                                    <div className="mt-4 flex items-center gap-4 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-500">Total Variants:</span>
                                                            <span className="font-bold text-blue-600">{formData.variants.length}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-500">Total Stock:</span>
                                                            <span className="font-bold text-emerald-600">
                                                                {formData.variants.reduce((sum, v) => sum + (v.stock || 0), 0)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-500">Value:</span>
                                                            <span className="font-bold text-purple-600">
                                                                {currency}{formData.variants.reduce((sum, v) => sum + ((resolveVariantBasePrice(v as ProductVariant) || 0) * (v.stock || 0)), 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowBulkGenerator(true)}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-indigo-200 text-sm font-medium shadow-sm"
                                                >
                                                    <Grid className="w-4 h-4" /> Bulk Generate
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={openVariantForm}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all text-sm font-medium shadow-sm"
                                                >
                                                    <Plus className="w-4 h-4" /> Add Variant
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bulk Generator Panel */}
                                    {showBulkGenerator && (
                                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200 shadow-lg animate-in fade-in slide-in-from-top-4">
                                            <div className="flex justify-between items-center mb-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                                                        <Wand2 className="w-4 h-4 text-white" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 text-lg">Bulk Variant Generator</h4>
                                                        <p className="text-sm text-slate-600">Create multiple variants at once</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setShowBulkGenerator(false)} 
                                                    className="p-2 hover:bg-indigo-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {bulkAttributes.map((attr, idx) => (
                                                    <div key={idx} className="bg-white rounded-xl p-5 border border-indigo-100 shadow-sm">
                                                        <div className="flex gap-4 items-start">
                                                            <div className="w-1/3">
                                                                <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2 block">Attribute Name</label>
                                                                <input
                                                                    type="text"
                                                                    value={attr.name}
                                                                    onChange={(e) => {
                                                                        const newAttrs = [...bulkAttributes];
                                                                        newAttrs[idx].name = e.target.value;
                                                                        setBulkAttributes(newAttrs);
                                                                    }}
                                                                    className="w-full px-3 py-2.5 border border-indigo-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                                                    placeholder="e.g. Color"
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2 block">Values</label>
                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    {attr.values.map((val, vIdx) => (
                                                                        <span key={vIdx} className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm">
                                                                            {val}
                                                                            <button 
                                                                                type="button" 
                                                                                onClick={() => {
                                                                                    const newAttrs = [...bulkAttributes];
                                                                                    newAttrs[idx].values = newAttrs[idx].values.filter((_, i) => i !== vIdx);
                                                                                    setBulkAttributes(newAttrs);
                                                                                }}
                                                                                className="hover:bg-white/20 rounded p-0.5 transition-colors"
                                                                            >
                                                                                <X className="w-3 h-3" />
                                                                            </button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={bulkInputValue[idx] || ''}
                                                                        onChange={(e) => setBulkInputValue({ ...bulkInputValue, [idx]: e.target.value })}
                                                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBulkValue(idx))}
                                                                        className="flex-1 px-3 py-2.5 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                                                        placeholder="e.g. Red"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => addBulkValue(idx)}
                                                                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                                                    >
                                                                        Add
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setBulkAttributes(bulkAttributes.filter((_, i) => i !== idx))}
                                                                className="mt-8 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                disabled={bulkAttributes.length === 1}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={() => setBulkAttributes([...bulkAttributes, { name: '', values: [] }])}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-dashed border-indigo-300 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-all text-sm font-medium"
                                                >
                                                    <Plus className="w-4 h-4" /> Add Another Attribute
                                                </button>

                                                <div className="pt-6 border-t border-indigo-200 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={handleBulkGenerate}
                                                        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl flex items-center gap-3 font-medium shadow-lg transition-all transform hover:scale-105"
                                                        disabled={bulkAttributes.some(a => a.values.length === 0)}
                                                    >
                                                        <Wand2 className="w-5 h-5" />
                                                        Generate {bulkAttributes.reduce((acc, curr) => acc * (curr.values.length || 1), 1)} Variants
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Variant Form */}
                                    {showVariantForm && (
                                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-200 shadow-lg space-y-6">
                                            {formData.type === 'Stationery' ? (
                                                <>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Variant Name</label>
                                                            <input
                                                                type="text"
                                                                value={newVariant.name || ''}
                                                                onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. A4 Notebook"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Attribute</label>
                                                            <input
                                                                type="text"
                                                                value={getVariantAttributeSummary(newVariant)}
                                                                onChange={(e) => setNewVariant({
                                                                    ...newVariant,
                                                                    attributes: buildVariantAttributesFromText(e.target.value)
                                                                })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. Red Cover"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Cost Price ({currency})</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={Number(newVariant.cost_price ?? newVariant.cost ?? 0)}
                                                                onChange={(e) => {
                                                                    const costPrice = Number(e.target.value);
                                                                    setNewVariant(recalculateStationeryVariantPrice(newVariant, {
                                                                        cost: costPrice,
                                                                        cost_price: costPrice
                                                                    }));
                                                                }}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 5.00"
                                                            />
                                                        </div>
                                                        <div>
                                                             <label className="block text-xs font-medium text-slate-600 mb-1">Margin ({currency})</label>
                                                             <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-500 flex justify-between items-center">
                                                                 <span>{Number((newVariant as any).marginAmount ?? 0).toFixed(2)}</span>
                                                                 <span className="text-[10px] text-slate-400">Global</span>
                                                             </div>
                                                         </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Rounding Rule</label>
                                                            <select
                                                                value={(newVariant as any).selectedRoundingMethod || '__DEFAULT__'}
                                                                onChange={(e) => setNewVariant(recalculateStationeryVariantPrice(newVariant, {
                                                                    selectedRoundingMethod: e.target.value === '__DEFAULT__'
                                                                        ? undefined
                                                                        : e.target.value as PricingRoundingMethod
                                                                }))}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                            >
                                                                <option value="__DEFAULT__">{getRoundingMethodLabel(undefined)}</option>
                                                                {ROUNDING_METHOD_OPTIONS.map((option) => (
                                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Adjustment</label>
                                                            <details className="relative">
                                                                <summary className="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                                                                    {Array.isArray((newVariant as any).selectedAdjustmentIds) && (newVariant as any).selectedAdjustmentIds.length > 0
                                                                        ? `${(newVariant as any).selectedAdjustmentIds.length} adjustment${(newVariant as any).selectedAdjustmentIds.length > 1 ? 's' : ''} selected`
                                                                        : 'Choose adjustments'}
                                                                </summary>
                                                                <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                                                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Single or multiple</div>
                                                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                                        {stationeryAdjustmentOptions.length > 0 ? stationeryAdjustmentOptions.map((adjustment: any) => {
                                                                            const isSelected = ((newVariant as any).selectedAdjustmentIds || []).includes(adjustment.id);
                                                                            return (
                                                                                <label key={adjustment.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={isSelected}
                                                                                        onChange={() => toggleNewStationeryAdjustment(adjustment.id)}
                                                                                        className="mt-0.5"
                                                                                    />
                                                                                    <div className="flex-1">
                                                                                        <div className="text-sm font-medium text-slate-700">{adjustment.name}</div>
                                                                                        <div className="text-[11px] text-slate-400">
                                                                                            {String(adjustment.type || '').toUpperCase().includes('PERCENT')
                                                                                                ? `${adjustment.value}%`
                                                                                                : `${currency}${Number(adjustment.value || 0).toFixed(2)}`}
                                                                                        </div>
                                                                                    </div>
                                                                                </label>
                                                                            );
                                                                        }) : (
                                                                            <div className="text-sm text-slate-400 italic">No active adjustments for this category.</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </details>
                                                            <div className="mt-1 text-[11px] text-emerald-600">
                                                                +{currency}{Number((newVariant as any).adjustmentTotal || 0).toFixed(2)}
                                                            </div>
                                                        </div>
                                                        {(((newVariant as any).selectedRoundingMethod || formData.pricingConfig?.selectedRoundingMethod || companyDefaultRoundingMethod) === 'ALWAYS_UP_CUSTOM') && (
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-600 mb-1">Custom Step</label>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={Number((newVariant as any).customRoundingStep ?? formData.pricingConfig?.customRoundingStep ?? companyDefaultCustomRoundingStep)}
                                                                    onChange={(e) => setNewVariant(recalculateStationeryVariantPrice(newVariant, {
                                                                        customRoundingStep: Math.max(1, Number(e.target.value) || companyDefaultCustomRoundingStep)
                                                                    }))}
                                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Selling Price ({currency})</label>
                                                            <div className="space-y-2">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={Number(newVariant.selling_price ?? newVariant.price ?? 0)}
                                                                    onChange={(e) => handleNewStationeryManualPriceChange(Number(e.target.value))}
                                                                    readOnly={!Boolean((newVariant as any).manualOverride)}
                                                                    className={`w-full px-3 py-2 rounded-lg text-sm font-semibold ${Boolean((newVariant as any).manualOverride) ? 'border border-amber-200 bg-white text-amber-700' : 'border border-blue-200 bg-blue-50 text-blue-700'}`}
                                                                />
                                                                <div className="flex items-center justify-between text-[11px]">
                                                                    <span className="text-slate-400">Auto: {currency}{Number((newVariant as any).autoSellingPrice ?? calculateStationeryVariantAutoPricing(newVariant).sellingPrice).toFixed(2)}</span>
                                                                    {!Boolean((newVariant as any).manualOverride) ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleNewStationeryManualOverride(true)}
                                                                            className="text-amber-700 hover:text-amber-800 font-semibold"
                                                                        >
                                                                            Manual Override
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleNewStationeryManualOverride(false)}
                                                                            className="text-blue-700 hover:text-blue-800 font-semibold"
                                                                        >
                                                                            Return to Auto
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                                        <span className="font-semibold">Auto pricing:</span> CP + Adjustments + Margin + Rounding = SP
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Variant Name</label>
                                                            <input
                                                                type="text"
                                                                value={newVariant.name || ''}
                                                                onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 100gsm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Cost ({currency})</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={newVariant.cost || 0}
                                                                onChange={(e) => {
                                                                    const newCost = Number(e.target.value);
                                                                    const patch = { cost: newCost };
                                                                    setNewVariant({ ...newVariant, ...patch });
                                                                }}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 5.00"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Adj (%)</label>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={newVariant.adjustmentPercent || 0}
                                                                onChange={(e) => setNewVariant({ ...newVariant, adjustmentPercent: Number(e.target.value) })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 15.0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Rounding</label>
                                                            <select
                                                                value={newVariant.selectedRoundingMethod || 'none'}
                                                                onChange={(e) => setNewVariant({ ...newVariant, selectedRoundingMethod: e.target.value })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                            >
                                                                <option value="none">None</option>
                                                                <option value="ROUND_UP">Round Up</option>
                                                                <option value="ROUND_DOWN">Round Down</option>
                                                                <option value="NEAREST_1">Nearest 1</option>
                                                                <option value="NEAREST_5">Nearest 5</option>
                                                                <option value="NEAREST_10">Nearest 10</option>
                                                                <option value="NEAREST_50">Nearest 50</option>
                                                                <option value="NEAREST_100">Nearest 100</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">SP ({currency})</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={newVariant.price || 0}
                                                                onChange={(e) => setNewVariant({ ...newVariant, price: Number(e.target.value), calculated_price: Number(e.target.value) })}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 12.50"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-600 mb-1">Pages</label>
                                                            <input
                                                                type="number"
                                                                value={newVariant.pages || 1}
                                                                onChange={(e) => {
                                                                    const p = Math.max(1, Number(e.target.value) || 1);
                                                                    setNewVariant({ ...newVariant, pages: p });
                                                                    if (formData.smartPricing) {
                                                                        setVariantPreview(calculateSmartVariantPrice(p, 1));
                                                                    }
                                                                }}
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                                placeholder="e.g. 40"
                                                            />
                                                        </div>
                                                    </div>

                                                    {formData.smartPricing && variantPreview && (
                                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-1.5">
                                                            <div className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                                                                <TrendingUp className="w-3.5 h-3.5" /> Smart Pricing Preview ({variantPreview.pages} pages)
                                                            </div>
                                                            <div className="flex justify-between text-xs text-slate-600">
                                                                <span>{inventory.find(i => i.id === formData.smartPricing?.paperItemId)?.name?.replace(/\s*\d+gsm.*/i,'') || 'Paper'}</span>
                                                                <span>{currency}{variantPreview.paperCost.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs text-slate-600">
                                                                <span>{inventory.find(i => i.id === formData.smartPricing?.tonerItemId)?.name?.replace(/\s*Universal\s*/i,'') || 'Toner'}</span>
                                                                <span>{currency}{variantPreview.tonerCost.toFixed(2)}</span>
                                                            </div>
                                                            {variantPreview.finishingCost > 0 && (
                                                                <div className="flex justify-between text-xs text-slate-600">
                                                                    <span>Finishing</span>
                                                                    <span>{currency}{variantPreview.finishingCost.toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                            {variantPreview.marketAdjustments.filter((a: any) => a.value > 0).map((a: any, i: number) => (
                                                                <div key={i} className="flex justify-between text-xs text-emerald-600">
                                                                    <span>{a.name}</span>
                                                                    <span>+{currency}{a.value.toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                            {variantPreview.profitMarginAmount > 0 && (
                                                                <div className="flex justify-between text-xs text-green-600">
                                                                    <span>Margin ({variantPreview.marginType === 'percentage' ? `${variantPreview.marginValue}%` : 'Fixed'})</span>
                                                                    <span>+{currency}{variantPreview.profitMarginAmount.toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                            {variantPreview.wasRounded && (
                                                                <div className="flex justify-between text-xs text-purple-600">
                                                                    <span>Rounded</span>
                                                                    <span>+{currency}{variantPreview.roundingDifference.toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-sm font-bold text-indigo-700 border-t border-indigo-200 pt-2 mt-1">
                                                                <span>Selling Price</span>
                                                                <span>{currency}{variantPreview.roundedPrice.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(formData.smartPricing?.hiddenBOMId || formData.smartPricing?.bomTemplateId) && (
                                                        <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                                            <label className="block text-xs font-medium text-slate-600 mb-2">Pricing Mode</label>
                                                            <div className="flex gap-4">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name="variantPricingMode"
                                                                        value="dynamic"
                                                                        checked={newVariant.pricingSource === 'dynamic' || newVariant.inheritsParentBOM === true}
                                                                        onChange={() => setNewVariant({
                                                                            ...newVariant,
                                                                            pricingSource: 'dynamic',
                                                                            inheritsParentBOM: true
                                                                        })}
                                                                        className="text-blue-600"
                                                                    />
                                                                    <span className="text-sm text-slate-700">Dynamic (Auto)</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name="variantPricingMode"
                                                                        value="static"
                                                                        checked={newVariant.pricingSource === 'static' || (!newVariant.pricingSource && !newVariant.inheritsParentBOM)}
                                                                        onChange={() => setNewVariant({
                                                                            ...newVariant,
                                                                            pricingSource: 'static',
                                                                            inheritsParentBOM: false
                                                                        })}
                                                                        className="text-blue-600"
                                                                    />
                                                                    <span className="text-sm text-slate-700">Static (Manual)</span>
                                                                </label>
                                                            </div>
                                                            {newVariant.pricingSource === 'dynamic' && (
                                                                <p className="text-xs text-slate-500 mt-2">
                                                                    {`Price will be calculated from parent BOM using ${newVariant.pages || 1} pages`}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}



                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowVariantForm(false)}
                                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleAddVariant}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                                >
                                                    Add Variant
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Variants List â€” table layout */}
                                    {formData.variants && formData.variants.length > 0 ? (
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
                                                <h5 className="font-semibold text-slate-800 text-sm">Active Variants ({formData.variants.length})</h5>
                                                {formData.smartPricing && (
                                                    <span className="text-[10px] font-medium px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full flex items-center gap-1">
                                                        <TrendingUp className="w-3 h-3" /> Smart Pricing
                                                    </span>
                                                )}
                                            </div>

                                            {/* Table */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    {formData.type === 'Stationery' ? (
                                                        <thead>
                                                            <tr className="border-b border-slate-100">
                                                                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Name of Product</th>
                                                                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Attribute</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Cost Price</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Margin</th>
                                                                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Adjustments & Rounding</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Selling Price</th>
                                                                <th className="w-20 px-3 py-2.5"></th>
                                                            </tr>
                                                        </thead>
                                                    ) : (
                                                        <thead>
                                                            <tr className="border-b border-slate-100">
                                                                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Variant Name</th>
                                                                <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20">Pages</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Total Adjustments</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Profit Margin</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-purple-400 uppercase tracking-wider">Round Up</th>
                                                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Selling Price</th>
                                                                <th className="w-20 px-3 py-2.5"></th>
                                                            </tr>
                                                        </thead>
                                                    )}
                                                    {formData.type === 'Stationery' ? (
                                                        <tbody className="divide-y divide-slate-50">
                                                            {formData.variants.map((variant, idx) => {
                                                                const autoPricing = calculateStationeryVariantAutoPricing(variant);
                                                                const variantManualOverride = Boolean((variant as any).manualOverride);
                                                                const effectiveVariantRoundingMethod = ((variant as any).selectedRoundingMethod || formData.pricingConfig?.selectedRoundingMethod || companyDefaultRoundingMethod) as PricingRoundingMethod;

                                                                return (
                                                                <tr key={variant.id || idx} className="hover:bg-slate-50 transition-colors align-top">
                                                                    <td className="px-4 py-3">
                                                                        <input
                                                                            type="text"
                                                                            value={variant.name || ''}
                                                                            onChange={(e) => handleStationeryVariantChange(variant.id, { name: e.target.value })}
                                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                                                                        />
                                                                        <div className="mt-1 text-[10px] font-mono text-slate-400">{variant.sku}</div>
                                                                    </td>
                                                                    <td className="px-3 py-3">
                                                                        <input
                                                                            type="text"
                                                                            value={getVariantAttributeSummary(variant)}
                                                                            onChange={(e) => handleStationeryVariantChange(variant.id, {
                                                                                attributes: buildVariantAttributesFromText(e.target.value)
                                                                            })}
                                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                                                                            placeholder="Variant attribute"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-3">
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={Number(variant.cost_price ?? variant.cost ?? 0)}
                                                                            onChange={(e) => {
                                                                                const costPrice = Number(e.target.value);
                                                                                handleStationeryVariantChange(variant.id, {
                                                                                    cost: costPrice,
                                                                                    cost_price: costPrice
                                                                                });
                                                                            }}
                                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm text-slate-700"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-3">
                                                                        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm text-slate-700">
                                                                            {currency}{Number((variant as any).marginAmount ?? autoPricing.marginAmount).toFixed(2)}
                                                                        </div>
                                                                        <div className="mt-1 text-[10px] text-slate-400">{Number(variant.marginPercent || 0).toFixed(1)}%</div>
                                                                    </td>
                                                                    <td className="px-3 py-3">
                                                                        <details className="relative">
                                                                            <summary className="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                                                                                {Array.isArray((variant as any).selectedAdjustmentIds) && (variant as any).selectedAdjustmentIds.length > 0
                                                                                    ? `${(variant as any).selectedAdjustmentIds.length} selected`
                                                                                    : 'Choose'}
                                                                            </summary>
                                                                            <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                                                                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Single or multiple</div>
                                                                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                                                    {stationeryAdjustmentOptions.length > 0 ? stationeryAdjustmentOptions.map((adjustment: any) => {
                                                                                        const isSelected = ((variant as any).selectedAdjustmentIds || []).includes(adjustment.id);
                                                                                        return (
                                                                                            <label key={adjustment.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={isSelected}
                                                                                                    onChange={() => handleStationeryVariantChange(variant.id, toggleStationeryVariantAdjustment(variant, adjustment.id))}
                                                                                                    className="mt-0.5"
                                                                                                />
                                                                                                <div className="flex-1">
                                                                                                    <div className="text-sm font-medium text-slate-700">{adjustment.name}</div>
                                                                                                    <div className="text-[11px] text-slate-400">
                                                                                                        {String(adjustment.type || '').toUpperCase().includes('PERCENT')
                                                                                                            ? `${adjustment.value}%`
                                                                                                            : `${currency}${Number(adjustment.value || 0).toFixed(2)}`}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </label>
                                                                                        );
                                                                                    }) : (
                                                                                        <div className="text-sm text-slate-400 italic">No active adjustments for this category.</div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </details>
                                                                        <div className="mt-1 text-[11px] text-emerald-600">+{currency}{Number((variant as any).adjustmentTotal || 0).toFixed(2)}</div>
                                                                        <select
                                                                            value={(variant as any).selectedRoundingMethod || '__DEFAULT__'}
                                                                            onChange={(e) => handleStationeryVariantChange(variant.id, {
                                                                                selectedRoundingMethod: e.target.value === '__DEFAULT__'
                                                                                    ? undefined
                                                                                    : e.target.value as PricingRoundingMethod
                                                                            } as Partial<ProductVariant>)}
                                                                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
                                                                        >
                                                                            <option value="__DEFAULT__">{getRoundingMethodLabel(undefined)}</option>
                                                                            {ROUNDING_METHOD_OPTIONS.map((option) => (
                                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                                            ))}
                                                                        </select>
                                                                        {effectiveVariantRoundingMethod === 'ALWAYS_UP_CUSTOM' && (
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={Number((variant as any).customRoundingStep ?? formData.pricingConfig?.customRoundingStep ?? companyDefaultCustomRoundingStep)}
                                                                                onChange={(e) => handleStationeryVariantChange(variant.id, {
                                                                                    customRoundingStep: Math.max(1, Number(e.target.value) || companyDefaultCustomRoundingStep)
                                                                                } as Partial<ProductVariant>)}
                                                                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
                                                                            />
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-3 text-right">
                                                                        <div className="space-y-2">
                                                                            <input
                                                                                type="number"
                                                                                step="0.01"
                                                                                value={Number(variant.selling_price ?? variant.price ?? 0)}
                                                                                onChange={(e) => handleStationeryVariantManualPriceChange(variant.id, Number(e.target.value))}
                                                                                readOnly={!variantManualOverride}
                                                                                className={`w-full rounded-lg px-3 py-2 text-right text-sm font-semibold ${variantManualOverride ? 'border border-amber-200 bg-white text-amber-700' : 'border border-blue-200 bg-blue-50 text-blue-700'}`}
                                                                            />
                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                <span className="text-slate-400">Auto {currency}{Number((variant as any).autoSellingPrice ?? autoPricing.sellingPrice).toFixed(2)}</span>
                                                                                {!variantManualOverride ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleStationeryVariantChange(variant.id, toggleStationeryVariantManualOverride(variant, true) as Partial<ProductVariant>)}
                                                                                        className="text-amber-700 hover:text-amber-800 font-semibold"
                                                                                    >
                                                                                        Manual
                                                                                    </button>
                                                                                ) : (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleStationeryVariantChange(variant.id, toggleStationeryVariantManualOverride(variant, false) as Partial<ProductVariant>)}
                                                                                        className="text-blue-700 hover:text-blue-800 font-semibold"
                                                                                    >
                                                                                        Auto
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-400">CP + Adjustments + Margin + Rounding</div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-3 text-center">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveVariant(variant.id)}
                                                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            )})}
                                                        </tbody>
                                                    ) : (
                                                    <tbody className="divide-y divide-slate-50">
                                                        {formData.variants.map((variant, idx) => {
                                                            const snap = (variant as any).smartPricingSnapshot;
                                                            const totalAdjustments = snap?.marketAdjustmentTotal ?? (variant as any).adjustmentTotal ?? 0;
                                                            const profitMargin = snap?.profitMarginAmount ?? 0;
                                                            const roundUp = snap?.roundingDifference ?? (variant as any).rounding_difference ?? 0;
                                                            const wasRounded = snap?.wasRounded ?? (roundUp !== 0);
                                                            return (
                                                                <React.Fragment key={variant.id || idx}>
                                                                    <tr className="hover:bg-slate-50 transition-colors">
                                                                        {/* Variant Name */}
                                                                        <td className="px-4 py-3">
                                                                            <div className="font-medium text-slate-800">{variant.name}</div>
                                                                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{variant.sku}</div>
                                                                        </td>

                                                                        {/* Pages – editable, triggers live reprice */}
                                                                        <td className="px-3 py-3 text-center">
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={variant.pages || 1}
                                                                                onChange={(e) => handleVariantPagesChange(variant.id, Math.max(1, Number(e.target.value) || 1))}
                                                                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-center focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                                                                            />
                                                                        </td>

                                                                        {/* Total Adjustments */}
                                                                        <td className="px-3 py-3 text-right">
                                                                            <div className="text-xs font-medium text-emerald-700">
                                                                                +{currency}{Number(totalAdjustments).toFixed(2)}
                                                                            </div>
                                                                        </td>

                                                                        {/* Profit Margin */}
                                                                        <td className="px-3 py-3 text-right">
                                                                            <div className="text-xs font-medium text-orange-600">
                                                                                +{currency}{Number(profitMargin).toFixed(2)}
                                                                            </div>
                                                                        </td>

                                                                        {/* Round Up */}
                                                                        <td className="px-3 py-3 text-right">
                                                                            {wasRounded ? (
                                                                                <div className="text-xs font-medium text-purple-600">
                                                                                    +{currency}{Number(roundUp).toFixed(2)}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-xs text-slate-300">—</div>
                                                                            )}
                                                                        </td>

                                                                        {/* Selling Price */}
                                                                        <td className="px-3 py-3 text-right">
                                                                            <div className="font-bold text-indigo-700 text-sm">
                                                                                {currency}{resolveVariantBasePrice(variant).toFixed(2)}
                                                                            </div>
                                                                        </td>

                                                                        {/* Actions */}
                                                                        <td className="px-3 py-3 text-center">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRemoveVariant(variant.id)}
                                                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                    )}
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border-2 border-dashed border-slate-300">
                                            <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                <Layers className="w-8 h-8 text-slate-400" />
                                            </div>
                                            <h5 className="text-lg font-semibold text-slate-700 mb-2">No Variants Yet</h5>
                                            <p className="text-sm text-slate-500 mb-6">Start by adding your first product variant</p>
                                            <button
                                                type="button"
                                                onClick={openVariantForm}
                                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-sm"
                                            >
                                                <Plus className="w-4 h-4" /> Create First Variant
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </form>
                    </div>

                {/* Footer removed for top-tab style */}

            </div >
        </div >
    );
};

export default ItemModal;


