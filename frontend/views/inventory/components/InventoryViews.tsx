import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Edit2, Search, Eye, ArrowUp, ArrowDown, ArrowRight, Ruler, AlertCircle, Copy, Trash2, CheckSquare, Square, Warehouse as WarehouseIcon, MapPin, Package, Truck, ShieldCheck, MoreVertical, ChevronRight, SlidersHorizontal, DollarSign } from 'lucide-react';
import { Item, Warehouse } from '../../../types';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import PreviewButton from '../../../components/PreviewButton';
import { useData } from '../../../context/DataContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHighlight } from '../../../hooks/useHighlight';
import { formatParentProductPrice, formatMaterialItemCost } from '../../../utils/pricing';

const getServiceMaterials = (item: Item, allItems: Item[]): string => {
    const smartPricing = item.smartPricing || (item as any).smartPricingSnapshot;
    if (!smartPricing) return '-';
    
    const materials: string[] = [];
    
    // Resolve Paper
    if (smartPricing.paperItemId) {
        const paper = allItems.find(i => i.id === smartPricing.paperItemId);
        if (paper) {
            materials.push(paper.name.replace(/\s*\d+gsm.*/i, '')); // Clean up paper name
        } else if (Number(smartPricing.paperCost) > 0) {
            materials.push('Paper');
        }
    } else if (Number(smartPricing.paperCost) > 0) {
        materials.push('Paper');
    }
    
    // Resolve Toner
    if (smartPricing.tonerItemId) {
        const toner = allItems.find(i => i.id === smartPricing.tonerItemId);
        if (toner) {
            materials.push(toner.name.replace(/\s*Universal\s*/i, ''));
        } else if (Number(smartPricing.tonerCost) > 0) {
            materials.push('Toner');
        }
    } else if (Number(smartPricing.tonerCost) > 0) {
        materials.push('Toner');
    }
    
    // Resolve Finishing Options
    const finishingEnabled = smartPricing.finishingEnabled || [];
    if (Array.isArray(finishingEnabled) && finishingEnabled.length > 0) {
        finishingEnabled.forEach((id: string) => {
            const name = id
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase());
            materials.push(name);
        });
    } else if (Number(smartPricing.finishingCost) > 0) {
        materials.push('Finishing');
    }
    
    return materials.length > 0 ? materials.join(', ') : '-';
};

interface ItemTableProps {
    items: Item[];
    warehouses: Warehouse[];
    suppliers?: any[];
    onEdit: (item: Item) => void;
    onView: (item: Item) => void;
    onPreview?: (item: Item) => void;
    onDuplicate: (item: Item) => void;
    onDelete: (id: string) => void;
    onBatchDelete: (ids: string[]) => void;
    onAdjust?: (item: Item) => void;
    onChangeType?: (item: Item) => void;
    onLoadToSPE?: (item: Item) => void;
    initialSearch?: string;
}

const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
                setMenuPos(null);
                setActiveSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (openMenuId === id) {
            setOpenMenuId(null);
        } else {
            // Detect CSS zoom on the document root (common in scaled ERP layouts).
            // window.devicePixelRatio alone isn't enough — CSS zoom shifts clientX/Y.
            const root = document.documentElement;
            const rootRect = root.getBoundingClientRect();
            // zoom = rendered width / actual offsetWidth
            const zoom = rootRect.width / root.offsetWidth || 1;

            const x = e.clientX / zoom;
            const y = e.clientY / zoom;

            const menuWidth = 256;
            const menuHeight = 320;
            const vw = window.innerWidth / zoom;
            const vh = window.innerHeight / zoom;

            let finalX = x + 4;
            let finalY = y + 4;
            if (finalX + menuWidth > vw) finalX = x - menuWidth - 4;
            if (finalY + menuHeight > vh) finalY = y - menuHeight - 4;

            setMenuPos({ x: finalX, y: finalY });
            setOpenMenuId(id);
            setActiveSubmenu(null);
        }
    };

    return { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleRowClick, setOpenMenuId };
};

