
import React, { useState, useEffect } from 'react';
import { Search, Plus, PauseCircle, Printer, Book, Scissors, Image, Layout, PenTool, Box, Briefcase, Layers, FileText, Grid, Hash } from 'lucide-react';
import { Item, ProductVariant } from '../../../types';
import { useData } from '../../../context/DataContext';
import { useKeyboardListNavigation } from '../../../hooks/useKeyboardListNavigation';
import { VariantSelectorModal, PrintingVariantModal } from './PosModals';

import { formatNumber } from '../../../utils/helpers';
import { resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredSellingPrice } from '../../../utils/pricing';
import { getSnapshotCalculatedAmount, resolveItemAdjustmentSnapshots } from '../../../utils/pricingBreakdown';

interface ProductGridProps {
    inventory: Item[];
    addToCart: (item: Item) => void;
    onConfigureService: (item: Item) => void;
    onRecall: () => void;
    heldCount: number;
    onZReport: () => void;
}

type ViewMode = 'Large' | 'Small' | 'List';

export const ProductGrid: React.FC<ProductGridProps> = ({ inventory, addToCart, onConfigureService, onRecall, heldCount, onZReport }) => {
    const { companyConfig, boms } = useData();
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const currency = companyConfig.currencySymbol;
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [viewMode, setViewMode] = useState<ViewMode>('Large');
    const [selectedProductForVariants, setSelectedProductForVariants] = useState<Item | null>(null);

    // Quick Item Entry: Auto-focus search on mount and after item add
    useEffect(() => {
        if (companyConfig.transactionSettings?.quickItemEntry) {
            searchInputRef.current?.focus();
        }
    }, [companyConfig.transactionSettings?.quickItemEntry]);

    const saleableInventory = inventory.filter(i => i.type && i.type !== 'Material' && i.type !== 'Raw Material');
    const typeCategories = ['All', 'Service', 'Product', 'Package', 'Rental'];
    const categories = ['All', ...Array.from(new Set(saleableInventory.map(i => i.category).filter(Boolean)))];

    const filteredProducts = saleableInventory.filter(p =>
        (activeCategory === 'All' || p.category === activeCategory || p.type === activeCategory) &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const gridCols = viewMode === 'List' ? 1 : viewMode === 'Small' ? 8 : (companyConfig.transactionSettings?.pos?.gridColumns || 5);

    const handleItemClick = (item: Item) => {
        const itemType = item.type || item.category || '';
        const isService = itemType === 'Service' || item.category === 'Service';
        console.log('handleItemClick called', itemType, item.name, 'isVariantParent:', item.isVariantParent, 'isService:', isService);
        if (item.isVariantParent) {
            setSelectedProductForVariants(item);
        } else if (isService) {
            console.log('Calling onConfigureService for:', item.name);
            onConfigureService(item);
        } else {
            addToCart(item);
        }
    };

    const handleVariantSelect = (variant: ProductVariant) => {
        if (!selectedProductForVariants) return;

        const adjustmentSnapshots = resolveItemAdjustmentSnapshots(variant as any);
        const adjustmentTotal = Number(
            (variant as any).smartPricingSnapshot?.marketAdjustmentTotal
            ?? (variant as any).adjustmentTotal
            ?? adjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
        );

        // Convert variant to Item with parentId for stock reservation
        // Include variant-specific adjustment data for margin tracking
        const variantItem: any = {
            ...selectedProductForVariants,
            id: variant.id,
            parentId: selectedProductForVariants.id,
            sku: variant.sku,
            name: variant.name,
            price: resolveStoredSellingPrice(variant as any) || 0,
            cost: resolveStoredCost(variant as any) || 0,
            cost_price: resolveStoredCost(variant as any) || 0,
            calculated_price: resolveStoredCalculatedPrice(variant as any) || 0,
            selling_price: resolveStoredSellingPrice(variant as any) || 0,
            rounding_difference: variant.rounding_difference,
            rounding_method: variant.rounding_method,
            stock: variant.stock,
            isVariantParent: false,
            variants: [],
            // ✅ Variant-specific adjustment data
            adjustmentSnapshots,
            adjustmentTotal,
            smartPricingSnapshot: (variant as any).smartPricingSnapshot,
            productionCostSnapshot: variant.productionCostSnapshot,
            pagesOverride: variant.pages,
            pricingSource: variant.pricingSource,
            quantity: (variant as any).quantity || 1 // Use selected quantity or default to 1
        };

        addToCart(variantItem);
        setSelectedProductForVariants(null);
    };

    const { activeIndex, setActiveIndex } = useKeyboardListNavigation({
        itemCount: filteredProducts.length,
        columns: gridCols,
        onSelect: (index) => handleItemClick(filteredProducts[index])
    });

    const getCategoryIcon = (cat: string | undefined) => {
        const lower = (cat || '').toLowerCase();
        if (lower.includes('print') || lower.includes('paper')) return <Printer size={12} />;
        if (lower.includes('book') || lower.includes('binding')) return <Book size={12} />;
        if (lower.includes('design')) return <PenTool size={12} />;
        if (lower.includes('large') || lower.includes('banner')) return <Image size={12} />;
        if (lower.includes('cut') || lower.includes('finish')) return <Scissors size={12} />;
        if (lower.includes('service')) return <Briefcase size={12} />;
        if (lower.includes('material')) return <Layers size={12} />;
        return <Box size={12} />;
    };

    const renderItems = (items: Item[]) => (
        items.map((item, idx) => (
            <button
                key={item.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleItemClick(item)}
                disabled={item.stock <= 0 && (item.type === 'Stationery' || item.type === 'Material' || item.type === 'Raw Material') && !item.isVariantParent}
                className={`relative bg-white border transition-all group overflow-hidden text-left flex flex-col h-full rounded-xl
                ${activeIndex === idx ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-400'}
                ${item.stock <= 0 && (item.type === 'Stationery' || item.type === 'Material' || item.type === 'Raw Material') ? 'opacity-60 grayscale cursor-not-allowed' : 'active:bg-slate-100'}
                ${viewMode === 'List' ? 'flex-row items-center p-2 gap-3 min-h-[50px]' : 'p-3'}
            `}
            >
                {companyConfig.transactionSettings?.pos?.showItemImages && viewMode !== 'List' && (
                    <div className="w-full aspect-square bg-slate-50 mb-2 overflow-hidden flex items-center justify-center border border-slate-200 rounded-lg">
                        {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <Box size={24} className="text-slate-400" />
                        )}
                    </div>
                )}
                <div className={`flex flex-col flex-1 ${viewMode === 'List' ? 'flex-row items-center justify-between w-full' : ''}`}>
                    <div className={viewMode === 'List' ? 'flex-1' : ''}>
                        <div className="flex items-start gap-2 mb-1">
                            <div className={`p-1.5 rounded bg-slate-100 text-slate-500 group-hover:bg-slate-200 transition-colors`}>
                                {getCategoryIcon(item.category)}
                            </div>
                            <div className={`font-semibold text-slate-800 leading-snug line-clamp-2 ${viewMode === 'Small' ? 'text-[11px]' : 'text-xs'}`}>
                                {item.name}
                            </div>
                        </div>
                        {viewMode !== 'Small' && <div className="text-[10px] text-slate-500 ml-8">{item.sku}</div>}
                    </div>

<div className={`flex items-center justify-between ${viewMode === 'List' ? 'gap-4' : 'mt-2 pt-2 border-t border-[#f4f5f8]'}`}>
                        {item.isVariantParent ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                className="text-[9px] font-bold px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                                View
                            </button>
                        ) : (
                            <span className={`font-bold text-slate-800 ${viewMode === 'Small' ? 'text-xs' : 'text-sm'}`}>
                                {currency}{formatNumber(resolveStoredSellingPrice(item as any) || 0)}
                                {(item.type === 'Service' || item.category === 'Service') && item.pages ? '/page' : ''}
                            </span>
                        )}
                        <div className="flex items-center gap-2">
                            {(item.type === 'Stationery' || item.type === 'Material' || item.type === 'Raw Material') && (
                                <span className={`text-[10px] font-medium ${item.stock <= item.minStockLevel ? 'text-red-600' : 'text-slate-500'}`}>
                                    {item.stock} {item.unit}
                                </span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${item.type === 'Raw Material' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                {(item.type || '?').charAt(0)}
                            </span>
                        </div>
                    </div>
                </div>
                {item.stock <= 0 && (item.type === 'Stationery' || item.type === 'Material') && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-[0.5px] z-10">
                        <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">Out of Stock</span>
                    </div>
                )}
            </button>
        ))
    );

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
            <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap gap-4 items-center sticky top-0 z-40">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all text-sm outline-none placeholder-slate-400"
                        placeholder="Find items (Alt+S)..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onFocus={() => setActiveIndex(-1)}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                        {(['Large', 'Small', 'List'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`p-2 transition-all border-r last:border-r-0 ${viewMode === mode ? 'bg-slate-100 text-slate-800' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                                title={`${mode} View`}
                            >
                                {mode === 'Large' ? <Grid size={14} /> : mode === 'Small' ? <Layout size={14} /> : <FileText size={14} />}
                            </button>
                        ))}
                    </div>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <button onClick={onRecall} className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm font-semibold">
                        <PauseCircle size={16} /> Recall ({heldCount})
                    </button>
                </div>
            </div>

            {companyConfig.transactionSettings?.pos?.showCategoryFilters !== false && (
                <div className="bg-white border-b border-slate-200 overflow-x-auto no-scrollbar z-30 sticky top-[61px]">
                    <div className="flex gap-1 px-6 py-2">
                        {categories.map(cat => {
                            const isActive = activeCategory === cat;
                            return (
                                <button
                                    key={cat as string}
                                    onClick={() => { setActiveCategory(cat as string); setActiveIndex(-1); }}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all text-xs font-semibold
                                  ${isActive
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    {cat !== 'All' && <div className={isActive ? 'text-white' : 'text-slate-400'}>
                                        {getCategoryIcon(cat as string)}
                                    </div>}
                                    <span className="whitespace-nowrap">{cat as string}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid gap-4 content-start pb-20" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                    {renderItems(filteredProducts)}
                </div>
            </div>

            {selectedProductForVariants && (
                selectedProductForVariants.variants && selectedProductForVariants.variants.length > 0 ? (
                    <VariantSelectorModal
                        product={selectedProductForVariants}
                        onSelect={handleVariantSelect}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                ) : (
                    <PrintingVariantModal
                        product={selectedProductForVariants}
                        bom={boms.find((b: any) =>
                            b.productId === selectedProductForVariants.id ||
                            (selectedProductForVariants.parentId && b.productId === selectedProductForVariants.parentId)
                        )}
                        materials={inventory}
                        onSelect={(virtualVariant) => {
                            addToCart(virtualVariant);
                            setSelectedProductForVariants(null);
                        }}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                )
            )}
        </div>
    );
};
