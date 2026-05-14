import React, { useState, useEffect, useMemo, useCallback } from 'react';
// PRICING RULE: Do NOT implement pricing logic here. All pricing MUST go through pricingEngine.ts
import { X, CheckCircle, Printer, Usb, Wallet, UserPlus, Save, ArrowRight, Calculator, DollarSign, Tag, ShieldCheck, Plus, Search, Building2, FileText, Clock, Settings, Info, RefreshCw, Layers } from 'lucide-react';
import { HeldOrder, Sale, Invoice, Item, ProductVariant, BillOfMaterial, WorkOrder, BOMTemplate } from '../../../types';
import { useData } from '../../../context/DataContext';
import { DEFAULT_ACCOUNTS, ACCOUNT_IDS } from '../../../constants';
import { hardwareService } from '../../../services/hardwareService';
import { generateAccountNumber, roundFinancial, formatNumber, roundToCurrency } from '../../../utils/helpers';
import { bomService } from '../../../services/bomService';
import { pricingService, DynamicServicePricingResult } from '../../../services/pricingService';
import { dbService } from '../../../services/db';
import { applyProductPriceRounding } from '../../../services/pricingRoundingService';
import { calculateServicePrice } from '../../../utils/pricing/pricingEngine';
import { normalizeStoredPricing, resolveStoredSellingPrice } from '../../../utils/pricing';
import { getPlaceholder } from '../../../constants/placeholders';



