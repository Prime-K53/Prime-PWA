import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Sparkles,
    Loader2,
    CheckCircle,
    AlertCircle,
    TrendingUp,
    TrendingDown,
    RefreshCw,
    Package,
    MapPin
} from 'lucide-react';
import { Item } from '../../../types';
import { useInventory } from '../../../context/InventoryContext';

interface SmartAdjustModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    items: Item[];
}

const SmartAdjustModal: React.FC<SmartAdjustModalProps> = ({ isOpen, onClose, onSuccess, items }) => {
    const { updateStock, warehouses } = useInventory();

    const [applying, setApplying] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'SET'>('ADD');
    const [quantity, setQuantity] = useState<number>(0);
    const [reason, setReason] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('WH-MAIN');
    const [step, setStep] = useState<'preview' | 'applying' | 'success'>('preview');

    useEffect(() => {
        if (!isOpen) return;

        const lowStockIds = items
            .filter(item => (item.stock || 0) <= (item.minStockLevel || 0))
            .map(item => item.id);

        setSelectedItems(lowStockIds.length > 0 ? lowStockIds : items.map(item => item.id));
        setAdjustmentType('ADD');
        setQuantity(0);
        setReason('');
        setSelectedWarehouse(warehouses[0]?.id || 'WH-MAIN');
        setStep('preview');
        setApplying(false);
    }, [isOpen, items, warehouses]);

    const itemById = useMemo(() => {
        const map = new Map<string, Item>();
        items.forEach(item => map.set(item.id, item));
        return map;
    }, [items]);

    const selectedItemRows = useMemo(
        () => selectedItems.map(id => itemById.get(id)).filter(Boolean) as Item[],
        [selectedItems, itemById]
    );

    const getStockChange = (item: Item): number => {
        if (adjustmentType === 'SET') {
            return quantity - (item.stock || 0);
        }
        if (adjustmentType === 'REMOVE') {
            return -Math.abs(quantity);
        }
        return Math.abs(quantity);
    };

    const projectedNetChange = selectedItemRows.reduce((sum, item) => sum + getStockChange(item), 0);
    const projectedNegativeStock = selectedItemRows.some(item => (item.stock || 0) + getStockChange(item) < 0);
    const hasValidQuantity = adjustmentType === 'SET' ? quantity >= 0 : quantity > 0;

    const handleApplyAdjustments = async () => {
        if (selectedItems.length === 0 || !hasValidQuantity) return;

        setApplying(true);
        setStep('applying');

        try {
            const summaryReason = reason.trim() || `Smart stock adjustment (${adjustmentType})`;

            for (const itemId of selectedItems) {
                const item = itemById.get(itemId);
                if (!item) continue;

                const stockChange = getStockChange(item);
                if (stockChange === 0) continue;

                await updateStock(item.id, stockChange, selectedWarehouse, summaryReason, true);
            }

            setStep('success');

            setTimeout(() => {
                onSuccess();
                onClose();
                setStep('preview');
            }, 1500);
        } catch (error) {
            console.error('Error applying adjustments:', error);
            setStep('preview');
            alert('Failed to apply stock adjustments. Please try again.');
        } finally {
            setApplying(false);
        }
    };

    const toggleItem = (id: string) => {
        setSelectedItems(prev =>
            prev.includes(id)
                ? prev.filter(itemId => itemId !== id)
                : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === items.length) {
            setSelectedItems([]);
            return;
        }
        setSelectedItems(items.map(item => item.id));
    };

    const formatTypeLabel = (type: 'ADD' | 'REMOVE' | 'SET') => {
        if (type === 'SET') return 'Set Quantity';
        return type === 'ADD' ? 'Increase Stock' : 'Reduce Stock';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">Smart Stock Adjust</h2>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                Bulk Stock Adjustment Across Inventory
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={applying}
                        className="p-3 hover:bg-white/80 rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90 disabled:opacity-50"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {step === 'applying' ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
                            <p className="text-lg font-bold text-slate-800 mb-2">Applying Stock Adjustments</p>
                            <p className="text-sm text-slate-500">Updating stock levels in inventory records...</p>
                        </div>
                    ) : step === 'success' ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                <CheckCircle className="w-10 h-10 text-green-600" />
                            </div>
                            <p className="text-lg font-bold text-slate-800 mb-2">Stock Adjustments Applied</p>
                            <p className="text-sm text-slate-500">Inventory stock levels have been updated</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Stats */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 rounded-2xl border border-blue-200/50">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase tracking-tight mb-1">
                                        Selected Items
                                    </div>
                                    <div className="text-2xl font-black text-blue-900">{selectedItems.length}</div>
                                </div>
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 rounded-2xl border border-purple-200/50">
                                    <div className="text-[10px] font-bold text-purple-600 uppercase tracking-tight mb-1">
                                        Operation
                                    </div>
                                    <div className="text-lg font-black text-purple-900">{formatTypeLabel(adjustmentType)}</div>
                                </div>
                                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-4 rounded-2xl border border-indigo-200/50">
                                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight mb-1">
                                        Net Change
                                    </div>
                                    <div className="text-2xl font-black text-indigo-900">{projectedNetChange.toFixed(2)}</div>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Warehouse
                                    </label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <select
                                            value={selectedWarehouse}
                                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm appearance-none bg-white"
                                        >
                                            {warehouses.length > 0 ? (
                                                warehouses.map(wh => (
                                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                                ))
                                            ) : (
                                                <option value="WH-MAIN">Main Warehouse</option>
                                            )}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Quantity
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={Number.isNaN(quantity) ? 0 : quantity}
                                        onChange={(e) => setQuantity(Number(e.target.value))}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adjustment Type</label>
                                <div className="flex p-1 bg-slate-100 rounded-lg gap-1">
                                    {(['ADD', 'REMOVE', 'SET'] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setAdjustmentType(type)}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all text-sm font-medium ${adjustmentType === type
                                                ? 'bg-white text-indigo-600 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                                }`}
                                        >
                                            {type === 'ADD' && <TrendingUp size={16} />}
                                            {type === 'REMOVE' && <TrendingDown size={16} />}
                                            {type === 'SET' && <RefreshCw size={16} />}
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Reason (Optional)</label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    rows={2}
                                    placeholder="e.g., Cycle count correction, damaged stock write-off..."
                                />
                            </div>

                            {items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
                                    <p className="text-lg font-bold text-slate-800 mb-2">No Inventory Items</p>
                                    <p className="text-sm text-slate-500 max-w-md">Create inventory items before using Smart Adjust.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                                            Select Items
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={toggleSelectAll}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                                        >
                                            {selectedItems.length === items.length ? 'Clear All' : 'Select All'}
                                        </button>
                                    </div>
                                    {items.map((item) => {
                                        const change = getStockChange(item);
                                        const resultingStock = (item.stock || 0) + change;
                                        const isSelected = selectedItems.includes(item.id);

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => toggleItem(item.id)}
                                                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${isSelected
                                                    ? 'border-indigo-500 bg-indigo-50'
                                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <h4 className="font-bold text-slate-800">{item.name}</h4>
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">
                                                                {item.sku}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <Package size={14} className="text-indigo-600" />
                                                                <span className="font-bold text-slate-700">Current: {item.stock} {item.unit}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {change >= 0 ? (
                                                                    <TrendingUp size={14} className="text-green-600" />
                                                                ) : (
                                                                    <TrendingDown size={14} className="text-red-600" />
                                                                )}
                                                                <span className={`${resultingStock < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                                                    New: {resultingStock.toFixed(2)} {item.unit}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected
                                                        ? 'bg-indigo-600 border-indigo-600'
                                                        : 'border-slate-300'
                                                        }`}>
                                                        {isSelected && (
                                                            <CheckCircle size={14} className="text-white" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {projectedNegativeStock && (
                                <p className="mt-4 text-xs text-amber-600 flex items-center gap-1 font-medium">
                                    <AlertCircle size={12} />
                                    One or more selected items will result in negative stock.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === 'preview' && items.length > 0 && (
                    <div className="px-8 py-6 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                        <div className="text-sm">
                            <p className="font-bold text-slate-800">
                                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                            </p>
                            <p className="text-xs text-slate-500">
                                Net stock change: {projectedNetChange.toFixed(2)}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                disabled={applying}
                                className="px-6 py-3 border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-white transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyAdjustments}
                                disabled={applying || selectedItems.length === 0 || !hasValidQuantity}
                                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={16} />
                                Apply Stock Adjustments
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmartAdjustModal;