export const SkeletonLoader: React.FC<{ type: 'table' | 'grid' }> = ({ type }) => {
    if (type === 'table') {
        return (
            <div className="flex flex-col bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 animate-pulse">
                <div className="p-3 border-b border-slate-200/60 flex gap-3 bg-slate-50/30">
                    <div className="h-10 w-full md:w-[400px] bg-slate-200 rounded-xl"></div>
                    <div className="ml-auto flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 w-16 bg-slate-200 rounded-lg"></div>)}
                    </div>
                </div>
                <div className="flex-1">
                    <div className="h-10 bg-slate-100/80 border-b border-slate-200/60"></div>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="h-12 border-b border-slate-100/50 flex items-center px-4 gap-4">
                            <div className="h-4 w-4 bg-slate-200 rounded"></div>
                            <div className="h-4 flex-1 bg-slate-200 rounded"></div>
                            <div className="h-4 w-[15%] bg-slate-200 rounded"></div>
                            <div className="h-4 w-[10%] bg-slate-200 rounded"></div>
                            <div className="h-4 w-[15%] bg-slate-200 rounded"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 p-1">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="glass-card p-6 rounded-2xl border border-white/60 animate-pulse">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-slate-200"></div>
                        <div className="flex-1">
                            <div className="h-4 w-24 bg-slate-200 rounded mb-2"></div>
                            <div className="h-3 w-16 bg-slate-100 rounded"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="h-12 bg-slate-50 rounded-xl"></div>
                        <div className="h-12 bg-slate-50 rounded-xl"></div>
                    </div>
                    <div className="h-4 w-full bg-slate-100 rounded"></div>
                </div>
            ))}
        </div>
    );
};

export const ItemTable: React.FC<ItemTableProps> = ({
    items,
    warehouses,
    onEdit,
    onView,
    onPreview,
    onDuplicate,
    onDelete,
    onBatchDelete,
    onAdjust,
    onChangeType,
    onLoadToSPE,
    initialSearch = ''
}) => {
    const { companyConfig, triggerReplenishment, notify, suppliers } = useData();
    const navigate = useNavigate();
    const currency = companyConfig.currencySymbol;

    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'Material' | 'Product' | 'Service' | 'Stationery'>('Product');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [sortField, setSortField] = useState<keyof Item | 'category'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const location = useLocation();
    useHighlight();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleRowClick, setOpenMenuId } = useContextMenu();