// --- Printing Variant Modal ---
export const PrintingVariantModal: React.FC<{
    product: Item;
    bom?: BillOfMaterial;
    materials: Item[];
    onSelect: (variant: any) => void;
    onClose: () => void;
}> = ({ product, bom, materials, onSelect, onClose }) => {
    const { companyConfig, notify, inventory, marketAdjustments } = useData();
    const currency = companyConfig.currencySymbol;
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [attributes, setAttributes] = useState<Record<string, any>>({
        number_of_pages: 1,
        paper_type: 'A4 80g',
        print_mode: 'B/W',
        binding_type: 'None'
    });
    const [pricingState, setPricingState] = useState({
        baseCost: product.cost,
        adjustmentTotal: 0,
        sellingPrice: product.price,
        adjustmentBreakdown: [] as any[],
        adjustmentSnapshots: [] as any[]
    });
    const [quantity, setQuantity] = useState(1);

    // Load BOM templates on mount
    useEffect(() => {
        let mounted = true;
        dbService.getAll<BOMTemplate>('bomTemplates')
            .then((templates) => {
                if (mounted) setBomTemplates(templates || []);
            })
            .catch((err) => {
                console.error('Failed to load BOM templates for variant pricing', err);
            });
        return () => { mounted = false; };
    }, []);

    // Memoize values to prevent infinite loops
    const materialsList = useMemo(() => inventory || materials, [inventory, materials]);
    const adjustmentsList = useMemo(() => marketAdjustments || [], [marketAdjustments]);

    useEffect(() => {
        // Check if parent has Hidden BOM for dynamic pricing
        const hasHiddenBOM = (product as any).smartPricing?.hiddenBOMId || (product as any).smartPricing?.bomTemplateId;

        if (hasHiddenBOM) {
            // Use dynamic variant pricing from pricingService
            const virtualVariant: ProductVariant = {
                id: 'virtual',
                productId: product.id,
                sku: product.sku,
                name: product.name,
                attributes: attributes,
                pages: attributes.number_of_pages || 1,
                price: 0,
                cost: 0,
                stock: 0,
                pricingSource: 'dynamic',
                inheritsParentBOM: true
            };

            const result = pricingService.calculateVariantPrice(
                product,
                virtualVariant,
                quantity,
                materialsList,
                bomTemplates,
                adjustmentsList
            );

            setPricingState({
                baseCost: result.cost,
                adjustmentTotal: result.adjustmentTotal,
                sellingPrice: result.price,
                adjustmentBreakdown: result.breakdown,
                adjustmentSnapshots: result.adjustmentSnapshots
            });
        } else if (bom) {
            // Legacy BOM calculation
            const result = bomService.calculateVariantBOM(bom, { attributes } as any, materials);
            const cost = roundFinancial(result.totalProductionCost);

            let price = product.price;
            if (bom.priceFormula) {
                price = roundFinancial(bomService.resolveFormula(bom.priceFormula, attributes));
            }

            setPricingState({
                baseCost: cost,
                adjustmentTotal: 0,
                sellingPrice: roundToCurrency(cost),
                adjustmentBreakdown: [],
                adjustmentSnapshots: []
            });
        }
    }, [attributes, bom, materials, product, quantity, materialsList, adjustmentsList]);

    const handleAttributeChange = (key: string, value: any) => {
        setAttributes(prev => ({ ...prev, [key]: value }));
    };

    const handleConfirm = () => {
        const variantName = `${product.name} (${Object.entries(attributes).map(([k, v]) => `${k}: ${v}`).join(', ')})`;
        const virtualVariant = {
            ...product,
            id: `${product.id}-${Date.now()}`,
            parentId: product.id,
            name: variantName,
            attributes: attributes,
            quantity: quantity,
            price: pricingState.sellingPrice,
            cost: pricingState.baseCost,
            adjustmentTotal: pricingState.adjustmentTotal,
            adjustmentSnapshots: pricingState.adjustmentSnapshots,
            pagesOverride: attributes.number_of_pages // Pass through for transactionService
        };
        onSelect(virtualVariant);
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden border border-[#d4d7dc]">
                <div className="px-6 py-4 border-b border-[#d4d7dc] flex justify-between items-center bg-[#f4f5f8]">
                    <h2 className="text-sm font-bold text-[#393a3d] uppercase tracking-wider">Configure {product.name}</h2>
                    <button onClick={onClose} className="text-[#8d9096] hover:text-[#d52b1e]"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-bold text-[#6b6c7f] uppercase tracking-wider mb-1.5">Number of Pages</label>
                            <input
                                type="number"
                                className="w-full p-2 border border-[#babec5] rounded text-sm focus:border-[#0077c5] outline-none"
                                placeholder="e.g. 5"
                                onChange={e => handleAttributeChange('number_of_pages', parseInt(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-[#6b6c7f] uppercase tracking-wider mb-1.5">Paper Type</label>
                            <select
                                className="w-full p-2 border border-[#babec5] rounded text-sm focus:border-[#0077c5] outline-none"
                                onChange={e => handleAttributeChange('paper_type', e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="A4 80g">A4 80g</option>
                                <option value="A4 100g">A4 100g</option>
                                <option value="A3 80g">A3 80g</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-[#6b6c7f] uppercase tracking-wider mb-1.5">Quantity</label>
                            <input
                                type="number"
                                className="w-full p-2 border border-[#babec5] rounded text-sm font-bold focus:border-[#0077c5] outline-none"
                                value={quantity}
                                onChange={e => setQuantity(parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="bg-[#f4f5f8] p-6 rounded border border-[#d4d7dc] space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-[#6b6c7f] uppercase">Unit Price</span>
                            <span className="text-sm font-bold text-[#393a3d]">{currency}{pricingState.sellingPrice.toLocaleString()}</span>
                        </div>
                        <div className="pt-3 border-t border-[#d4d7dc] flex justify-between items-center">
                            <span className="text-xs font-bold text-[#393a3d] uppercase">Total Amount</span>
                            <span className="text-xl font-bold text-[#0077c5]">{currency}{(pricingState.sellingPrice * quantity).toLocaleString()}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleConfirm}
                        className="w-full py-3.5 bg-[#2ca01c] text-white rounded-full font-bold text-sm hover:bg-[#248217] transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                        Add to Order <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Dynamic Service Calculator Modal ---
export const ServiceCalculatorModal: React.FC<{
    service: Item;
    currencySymbol: string;
    initialPages?: number;
    initialCopies?: number;
    onConfirm: (pricing: DynamicServicePricingResult) => void;
    onClose: () => void;
}> = ({ service, currencySymbol, initialPages = 1, initialCopies = 1, onConfirm, onClose }) => {
    const { inventory = [], marketAdjustments = [], companyConfig } = useData();
    const [pages, setPages] = useState(Math.max(1, Number(initialPages) || 1));
    const [copies, setCopies] = useState(Math.max(1, Number(initialCopies) || 1));
    const [isCalculating, setIsCalculating] = useState(false);
    const [enginePricing, setEnginePricing] = useState<DynamicServicePricingResult | null>(null);

    const config = service.serviceConfig;

    const normalizedAdjustments = useMemo(() => {
        return (marketAdjustments || [])
            .filter((adj: any) => {
                const isActive = adj.active ?? adj.isActive;
                const categoryMatch = !adj.applyToCategories || adj.applyToCategories.length === 0 || adj.applyToCategories.includes(service.category);
                return isActive && categoryMatch;
            })
            .map((adj: any) => ({
                name: adj.name,
                type: adj.type,
                value: adj.value,
                adjustmentId: adj.id,
                isActive: true
            }));
    }, [marketAdjustments, service.category]);

    const computePageScaledCost = useCallback((pageCount: number, copyCount: number): number => {
        const sp = (service as any).smartPricing;

        if (sp) {
            let paperCost = 0;
            const paper = inventory.find((i: any) => i.id === sp.paperItemId);
            if (paper) {
                const sheetsPerCopy = Math.ceil(pageCount / 2);
                const totalSheets = sheetsPerCopy * copyCount;
                const reamSize = Number((paper as any).conversionRate || (paper as any).conversion_rate || 500);
                const paperUnitCost = Number((paper as any).cost_price || (paper as any).cost_per_unit || paper.cost || 0);
                const costPerSheet = reamSize > 0 ? paperUnitCost / reamSize : 0;
                paperCost = Number((totalSheets * costPerSheet).toFixed(2));
            }

            let tonerCost = 0;
            const toner = inventory.find((i: any) => i.id === sp.tonerItemId);
            if (toner) {
                const capacity = 20000;
                const totalPages = pageCount * copyCount;
                const tonerUnitCost = Number((toner as any).cost_price || (toner as any).cost_per_unit || toner.cost || 0);
                tonerCost = Number((totalPages * (tonerUnitCost / capacity)).toFixed(2));
            }

            const finishingCost = ((sp.finishingEnabled || []) as string[]).reduce((sum: number, id: string) => {
                const FINISHING_DEFAULTS: Record<string, number> = {
                    binding: 150, coverPages: 20, cutting: 30,
                    holePunch: 20, folding: 15, stapling: 10
                };
                return sum + ((FINISHING_DEFAULTS[id] || 0) * copyCount);
            }, 0);

            return paperCost + tonerCost + finishingCost;
        }

        const flatCostPerCopy = config?.baseLaborCost || config?.baseRate || service.cost || 0;
        const baselinePages = Number((service as any).pages) || 1;
        const scaledCostPerCopy = flatCostPerCopy * (pageCount / baselinePages);
        return scaledCostPerCopy * copyCount;
    }, [service, inventory, config]);

    useEffect(() => {
        let mounted = true;
        const calculate = async () => {
            setIsCalculating(true);
            try {
                const baseCost = computePageScaledCost(pages, copies);

                const result = await calculateServicePrice({
                    itemId: service.id,
                    categoryId: service.category,
                    baseCost: baseCost,
                    basePrice: undefined,
                    pages: pages,
                    copies: copies,
                    adjustments: normalizedAdjustments,
                    context: 'SERVICE'
                });

                if (mounted) {
                    const totalPages = pages * copies;
                    const unitCostPerCopy = copies > 0 ? roundToCurrency(baseCost / copies) : baseCost;
                    const unitCostPerPage = totalPages > 0 ? roundToCurrency(baseCost / totalPages) : baseCost;
                    const unitPricePerPage = totalPages > 0 ? roundToCurrency(result.unitPrice / totalPages) : result.unitPrice;

                    const transformed: DynamicServicePricingResult = {
                        pages,
                        copies,
                        totalPages,
                        unitCostPerCopy,
                        unitPricePerCopy: result.unitPrice,
                        unitCostPerPage,
                        unitPricePerPage,
                        totalCost: baseCost,
                        totalPrice: result.totalPrice,
                        calculatedTotalPrice: result.totalPrice,
                        adjustmentTotal: result.adjustmentTotal,
                        adjustmentSnapshots: result.adjustmentSnapshots,
                        marginAmount: result.marginAmount,
                        rounding_difference: result.roundingDifference,
                        components: [],
                        serviceDetails: {
                            pages,
                            copies,
                            totalPages,
                            unitCostPerPage,
                            unitPricePerPage,
                            unitCostPerCopy,
                            unitPricePerCopy: result.unitPrice,
                            totalCost: baseCost,
                            totalPrice: result.totalPrice,
                            calculatedTotalPrice: result.totalPrice
                        }
                    };
                    setEnginePricing(transformed);
                }
            } catch (err) {
                console.error('[ServiceCalculatorModal] Pricing engine error:', err);
            } finally {
                if (mounted) setIsCalculating(false);
            }
        };

        calculate();
        return () => { mounted = false; };
    }, [service, pages, copies, normalizedAdjustments, computePageScaledCost]);

    const activePricing = enginePricing;
    const formatCurrency = (value: number) => `${currencySymbol}${formatNumber(value)}`;

    if (!activePricing) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in fade-in zoom-in-95 duration-200 font-sans">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <Settings className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-semibold text-slate-800 leading-snug">Service Configuration</h2>
                            <p className="text-[11px] text-slate-500 font-medium">{service.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-rose-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-slate-600 flex items-center gap-1.5">
                                <FileText className="w-3 h-3" /> Pages / Units
                            </label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={pages}
                                onChange={e => {
                                    const newValue = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                                    setPages(newValue);
                                }}
                                onBlur={e => {
                                    const finalValue = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                                    setPages(finalValue);
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13.5px] font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all tabular-nums"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-slate-600 flex items-center gap-1.5">
                                <Layers className="w-3 h-3" /> Quantity / Copies
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={copies}
                                onChange={e => setCopies(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13.5px] font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all tabular-nums"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-4 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                            <span className="text-[12px] font-semibold text-slate-600">Pricing Breakdown</span>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-md border border-emerald-200">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                <span className="text-[10px] font-semibold text-emerald-700">Live</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="text-[13px] text-slate-700">Base Service Rate</span>
                                    <p className="text-[10px] text-slate-400">{pages} pages × {copies} {copies === 1 ? 'copy' : 'copies'}</p>
                                </div>
                                <span className="text-[13px] font-semibold text-slate-800 tabular-nums">{formatCurrency(activePricing.totalCost)}</span>
                            </div>

                            {activePricing.adjustmentSnapshots && activePricing.adjustmentSnapshots.length > 0 && (
                                activePricing.adjustmentSnapshots
                                    .filter((adj: any) => adj.name?.toLowerCase().includes('margin') ? false : true)
                                    .map((adj: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[13px] text-emerald-700">{adj.name}</span>
                                            {adj.type === 'PERCENTAGE' && (
                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-semibold">+{adj.value}%</span>
                                            )}
                                        </div>
                                        <span className="text-[13px] font-semibold text-emerald-700 tabular-nums">+{formatCurrency(adj.calculatedAmount)}</span>
                                    </div>
                                ))
                            )}

                            {activePricing.marginAmount > 0 && activePricing.unitCostPerCopy > 0 && (
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] text-blue-700">Profit Margin</span>
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-semibold">
                                            +{Math.round((activePricing.marginAmount / (activePricing.unitCostPerCopy * activePricing.copies)) * 100)}%
                                        </span>
                                    </div>
                                    <span className="text-[13px] font-semibold text-blue-700 tabular-nums">+{formatCurrency(activePricing.marginAmount)}</span>
                                </div>
                            )}

                            {(activePricing.rounding_difference || 0) !== 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[13px] text-slate-500">Round Up</span>
                                    <span className="text-[13px] font-medium text-slate-500 tabular-nums">
                                        +{formatCurrency(activePricing.rounding_difference * activePricing.copies)}
                                    </span>
                                </div>
                            )}

                            <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                                <span className="text-[13px] font-semibold text-slate-800">Total Price</span>
                                <span className="text-[18px] font-bold text-indigo-600 tabular-nums">{formatCurrency(activePricing.totalPrice)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-lg p-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full -translate-y-1/3 translate-x-1/3"></div>
                        <div className="relative flex justify-between items-end">
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Due</p>
                                <h3 className="text-[22px] font-bold text-white tabular-nums">
                                    {formatCurrency(activePricing.totalPrice)}
                                </h3>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-medium text-slate-400">Total Items</div>
                                <div className="text-[14px] font-semibold text-white tabular-nums">{activePricing.totalPages} <span className="text-[10px] text-slate-400 font-normal">pages</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-semibold text-[13px] hover:bg-slate-50 transition-all active:scale-[0.98]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm({
                                ...activePricing,
                                priceLocked: true,
                                lockedTotalPrice: activePricing.totalPrice,
                                lockedUnitPricePerCopy: activePricing.unitPricePerCopy,
                                lockedUnitCostPerCopy: activePricing.unitCostPerCopy
                            })}
                            className="flex-[1.5] py-2 bg-indigo-600 text-white rounded-lg font-semibold text-[13px] hover:bg-indigo-700 shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                        >
                            Add to Order <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Customer Modal ---
export const CustomerModal: React.FC<{
    onSelect: (name: string) => void;
    onClose: () => void;
}> = ({ onSelect, onClose }) => {
    const { invoices, customers, companyConfig, notify } = useData();
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerContact, setNewCustomerContact] = useState('');

    const customerNames = useMemo(() => {
        const names = new Set<string>();
        // Add ALL customers from CRM (not just those with balances)
        customers?.forEach(c => {
            if (c.name) names.add(c.name);
        });
        // Also include legacy invoice customers 
        invoices?.forEach(inv => {
            if (inv.customerName) names.add(inv.customerName);
        });
        return Array.from(names).sort();
    }, [invoices, customers]);

    const handleQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCustomerName) return;

        onSelect(newCustomerName);
        notify(`Customer ${newCustomerName} selected`, 'success');
        onClose();
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="bg-white rounded shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden border border-[#d4d7dc]">
                <div className="px-6 py-4 border-b border-[#d4d7dc] flex justify-between items-center bg-[#f4f5f8]">
                    <h2 className="text-sm font-bold text-[#393a3d] uppercase tracking-wider">Select Customer</h2>
                    <button onClick={onClose} className="text-[#8d9096] hover:text-[#d52b1e]"><X size={20} /></button>
                </div>

                <div className="px-6 py-4 bg-white border-b border-[#d4d7dc] flex justify-between items-center shrink-0">
                    <p className="text-[11px] font-bold text-[#6b6c7f] uppercase tracking-wider">Accounts</p>
                    <button
                        onClick={() => setShowQuickAdd(!showQuickAdd)}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${showQuickAdd ? 'bg-[#f4f5f8] text-[#393a3d] border border-[#babec5]' : 'bg-[#0077c5] text-white'}`}
                    >
                        {showQuickAdd ? <X size={14} /> : <UserPlus size={14} />}
                        {showQuickAdd ? 'Cancel' : 'New Customer'}
                    </button>
                </div>

                {showQuickAdd && (
                    <form onSubmit={handleQuickAdd} className="p-6 bg-[#f4f5f8] border-b border-[#d4d7dc] animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#6b6c7f] uppercase">Full Name *</label>
                                <input
                                    className="w-full p-2.5 border border-[#babec5] rounded text-sm focus:border-[#0077c5] outline-none bg-white"
                                    placeholder="e.g. Acme Printing"
                                    value={newCustomerName}
                                    onChange={e => setNewCustomerName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#6b6c7f] uppercase">Contact info</label>
                                <input
                                    className="w-full p-2.5 border border-[#babec5] rounded text-sm focus:border-[#0077c5] outline-none bg-white"
                                    placeholder="Phone or Email"
                                    value={newCustomerContact}
                                    onChange={e => setNewCustomerContact(e.target.value)}
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={!newCustomerName}
                            className="px-8 py-2.5 bg-[#2ca01c] text-white rounded-full text-sm font-bold hover:bg-[#248217] disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                        >
                            <Save size={16} /> Save and Select
                        </button>
                    </form>
                )}

                <div className="p-2 overflow-y-auto flex-1 divide-y divide-[#f4f5f8] custom-scrollbar">
                    {customerNames.map(name => {
                        const custInvoices = invoices.filter(i => i.customerName === name && i.status !== 'Paid' && i.status !== 'Draft');
                        const custDebt = custInvoices.reduce((sum, i) => sum + (i.totalAmount - (i.paidAmount || 0)), 0);

                        return (
                            <button key={name} onClick={() => onSelect(name)} className="w-full text-left px-6 py-4 hover:bg-[#f4f5f8] flex justify-between items-center transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-[#eceef1] flex items-center justify-center text-[#393a3d] font-bold group-hover:bg-[#0077c5] group-hover:text-white transition-all">
                                        {name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-[#393a3d] text-sm">{name}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-bold ${custDebt > 0 ? 'text-[#d52b1e]' : 'text-[#2ca01c]'}`}>
                                        {companyConfig.currencySymbol}{custDebt.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-[#6b6c7f] font-medium uppercase">
                                        {custDebt > 0 ? 'Outstanding' : 'Clear'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- Held Orders Modal ---
export const HeldOrdersModal: React.FC<{
    orders: HeldOrder[];
    onRetrieve: (o: HeldOrder) => void;
    onClose: () => void;
}> = ({ orders, onRetrieve, onClose }) => (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
        <div className="bg-white rounded shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-[#d4d7dc]">
            <div className="px-6 py-4 border-b border-[#d4d7dc] flex justify-between items-center bg-[#f4f5f8]">
                <h2 className="text-sm font-bold text-[#393a3d] uppercase tracking-wider">Parked Orders</h2>
                <button onClick={onClose} className="text-[#8d9096] hover:text-[#d52b1e]"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-[#f4f5f8] custom-scrollbar">
                {orders.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-[#8d9096]">
                        <Clock size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-medium">No parked orders found</p>
                    </div>
                )}
                {orders.map(order => (
                    <div key={order.id} className="px-6 py-5 flex justify-between items-center hover:bg-[#f4f5f8] transition-all group">
                        <div className="space-y-1">
                            <div className="font-bold text-[#393a3d]">{order.customerName}</div>
                            <div className="text-xs text-[#6b6c7f] flex items-center gap-3">
                                <span>{new Date(order.date).toLocaleString()}</span>
                                <span className="w-1 h-1 bg-[#d4d7dc] rounded-full"></span>
                                <span>{order.items.length} items</span>
                            </div>
                            {order.note && <div className="text-xs text-[#6b6c7f] italic">Note: {order.note}</div>}
                        </div>
                        <button onClick={() => onRetrieve(order)} className="bg-white border border-[#babec5] text-[#393a3d] px-6 py-2 rounded-full font-bold text-xs hover:bg-[#eceef1] hover:border-[#8d9096] transition-all">
                            Retrieve
                        </button>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

// --- Returns Modal ---
export const ReturnsModal: React.FC<{
    sales: Sale[];
    onProcess: (saleId: string, items: any[], accountId: string) => void;
    onClose: () => void;
}> = ({ sales, onProcess, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [returnItems, setReturnItems] = useState<{ itemId: string, qty: number }[]>([]);
    const [refundAccountId, setRefundAccountId] = useState(ACCOUNT_IDS.CASH_DRAWER); // Default to Cash Account

    const cashBankAccounts = useMemo(() =>
        DEFAULT_ACCOUNTS.filter(acc => [ACCOUNT_IDS.CASH_DRAWER, ACCOUNT_IDS.BANK, ACCOUNT_IDS.MOBILE_MONEY].includes(acc.id)),
        []);

    const handleSearch = () => {
        const sale = sales.find(s => s.id === searchTerm);
        if (sale) setSelectedSale(sale); else alert("Sale not found");
    };

    const toggleItem = (itemId: string, max: number) => {
        setReturnItems(prev => {
            if (prev.find(i => i.itemId === itemId)) return prev.filter(i => i.itemId !== itemId);
            return [...prev, { itemId, qty: max }];
        });
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="bg-white rounded shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-[#d4d7dc]">
                <div className="px-6 py-4 border-b border-[#d4d7dc] flex justify-between items-center bg-[#f4f5f8]">
                    <h2 className="text-sm font-bold text-[#393a3d] uppercase tracking-wider">Process Return</h2>
                    <button onClick={onClose} className="text-[#8d9096] hover:text-[#d52b1e]"><X size={20} /></button>
                </div>
                <div className="p-6 bg-white border-b border-[#d4d7dc]">
                    <div className="flex gap-3 max-w-lg">
                        <input
                            type="text"
                            placeholder="e.g. REC-1234"
                            className="flex-1 p-2.5 border border-[#babec5] rounded text-sm focus:border-[#0077c5] outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <button onClick={handleSearch} className="bg-[#0077c5] text-white px-6 rounded-full text-xs font-bold hover:bg-[#005da3]">Search</button>
                    </div>
                </div>
                <div className="p-2 overflow-y-auto flex-1 divide-y divide-[#f4f5f8] custom-scrollbar">
                    {selectedSale ? (
                        <div className="p-4 space-y-2">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[11px] font-bold text-[#6b6c7f] uppercase tracking-wider">Select items to refund</p>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">POS Sale</span>
                            </div>
                            {selectedSale.items.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-4 hover:bg-[#f4f5f8] rounded transition-all cursor-pointer group" onClick={() => toggleItem(item.id, item.quantity)}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${returnItems.some(r => r.itemId === item.id) ? 'bg-[#0077c5] border-[#0077c5] text-white' : 'border-[#babec5] bg-white group-hover:border-[#8d9096]'}`}>
                                            {returnItems.some(r => r.itemId === item.id) && <CheckCircle size={14} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-[#393a3d] text-sm">{item.name}</div>
                                            <div className="text-[11px] text-[#6b6c7f]">{item.quantity} units @ ${item.price}</div>
                                        </div>
                                    </div>
                                    <div className="font-bold text-[#393a3d]">${formatNumber(item.quantity * item.price)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-[#8d9096]">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">Search for a sale to begin refund</p>
                        </div>
                    )}
                </div>
                <div className="p-6 bg-[#f4f5f8] border-t border-[#d4d7dc] flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <label className="text-[10px] font-black text-[#6b6c7f] uppercase mb-1">Pay Refund From</label>
                            <select
                                value={refundAccountId}
                                onChange={(e) => setRefundAccountId(e.target.value)}
                                className="p-2 border border-[#babec5] rounded text-sm bg-white font-bold text-[#393a3d] focus:border-[#0077c5] outline-none min-w-[200px]"
                            >
                                {cashBankAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={() => selectedSale && onProcess(selectedSale.id, returnItems, refundAccountId)}
                        disabled={returnItems.length === 0}
                        className="bg-[#d52b1e] text-white px-10 py-3 rounded-full font-bold text-sm uppercase tracking-wider disabled:opacity-50 shadow-sm hover:bg-[#b9251a] transition-all"
                    >
                        Complete Refund
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Variant Selector Modal ---
export const VariantSelectorModal: React.FC<{
    product: Item;
    onSelect: (variant: ProductVariant) => void;
    onClose: () => void;
}> = ({ product, onSelect, onClose }) => {
    const { companyConfig } = useData();
    const currency = companyConfig.currencySymbol;
    const [quantity, setQuantity] = useState(1);

    const isStationery = product.type === 'Stationery' || product.type === 'Product';

    // For products with existing variants, we also skip the configure step
    // Users should set the correct pages/price when creating variants in inventory
    const shouldSkipConfigure = isStationery || (product.variants && product.variants.length > 0);

    const handleVariantClick = (v: ProductVariant) => {
        // Directly select the variant without configure step for stationery/products with variants
        onSelect({ ...normalizeStoredPricing(v as any), quantity } as any);
    };

    return (
        <div className="absolute inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="bg-white rounded shadow-2xl w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden border border-[#d4d7dc]">
                <div className="px-6 py-4 border-b border-[#d4d7dc] flex justify-between items-center bg-[#f4f5f8]">
                    <div>
                        <h2 className="text-sm font-bold text-[#393a3d] uppercase tracking-wider">
                            Select Variant
                        </h2>
                        <p className="text-[10px] text-[#6b6c7f] font-medium">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="text-[#8d9096] hover:text-[#d52b1e]"><X size={20} /></button>
                </div>

                {/* Quantity Selector */}
                <div className="px-6 py-3 bg-white border-b border-[#f4f5f8] flex items-center justify-between">
                    <label className="text-xs font-bold text-[#6b6c7f] uppercase tracking-wider">Quantity to Add</label>
                    <div className="w-32">
                        <input
                            type="number"
                            min="1"
                            className="w-full p-2 border border-[#babec5] rounded text-sm font-bold focus:border-[#0077c5] outline-none text-right"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                    </div>
                </div>

                <div className="p-2 overflow-y-auto flex-1 divide-y divide-[#f4f5f8] custom-scrollbar">
                    {product.variants?.map(v => (
                        <button
                            key={v.id}
                            onClick={() => handleVariantClick(v)}
                            className="w-full text-left px-6 py-4 hover:bg-[#f4f5f8] flex justify-between items-center transition-all group"
                        >
                            <div className="flex-1">
                                <div className="font-bold text-[#393a3d] text-sm">{v.name}</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(v.attributes || {}).map(([key, val]) => (
                                        <span key={key} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#eceef1] text-[#6b6c7f] uppercase">
                                            {key.replace(/_/g, ' ')}: {String(val)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="text-right ml-4">
                                <div className="text-sm font-bold text-[#0077c5]">{currency}{formatNumber(resolveStoredSellingPrice(v as any))}</div>
                                {(product.type === 'Stationery' || product.type === 'Material' || product.type === 'Raw Material' || product.type === 'Product') && (
                                    <div className={`text-[10px] font-medium ${v.stock <= 0 ? 'text-[#d52b1e]' : 'text-[#6b6c7f]'}`}>
                                        {v.stock} in stock
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
