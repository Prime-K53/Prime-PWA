import React, { useState, useEffect } from 'react';
import { Plus, ArrowRightLeft, Warehouse as WarehouseIcon, ClipboardCheck, AlertCircle, Sparkles, Loader2, Settings, RefreshCw } from 'lucide-react';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';
import { Item, Warehouse } from '../types';
import { ItemTable, WarehouseGrid, SkeletonLoader } from './inventory/components/InventoryViews';

import ProductDetails from './inventory/components/ProductDetails';
import ItemModal from './inventory/components/ItemModal';
import SmartAdjustModal from './inventory/components/SmartAdjustModal';
import StockAdjustmentModal from './inventory/components/StockAdjustmentModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { suggestRestock } from '../services/geminiService';
import { repairVariantPricing } from '@/utils/pricing/recalculateVariants';
import { generateNextId } from '../utils/helpers';

const Inventory: React.FC = () => {
    const { fetchInventory, fetchProcurementData } = useInventory();
    const { refreshAllData } = useData();
    const navigate = useNavigate();

    // 5-minute poll + focus refresh
    useModuleRefresh(async () => {
        await Promise.allSettled([
            fetchInventory(),
            fetchProcurementData(),
            refreshAllData()
        ]);
    }, { interval: null }); // Disable polling to avoid race condition with lazy loading
    const { inventory, warehouses, addItem, updateItem, transferStock, updateStock, addWarehouse, deleteItem, isLoading, reconcileInventory } = useInventory();
    const { postJournalEntry } = useFinance();
    const { companyConfig, addAuditLog, notify, suppliers } = useData();
    const currency = companyConfig.currencySymbol;

    // Inventory Statistics
    const valuationMethod = companyConfig.inventorySettings?.valuationMethod || 'AVCO';
    const totalValue = inventory.reduce((sum, item) => {
        if (item.variants && item.variants.length > 0) {
            const variantValue = item.variants.reduce((vSum, v) => vSum + ((v.cost || 0) * (v.stock || 0)), 0);
            return sum + variantValue;
        }
        return sum + (item.cost * item.stock);
    }, 0);

    const potentialRevenue = inventory.reduce((sum, item) => {
        if (item.variants && item.variants.length > 0) {
            const variantRevenue = item.variants.reduce((vSum, v) => vSum + ((v.price || 0) * (v.stock || 0)), 0);
            return sum + variantRevenue;
        }
        return sum + (item.price * item.stock);
    }, 0);
    // Exclude printed/print-consumption items from low stock alerts
    const lowStockCount = inventory.filter(item => !(item as any).printConsumptionEnabled && item.stock <= (item.minStockLevel || 0)).length;
    const totalStockUnits = inventory.reduce((sum, item) => sum + item.stock, 0);
    const stockTrackedItems = inventory.filter(item => {
        const type = String(item.type || '');
        return type === 'Stationery' || type === 'Material' || type === 'Raw Material';
    });

    const [activeView, setActiveView] = useState<'Items' | 'Stock' | 'Warehouses'>('Items');

    const [viewMode, setViewMode] = useState<'List' | 'Detail'>('List');
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    const location = useLocation();
    const [isRestockLoading, setIsRestockLoading] = useState(false);
    const [restockSuggestions, setRestockSuggestions] = useState<any[]>([]);
    const [showRestockPanel, setShowRestockPanel] = useState(false);

    const { sales } = useData();

    const handleSmartRestock = async () => {
        setIsRestockLoading(true);
        setShowRestockPanel(true);
        try {
            const suggestions = await suggestRestock(inventory, sales || []);
            setRestockSuggestions(suggestions);
        } catch (error) {
            notify("Failed to get restock suggestions", "error");
        } finally {
            setIsRestockLoading(false);
        }
    };


    const [initialSearch, setInitialSearch] = useState('');
    const [isRepairing, setIsRepairing] = useState(false);
    const { marketAdjustments, bomTemplates } = useData();

    const handleRepairPricing = async () => {
        if (!window.confirm("This will scan your entire inventory for variants with missing or zero prices and attempt to fix them based on current SmartPricing rules. Proceed?")) return;
        
        setIsRepairing(true);
        try {
            const result = await repairVariantPricing(inventory, marketAdjustments, bomTemplates);
            if (result.updatedVariants > 0) {
                notify(`Successfully updated ${result.updatedVariants} variants across ${result.updatedItems} items.`, "success");
                await fetchInventory(); // Refresh view
            } else if (result.errors.length > 0) {
                notify(`Repair completed with ${result.errors.length} errors.`, "warning");
            } else {
                notify("No variants required repair.", "info");
            }
            
            if (result.errors.length > 0) {
                console.warn('[Pricing Repair] Errors:', result.errors);
            }
        } catch (error: any) {
            notify(`Repair failed: ${error.message}`, "error");
        } finally {
            setIsRepairing(false);
        }
    };

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [editingItem, setEditingItem] = useState<Item | null>(null);

    // Smart Adjust Modal
    const [isSmartAdjustOpen, setIsSmartAdjustOpen] = useState(false);

    // Stock Adjustment Modal
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [adjustingItem, setAdjustingItem] = useState<Item | null>(null);



    useEffect(() => {
        // Handle "Search" Action
        if (location.state && location.state.searchQuery) {
            setInitialSearch(location.state.searchQuery);
        }


        // Clear state to prevent reopening on refresh
        if (location.state) {
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    // ... (Handlers) ...
    const handleViewDetails = (item: Item) => { setSelectedItem(item); setViewMode('Detail'); };
    const handleBackToList = () => { setViewMode('List'); setSelectedItem(null); };
    const handleDeleteItem = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this item?")) return;
        try {
            await deleteItem(id);
            notify("Item deleted successfully", "success");
        } catch (error: any) {
            notify(`Delete failed: ${error?.message || 'Unknown error'}`, "error");
        }
    };
    const handleBatchDelete = async (ids: string[]) => {
        if (!window.confirm(`Are you sure you want to delete ${ids.length} items?`)) return;

        const results = await Promise.allSettled(ids.map(id => deleteItem(id)));
        const failed = results.filter(r => r.status === 'rejected');
        const succeededCount = results.length - failed.length;

        if (succeededCount > 0) {
            notify(`${succeededCount} item${succeededCount === 1 ? '' : 's'} deleted successfully`, "success");
        }
        if (failed.length > 0) {
            notify(`${failed.length} item${failed.length === 1 ? '' : 's'} failed to delete`, "error");
        }
    };

    // Modal handlers
    const handleOpenAddModal = () => {
        setEditingItem(null);
        setModalMode('add');
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (item: Item) => {
        setEditingItem(item);
        setModalMode('edit');
        setIsModalOpen(true);
    };

    const handleLoadToSPE = (item: Item) => {
        navigate('/smart-operations/pricing', { state: { loadProductId: item.id } });
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleSaveItem = async (item: Item) => {
        try {
            await addItem(item);
            notify("Item created successfully", "success");
        } catch (error: any) {
            notify(`Create failed: ${error?.message || 'Unknown error'}`, "error");
            throw error;
        }
    };

    const handleUpdateItem = async (item: Item) => {
        try {
            await updateItem(item);
            notify("Item updated successfully", "success");
        } catch (error: any) {
            notify(`Update failed: ${error?.message || 'Unknown error'}`, "error");
            throw error;
        }
    };

    const handleSmartAdjustSuccess = () => {
        notify("Stock adjustments applied successfully", "success");
    };

    const handleOpenAdjustmentModal = (item: Item) => {
        setAdjustingItem(item);
        setIsAdjustmentModalOpen(true);
    };

    const handleCloseAdjustmentModal = () => {
        setAdjustingItem(null);
        setIsAdjustmentModalOpen(false);
    };

    const handleDuplicate = async (item: Item) => {
        const duplicate: Item = {
            ...item,
            id: generateNextId('ITM', inventory, companyConfig),
            name: `${item.name} (Copy)`,
            sku: item.sku ? `${item.sku}-COPY` : undefined,
            stock: 0,
            reserved: 0,
            variants: item.variants?.map((v: any) => ({
                ...v,
                id: generateNextId('VAR', inventory, companyConfig)
            }))
        };
        try {
            await addItem(duplicate);
            notify("Item duplicated successfully", "success");
        } catch (error: any) {
            notify(`Duplicate failed: ${error?.message || 'Unknown error'}`, "error");
        }
    };

    const handleChangeType = async (item: Item) => {
        const currentType = item.type;
        const typeCycle: Record<string, string[]> = {
            'Product': ['Service'],
            'Service': ['Product'],
            'Material': ['Stationery'],
            'Stationery': ['Material'],
            'Raw Material': ['Stationery'],
        };
        const nextTypes = typeCycle[currentType] || ['Product'];
        const newType = nextTypes[0];
        
        // Preserve all existing fields, including pricingConfig, smartPricing, cost, and price.
        // The pricing engine (masterInventoryPricingService) will handle the specific 
        // logic for the new type during normalization or subsequent edits.
        const updatedItem = { ...item, type: newType as any };
        
        try {
            await updateItem(updatedItem);
            notify(`Type changed to ${newType}`, "success");
        } catch (error: any) {
            notify(`Type change failed: ${error?.message || 'Unknown error'}`, "error");
        }
    };



    if (viewMode === 'Detail' && selectedItem) {
        return (
            <div className="h-full overflow-hidden flex flex-col">
                <ProductDetails
                    item={selectedItem}
                    onBack={handleBackToList}
                    onEdit={handleOpenEditModal}
                    onAdjust={handleOpenAdjustmentModal}
                />
                {/* Item Modal for Detail View */}
                <ItemModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveItem}
                    onUpdate={handleUpdateItem}
                    item={editingItem}
                    warehouses={warehouses}
                    mode={modalMode}
                />
                {/* Stock Adjustment Modal for Detail View */}
                <StockAdjustmentModal
                    isOpen={isAdjustmentModalOpen}
                    onClose={handleCloseAdjustmentModal}
                    item={adjustingItem}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto w-full font-normal overflow-y-auto custom-scrollbar">



            {/* Main Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Inventory Management</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Multi-location tracking and master data list</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button 
                        onClick={handleRepairPricing}
                        disabled={isRepairing}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                            isRepairing 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                        title="Repair Zero Pricing (K0)"
                    >
                        {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        <span>{isRepairing ? 'Repairing...' : 'Repair Pricing'}</span>
                    </button>
                    <button
                        onClick={handleOpenAddModal}
                        className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 text-sm shadow-sm transition-all"
                    >
                        <Plus size={16} />
                        Add Item
                    </button>
                    <button
                        onClick={handleSmartRestock}
                        disabled={isRestockLoading}
                        className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-medium hover:bg-indigo-100 text-sm shadow-sm transition-all border border-indigo-100"
                    >
                        {isRestockLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        Smart Restock
                    </button>
                    <button
                        onClick={() => setIsSmartAdjustOpen(true)}
                        className="flex items-center gap-1.5 bg-purple-50 text-purple-600 px-4 py-2 rounded-xl font-medium hover:bg-purple-100 text-sm shadow-sm transition-all border border-purple-100"
                    >
                        <Settings size={16} />
                        Smart Stock Adjust
                    </button>
                </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
                <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Valuation</div>
                    <div className="text-xl font-bold text-slate-900 finance-nums">{currency}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                        <Plus size={10} className="text-emerald-500" /> At Cost Price
                    </div>
                </div>
                <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Potential Revenue</div>
                    <div className="text-xl font-bold text-slate-900 finance-nums">{currency}{potentialRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                        <Plus size={10} className="text-blue-500" /> At Current Prices
                    </div>
                </div>
                <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Low Stock Alerts</div>
                    <div className={`text-xl font-bold finance-nums ${lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{lowStockCount} Items</div>
                    <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} className={lowStockCount > 0 ? 'text-amber-500' : 'text-slate-400'} /> Below Min Level
                    </div>
                </div>
                <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Units</div>
                    <div className="text-xl font-bold text-slate-900 finance-nums">{totalStockUnits.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                        <Plus size={10} className="text-purple-500" /> Across {warehouses.length} Locations
                    </div>
                </div>
            </div>

            {/* AI Restock Suggestions Panel */}
            {showRestockPanel && (
                <div className="mb-6 bg-indigo-50/50 border border-indigo-100 rounded-[2rem] p-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="text-indigo-600" size={20} />
                            <h2 className="text-lg font-bold text-indigo-900">AI Restock Suggestions</h2>
                        </div>
                        <button onClick={() => setShowRestockPanel(false)} className="text-indigo-400 hover:text-indigo-600">
                            <Plus className="rotate-45" size={20} />
                        </button>
                    </div>

                    {isRestockLoading ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="text-indigo-600 animate-spin mb-2" size={32} />
                            <p className="text-sm text-indigo-600 font-medium">Analyzing sales velocity and stock levels...</p>
                        </div>
                    ) : restockSuggestions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {restockSuggestions.map((suggestion, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-slate-900">{suggestion.name}</h3>
                                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold uppercase finance-nums">{suggestion.sku}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl font-bold text-indigo-600 finance-nums">+{suggestion.suggestedQty}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Suggested Units</span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed italic">"{suggestion.reason}"</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center py-8 text-slate-500 text-sm">No restock suggestions needed at this time. Your inventory levels are optimal.</p>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-white/70 backdrop-blur-md p-1 rounded-2xl border border-white/50 shadow-sm mb-4 w-fit">
                <button onClick={() => setActiveView('Items')} className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeView === 'Items' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                    Master List
                </button>
                <button onClick={() => setActiveView('Stock')} className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeView === 'Stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                    Stock Items
                </button>
                <button onClick={() => setActiveView('Warehouses')} className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeView === 'Warehouses' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                    Warehouses
                </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
                {isLoading ? (
                    <SkeletonLoader type={activeView === 'Warehouses' ? 'grid' : 'table'} />
                ) : activeView === 'Warehouses' ? (
                    <WarehouseGrid warehouses={warehouses} inventory={inventory} />
                ) : (
                    <ItemTable
                        items={activeView === 'Stock' ? stockTrackedItems : inventory}
                        warehouses={warehouses}
                        onEdit={handleOpenEditModal}
                        onView={handleViewDetails}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDeleteItem}
                        onBatchDelete={handleBatchDelete}
                        onAdjust={handleOpenAdjustmentModal}
                        onChangeType={handleChangeType}
                        onLoadToSPE={handleLoadToSPE}
                        initialSearch={initialSearch}
                    />
                )}
            </div>

            {/* Item Modal */}
            <ItemModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveItem}
                onUpdate={handleUpdateItem}
                item={editingItem}
                warehouses={warehouses}
                mode={modalMode}
            />

            {/* Smart Adjust Modal */}
            <SmartAdjustModal
                isOpen={isSmartAdjustOpen}
                onClose={() => setIsSmartAdjustOpen(false)}
                onSuccess={handleSmartAdjustSuccess}
                items={stockTrackedItems}
            />

            {/* Stock Adjustment Modal */}
            <StockAdjustmentModal
                isOpen={isAdjustmentModalOpen}
                onClose={handleCloseAdjustmentModal}
                item={adjustingItem}
            />

        </div>
    );
};

export default Inventory;