const showStockColumn = filterType === 'Material' || filterType === 'Stationery';
    const showServiceColumns = filterType === 'Service';
    const showMaterialColumns = filterType === 'Material';
    const showProductColumns = filterType === 'Product';
    const showStationeryColumns = filterType === 'Stationery';

    const currentItem = (items || []).find((i) => i.id === openMenuId);

    useEffect(() => { if (initialSearch) setSearchTerm(initialSearch); }, [initialSearch]);

    const renderMenu = (item: Item) => {
        if (!menuPos) return null;
        
        const x = menuPos.x;
        const y = menuPos.y;
        const menuWidth = 256;

        const isMaterial = item.type === 'Material' || item.type === 'Raw Material' || item.type === 'Stationery';
        const isProductOrService = item.type === 'Product' || item.type === 'Service';
        const currentType = item.type;
        
        const spaceOnRight = window.innerWidth - (x + menuWidth);
        const submenuDirectionClass = spaceOnRight < 160 ? "right-full" : "left-full";

        return ReactDOM.createPortal(
            <div
                ref={menuRef}
                className="w-64 bg-white rounded-xl shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left"
                style={{ position: 'fixed', top: y, left: x, zIndex: 99999 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-tight bg-slate-50/50 rounded-t-xl">ITEM ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); onView(item); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><Eye size={14} /> View Details</button>
                <button onClick={() => { setOpenMenuId(null); onEdit(item); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Item</button>
                {isProductOrService && onLoadToSPE && (
                    <button onClick={() => { setOpenMenuId(null); onLoadToSPE(item); }} className="w-full text-left px-4 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 flex items-center gap-3 transition-colors"><DollarSign size={14} /> Load to SPE</button>
                )}
                {isMaterial && onAdjust && (
                    <button onClick={() => { setOpenMenuId(null); onAdjust(item); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><SlidersHorizontal size={14} /> Adjust Stock</button>
                )}
                <div className="relative group">
                    <button className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors">
                        <span className="flex items-center gap-3"><ArrowRight size={14} /> Change Type</span>
                        <ChevronRight size={12} />
                    </button>
                    <div className={`absolute ${submenuDirectionClass} top-0 hidden group-hover:block w-40 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-left z-[80]`}>
                        <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-tight bg-slate-50/50">CHANGE TYPE</div>
                        {['Product', 'Service', 'Material', 'Stationery'].map(t => (
                            <button key={t} onClick={() => { setOpenMenuId(null); onChangeType && onChangeType(item); }} className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-2 transition-colors ${currentType === t ? 'text-blue-600 bg-blue-50' : 'text-slate-700'}`}>
                                {currentType === t && <CheckSquare size={12} />}
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); onDuplicate(item); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><Copy size={14} /> Duplicate Item</button>

                {!item.isProtected && (
                    <>
                        <div className="my-1 border-t border-slate-200"></div>
                        <button onClick={() => { setOpenMenuId(null); onDelete(item.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
                    </>
                )}
            </div>,
            document.body
        );
    };

    const handleSmartReplenish = async (item: Item) => {
        try {
            await triggerReplenishment(item.id);
            navigate('/purchases');
        } catch (e) {
            // Error handled in context
        }
    };

    const handleSort = (field: keyof Item | 'category') => {
        if (sortField === field) { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortField(field); setSortDirection('asc'); }
    };

    const handleToggleSelect = (id: string) => {
        const item = items.find(i => i.id === id);
        if (item?.isProtected) {
            notify('warning', 'Protected items cannot be selected for deletion');
            return;
        }
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const handleSelectAll = () => {
        const selectableItems = currentItems.filter(i => !i.isProtected);
        setSelectedIds(selectedIds.length === selectableItems.length ? [] : selectableItems.map(i => i.id));
    };

    const handleToggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = item.type === filterType || (showMaterialColumns && (item.type === 'Material' || item.type === 'Raw Material')) || (showStationeryColumns && item.type === 'Stationery');
        return matchesSearch && matchesType;
    }).sort((a, b) => {
        let valA = a[sortField as keyof Item];
        let valB = b[sortField as keyof Item];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const itemsPerPage = 50;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(filteredItems, itemsPerPage);

    const renderSortIcon = (field: keyof Item | 'category') => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp size={10} className="inline ml-1" /> : <ArrowDown size={10} className="inline ml-1" />;
    };

    return (
        <div className="flex flex-col bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60">
            {/* Context menu rendered outside table DOM to avoid tbody nesting issues */}
            {openMenuId && menuPos && currentItem && renderMenu(currentItem)}
            <div className="p-3 border-b border-slate-200/60 flex gap-3 flex-wrap items-center bg-slate-50/30">
                <div className="relative flex-1 md:w-[400px] min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search items..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none text-[13px] bg-white/80 backdrop-blur h-10 font-normal"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {selectedIds.length > 0 && (
                    <button
                        onClick={() => { onBatchDelete(selectedIds); setSelectedIds([]); }}
                        className="flex items-center gap-1 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[13px] font-medium hover:bg-red-100 transition-colors"
                    >
                        <Trash2 size={14} /> Delete ({selectedIds.length})
                    </button>
                )}

                <div className="flex items-center gap-1 overflow-x-auto ml-auto bg-white/50 p-1 rounded-xl border border-white/60">
                    {['Product', 'Material', 'Stationery', 'Service'].map(type => (
                        <button key={type} onClick={() => setFilterType(type as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap uppercase tracking-tight ${filterType === type ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-white/80'}`}>{type}</button>
                    ))}
                </div>
            </div>
            <div>
                <table className="w-full text-left table-fixed">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/60 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="table-header px-4 py-2 w-12 text-center">
                                <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                                    {selectedIds.length > 0 && selectedIds.length === currentItems.length ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                </button>
                            </th>
                            {showServiceColumns ? (
                                <>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="table-header px-4 py-2 w-[24%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Service Name {renderSortIcon('name')}</th>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600">Materials Used</th>
                                    <th className="table-header px-4 py-2 w-[16%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('price')}>Base Price {renderSortIcon('price')}</th>
                                    <th className="table-header px-4 py-2 w-[12%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('salesCount' as any)}>Units {renderSortIcon('salesCount' as any)}</th>
                                    <th className="table-header px-4 py-2 w-[12%]">Status</th>
                                </>
                            ) : showMaterialColumns ? (
                                <>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="table-header px-4 py-2 w-[22%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Material Name {renderSortIcon('name')}</th>
                                    <th className="table-header px-4 py-2 w-[16%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="table-header px-4 py-2 w-[10%] text-center">Unit</th>
                                    <th className="table-header px-4 py-2 w-[12%] cursor-pointer hover:text-blue-600 text-center" onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>
                                    <th className="table-header px-4 py-2 w-[14%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('cost')}>Cost Price {renderSortIcon('cost')}</th>
                                    <th className="table-header px-4 py-2 w-[12%]">Status</th>
                                </>
                            ) : showProductColumns ? (
                                <>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="table-header px-4 py-2 w-[24%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Product Name {renderSortIcon('name')}</th>
                                    <th className="table-header px-4 py-2 w-[16%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="table-header px-4 py-2 w-[14%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('price')}>Selling Price {renderSortIcon('price')}</th>
                                    <th className="table-header px-4 py-2 w-[10%] text-center">Unit</th>
                                    <th className="table-header px-4 py-2 w-[12%]">Status</th>
                                </>
                            ) : showStationeryColumns ? (
                                <>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    <th className="table-header px-4 py-2 w-[22%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Item Name {renderSortIcon('name')}</th>
                                    <th className="table-header px-4 py-2 w-[14%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('category')}>Category {renderSortIcon('category')}</th>
                                    <th className="table-header px-4 py-2 w-[8%] text-center">Unit</th>
                                    <th className="table-header px-4 py-2 w-[10%] cursor-pointer hover:text-blue-600 text-center" onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>
                                    <th className="table-header px-4 py-2 w-[12%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('cost')}>Cost Price {renderSortIcon('cost')}</th>
                                    <th className="table-header px-4 py-2 w-[12%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('price')}>Selling Price {renderSortIcon('price')}</th>
                                    <th className="table-header px-4 py-2 w-[8%]">Status</th>
                                </>
                            ) : (
                                <>
                                    <th className="table-header px-4 py-2 w-1/3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Name {renderSortIcon('name')}</th>
                                    <th className="table-header px-4 py-2 w-[15%] cursor-pointer hover:text-blue-600" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</th>
                                    {showStockColumn && <th className="table-header px-4 py-2 w-[10%] cursor-pointer hover:text-blue-600 text-center" onClick={() => handleSort('stock')}>Stock {renderSortIcon('stock')}</th>}
                                    <th className="table-header px-4 py-2 w-[15%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('price')}>Price {renderSortIcon('price')}</th>
                                    <th className="table-header px-4 py-2 w-[10%] text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('salesCount' as any)}>Units {renderSortIcon('salesCount' as any)}</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50">
                        {currentItems.length === 0 ? (
                            <tr>
                                <td colSpan={showMaterialColumns || showProductColumns || showServiceColumns || showStationeryColumns ? 8 : (showStockColumn ? 6 : 5)} className="px-4 py-20 text-center">
                                    <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                                            <Package size={32} strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <p className="text-slate-900 font-bold text-[13px]">No items found</p>
                                            <p className="text-[10px] font-bold uppercase tracking-tight">Try adjusting your search or filter</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : currentItems.map(item => {
                            const isLowStock = item.stock <= item.minStockLevel;
                            const isSelected = selectedIds.includes(item.id);
                            const isExpanded = expandedIds.includes(item.id);
                            const hasVariants = item.isVariantParent && item.variants && item.variants.length > 0;

                            return (
                                <React.Fragment key={`${item.id}-${item.sku}`}>
                                    {showServiceColumns ? (
                                        <tr  
                                            id={`item-${item.id}`}
                                            className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/40' : 'hover:bg-amber-50/30'} ${item.isProtected ? 'opacity-95' : ''}`}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                        >
                                            <td className="table-body-cell text-center" onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} className="text-slate-400 mx-auto" />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} className="text-blue-600 mx-auto" /> : <Square size={16} className="text-slate-300 mx-auto hover:text-slate-500" />
                                                )}
                                            </td>
                                            <td className="table-body-cell text-slate-500 font-mono truncate">{(item as any).serviceSku || item.sku}</td>
                                            <td className="table-body-cell font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                                <div className="flex items-center gap-2">
                                                    {item.isProtected && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                                    <div className="truncate">{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="table-body-cell text-slate-600 truncate">{getServiceMaterials(item, items)}</td>
                                            <td className={`table-body-cell text-right finance-nums font-bold text-green-600`}>
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="table-body-cell text-right finance-nums font-bold text-slate-600">
                                                {(item.salesCount || 0).toLocaleString()}
                                            </td>
                                            <td className="table-body-cell">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${
                                                    item.status === 'Active' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                    item.status === 'Inactive' ? 'bg-red-100 text-red-700 border border-red-200' :
                                                    'bg-amber-100 text-amber-700 border border-amber-200'
                                                }`}>
                                                    {item.status || 'Active'}
                                                </span>
                                            </td>
                                        </tr>
                                    ) : showMaterialColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/40' : 'hover:bg-amber-50/30'} ${item.isProtected ? 'opacity-95' : ''}`}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                        >
                                            <td className="table-body-cell text-center" onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} className="text-slate-400 mx-auto" />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} className="text-blue-600 mx-auto" /> : <Square size={16} className="text-slate-300 mx-auto hover:text-slate-500" />
                                                )}
                                            </td>
                                            <td className="table-body-cell text-slate-500 font-mono truncate">{item.sku}</td>
                                            <td className="table-body-cell font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                                <div className="flex items-center gap-2">
                                                    {item.isProtected && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                                    <div className="truncate">{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="table-body-cell text-slate-500 truncate">{item.category || '-'}</td>
                                            <td className="table-body-cell text-center text-slate-600">
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded border border-slate-200 uppercase">{item.unit}</span>
                                            </td>
                                            <td className="table-body-cell text-center finance-nums font-bold text-slate-600">
                                                {item.stock.toLocaleString()}
                                                {isLowStock && <AlertCircle size={12} className="inline ml-1 text-red-500" />}
                                            </td>
                                            <td className="table-body-cell text-right finance-nums font-bold text-red-600">
                                                {formatMaterialItemCost(item, currency)}
                                            </td>
                                            <td className="table-body-cell">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${
                                                    item.status === 'Active' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                    item.status === 'Inactive' ? 'bg-red-100 text-red-700 border border-red-200' :
                                                    'bg-amber-100 text-amber-700 border border-amber-200'
                                                }`}>
                                                    {item.status || 'Active'}
                                                </span>
                                            </td>
                                        </tr>
                                    ) : showProductColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/40' : 'hover:bg-amber-50/30'} ${item.isProtected ? 'opacity-95' : ''}`}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                        >
                                            <td className="table-body-cell text-center" onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} className="text-slate-400 mx-auto" />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} className="text-blue-600 mx-auto" /> : <Square size={16} className="text-slate-300 mx-auto hover:text-slate-500" />
                                                )}
                                            </td>
                                            <td className="table-body-cell text-slate-500 font-mono truncate">{item.sku}</td>
                                            <td className="table-body-cell font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                                <div className="flex items-center gap-2">
                                                    {item.isProtected && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                                    <div className="truncate">{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="table-body-cell text-slate-500 truncate">{item.category || '-'}</td>
                                            <td className={`table-body-cell text-right finance-nums font-bold text-green-600`}>
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="table-body-cell text-center text-slate-600">
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded border border-slate-200 uppercase">{item.unit}</span>
                                            </td>
                                            <td className="table-body-cell">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${
                                                    item.status === "Active" ? "bg-green-100 text-green-700 border border-green-200" :
                                                    item.status === "Inactive" ? "bg-red-100 text-red-700 border border-red-200" :
                                                    "bg-amber-100 text-amber-700 border border-amber-200"
                                                }`}>
                                                    {item.status || "Active"}
                                                </span>
                                            </td>
                                        </tr>
                                    ) : showStationeryColumns ? (
                                        <tr
                                            id={`item-${item.id}`}
                                            className={`transition-colors cursor-pointer group ${isSelected ? "bg-blue-50/40" : "hover:bg-amber-50/30"} ${item.isProtected ? "opacity-95" : ""}`}
                                            onClick={(e) => handleRowClick(e, item.id)}
                                            onContextMenu={(e) => handleRowClick(e, item.id)}
                                        >
                                            <td className="table-body-cell text-center" onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                                {item.isProtected ? (
                                                    <ShieldCheck size={16} className="text-slate-400 mx-auto" />
                                                ) : (
                                                    isSelected ? <CheckSquare size={16} className="text-blue-600 mx-auto" /> : <Square size={16} className="text-slate-300 mx-auto hover:text-slate-500" />
                                                )}
                                            </td>
                                            <td className="table-body-cell text-slate-500 font-mono truncate">{item.sku}</td>
                                            <td className="table-body-cell font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                                <div className="flex items-center gap-2">
                                                    {item.isProtected && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                                    <div className="truncate">{item.name}</div>
                                                </div>
                                            </td>
                                            <td className="table-body-cell text-slate-500 truncate">{item.category || "-"}</td>
                                            <td className="table-body-cell text-center text-slate-600">
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded border border-slate-200 uppercase">{item.unit}</span>
                                            </td>
                                            <td className="table-body-cell text-center finance-nums font-bold text-slate-600">
                                                {item.stock.toLocaleString()}
                                                {isLowStock && <AlertCircle size={12} className="inline ml-1 text-red-500" />}
                                            </td>
                                            <td className="table-body-cell text-right finance-nums font-bold text-red-600">
                                                {formatMaterialItemCost(item, currency)}
                                            </td>
                                            <td className="table-body-cell text-right finance-nums font-bold text-green-600">
                                                {formatParentProductPrice(item, currency)}
                                            </td>
                                            <td className="table-body-cell">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${
                                                    item.status === "Active" ? "bg-green-100 text-green-700 border border-green-200" :
                                                    item.status === "Inactive" ? "bg-red-100 text-red-700 border border-red-200" :
                                                    "bg-amber-100 text-amber-700 border border-amber-200"
                                                }`}>
                                                    {item.status || "Active"}
                                                </span>
                                            </td>
                                        </tr>
                                    ) : ( 
                                        <tr
                                        className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/40' : 'hover:bg-amber-50/30'} ${isExpanded ? 'bg-amber-50/20' : ''} ${item.isProtected ? 'opacity-95' : ''}`}
                                        onClick={(e) => handleRowClick(e, item.id)}
                                        onContextMenu={(e) => handleRowClick(e, item.id)}
                                    >
                                        <td className="table-body-cell text-center" onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.id); }}>
                                            {item.isProtected ? (
                                                <ShieldCheck size={16} className="text-slate-400 mx-auto" />
                                            ) : (
                                                isSelected ? <CheckSquare size={16} className="text-blue-600 mx-auto" /> : <Square size={16} className="text-slate-300 mx-auto hover:text-slate-500" />
                                            )}
                                        </td>
                                        <td className="table-body-cell font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                            <div className="flex items-center gap-2">
                                                {item.isProtected && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                                {hasVariants && (
                                                    <button
                                                        onClick={(e) => handleToggleExpand(e, item.id)}
                                                        className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400"
                                                    >
                                                        {isExpanded ? <ArrowDown size={12} /> : <ArrowRight size={12} />}
                                                    </button>
                                                )}
                                                <div className="truncate">
                                                    {item.name}
                                                    {hasVariants && <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md border border-blue-100 uppercase tracking-tight">Variants: {item.variants?.length}</span>}
                                                    {item.isLargeFormat && <div className="text-[10px] text-indigo-500 flex items-center gap-1 mt-0.5 font-bold uppercase tracking-tight"><Ruler size={10} /> Roll: {item.rollWidth}cm</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="table-body-cell text-slate-500 font-mono truncate">{item.sku}</td>
                                        {showStockColumn && (
                                        <td className="table-body-cell text-center finance-nums font-bold text-slate-600">
                                            <>
                                                {item.stock.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.unit}</span>
                                                {isLowStock && <AlertCircle size={12} className="inline ml-1 text-red-500" />}
                                            </>
                                        </td>
                                        )}
                                        <td className={`table-body-cell text-right finance-nums font-bold ${(item.type === 'Raw Material' || item.type === 'Material') ? 'text-red-600' : 'text-green-600'}`}>
                                            {(item.type === 'Raw Material' || item.type === 'Material') ? formatMaterialItemCost(item, currency) : formatParentProductPrice(item, currency)}
                                            {(item.pricingConfig as any)?.manualOverride && (
                                                <span className="ml-1 text-[9px] text-blue-600 font-bold" title="Manual Override">*</span>
                                            )}
                                        </td>
                                        {/* Units Remaining / Sales column */}
                                        <td className="table-body-cell text-right finance-nums font-bold text-slate-600">
                                            {(item.type === 'Raw Material' || item.type === 'Material') 
                                                ? Math.max(0, (item.stock || 0) - (item.reserved || 0)).toLocaleString()
                                                : (item.salesCount || 0).toLocaleString()
                                            }
                                        </td>
                                    </tr>
                                )}

                                {isExpanded && hasVariants && !showServiceColumns && item.variants?.map((variant: any) => (
                                        <tr key={variant.id} id={`variant-${variant.id}`} className="bg-slate-50/50 hover:bg-blue-50/30 transition-colors border-l-4 border-blue-400 group/variant">
                                            <td className="table-body-cell"></td>
                                            <td className="table-body-cell pl-12">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                                    <span className="font-bold text-slate-600">{variant.name}</span>
                                                    <div className="flex gap-1">
                                                        {Object.entries(variant.attributes || {}).map(([k, v]) => (
                                                            <span key={k} className="text-[10px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded uppercase font-bold tracking-tight">{k}: {String(v)}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="table-body-cell font-mono text-slate-400">{variant.sku}</td>
                                            {showStockColumn && (
                                            <td className="table-body-cell text-center finance-nums font-bold text-slate-600">
                                                <>{variant.stock.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.unit}</span></>
                                            </td>
                                            )}
                                             <td className={`table-body-cell text-right finance-nums font-bold ${(item.type === 'Raw Material' || item.type === 'Material') ? 'text-red-600' : 'text-green-600'}`}>
                                                {currency}{((item.type === 'Raw Material' || item.type === 'Material') ? variant.cost : variant.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                             </td>
                                            <td className="table-body-cell text-right finance-nums text-slate-500 font-medium">
                                                {(item.type === 'Raw Material' || item.type === 'Material')
                                                    ? Math.max(0, ((variant as any).stock || 0) - ((variant as any).reserved || 0)).toLocaleString()
                                                    : (variant.salesCount || 0).toLocaleString()
                                            }
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )
                        })
                    }
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
        </div>
    );
};

export const WarehouseGrid: React.FC<{ warehouses: Warehouse[]; inventory: Item[]; }> = ({ warehouses, inventory }) => {
    if (warehouses.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-slate-400 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 mb-4">
                    <WarehouseIcon size={40} strokeWidth={1.5} />
                </div>
                <h3 className="text-slate-900 font-semibold text-lg">No Warehouses Defined</h3>
                <p className="text-sm max-w-xs text-center mt-1">Add a warehouse to start tracking stock across multiple locations.</p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 p-1">
            {warehouses.map(wh => {
                const stockCount = inventory.reduce((sum, item) => { const loc = item.locationStock?.find(l => l.warehouseId === wh.id); return sum + (loc ? loc.quantity : 0); }, 0);
                const distinctItems = inventory.filter(i => i.locationStock?.some(l => l.warehouseId === wh.id && l.quantity > 0)).length;
                return (
                    <div key={wh.id} className="glass-card p-6 rounded-2xl hover:shadow-float transition-all duration-300 group border border-white/60">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm">
                                    <WarehouseIcon size={24} />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold text-slate-800">{wh.name}</h3>
                                    <p className="text-[10px] text-slate-400 font-mono uppercase font-normal">{wh.id}</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200 uppercase tracking-widest">{wh.type}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-3 bg-slate-50/50 rounded-xl text-center border border-slate-100">
                                <div className="text-[13px] font-bold text-slate-800 finance-nums">{stockCount.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Units</div>
                            </div>
                            <div className="p-3 bg-slate-50/50 rounded-xl text-center border border-slate-100">
                                <div className="text-[13px] font-bold text-slate-800 finance-nums">{distinctItems.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">SKUs</div>
                            </div>
                        </div>
                        <div className="text-[12.5px] text-slate-400 border-t border-slate-100 pt-4 flex items-center gap-2 font-normal">
                            <MapPin size={14} /> <span className="font-medium text-slate-600">{wh.location}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    );
};
