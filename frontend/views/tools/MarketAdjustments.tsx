import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Trash2, Edit2, Save, X, Percent, DollarSign, BarChart3, Clock } from 'lucide-react';
import { dbService } from '../../services/db';
import { MarketAdjustment, MarketAdjustmentTransaction } from '../../types';
import { useData } from '../../context/DataContext';
import { useInventoryStore } from '../../stores/inventoryStore';
import { repriceMasterInventoryFromAdjustments } from '../../services/masterInventoryPricingService';
import { syncMarketAdjustmentsToBackend } from '../../services/examinationSyncService';

const MARKET_ADJUSTMENTS_CHANGED_EVENT = 'market-adjustments:changed';

const MarketAdjustments: React.FC = () => {
    const { notify, refreshMarketAdjustments, companyConfig } = useData();
    const currency = companyConfig?.currencySymbol || '$';
    const refreshInventory = useInventoryStore(state => state.fetchInventory);
    const [adjustments, setAdjustments] = useState<MarketAdjustment[]>([]);
    const [adjustmentStats, setAdjustmentStats] = useState<Map<string, { totalApplied: number; applicationCount: number }>>(new Map());
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [selectedAdjustment, setSelectedAdjustment] = useState<MarketAdjustment | null>(null);
    const [transactionHistory, setTransactionHistory] = useState<MarketAdjustmentTransaction[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [formData, setFormData] = useState<Partial<MarketAdjustment>>({
        name: '',
        type: 'PERCENTAGE',
        value: 0,
        description: '',
        category: 'general',
        adjustmentCategory: 'Custom',
        displayName: '',
        sortOrder: 0,
        active: true
    });

    const broadcastAdjustmentsChanged = (changeType: 'created' | 'updated' | 'deleted' | 'toggled', adjustmentId?: string) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(MARKET_ADJUSTMENTS_CHANGED_EVENT, {
            detail: {
                changeType,
                adjustmentId: adjustmentId || null,
                timestamp: new Date().toISOString()
            }
        }));
    };

    useEffect(() => {
        loadAdjustments();
    }, []);

    const loadAdjustments = async () => {
        try {
            const data = await dbService.getAll<MarketAdjustment>('marketAdjustments');
            setAdjustments(data);

            // Load adjustment statistics from transactions
            const transactions = await dbService.getAll<MarketAdjustmentTransaction>('marketAdjustmentTransactions');
            const statsMap = new Map<string, { totalApplied: number; applicationCount: number }>();

            transactions.forEach(tx => {
                const existing = statsMap.get(tx.adjustmentId) || { totalApplied: 0, applicationCount: 0 };
                statsMap.set(tx.adjustmentId, {
                    totalApplied: existing.totalApplied + tx.calculatedAmount,
                    applicationCount: existing.applicationCount + 1
                });
            });

            setAdjustmentStats(statsMap);
        } catch (error) {
            console.error('Error loading market adjustments:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadTransactionHistory = async (adjustmentId: string) => {
        try {
            const transactions = await dbService.getAll<MarketAdjustmentTransaction>('marketAdjustmentTransactions');
            const filtered = transactions.filter(tx => tx.adjustmentId === adjustmentId);
            setTransactionHistory(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (error) {
            console.error('Error loading transaction history:', error);
            setTransactionHistory([]);
        }
    };

    const generateId = () => {
        return 'adj_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    };

    const repriceMasterInventory = async () => {
        try {
            const result = await repriceMasterInventoryFromAdjustments();
            await refreshInventory();

            if (result.updatedItems > 0 || result.updatedVariants > 0) {
                const parts: string[] = [];
                if (result.updatedItems > 0) parts.push(`${result.updatedItems} items`);
                if (result.updatedVariants > 0) parts.push(`${result.updatedVariants} variants`);
                notify(`Master inventory repriced: ${parts.join(', ')}`, 'success');
            } else {
                notify('Master inventory pricing is already up to date', 'info');
            }
        } catch (error) {
            console.error('Failed to reprice master inventory after adjustment change:', error);
            notify('Adjustment saved but master inventory repricing failed', 'error');
        }
    };

    const syncBackendAdjustments = async () => {
        try {
            const syncResult = await syncMarketAdjustmentsToBackend({ triggerRecalculate: true });
            if (syncResult?.recalculation?.failed > 0) {
                notify(`Adjustments synced but ${syncResult.recalculation.failed} batch recalculation(s) failed`, 'error');
            }
        } catch (error) {
            console.error('Failed to sync market adjustments to backend examination DB:', error);
            notify('Adjustment change saved locally, but backend sync failed', 'error');
        }
    };

    const handleSave = async () => {
        if (!formData.name || formData.value === undefined) {
            notify('Please fill in all required fields', 'error');
            return;
        }

        try {
            const isEditing = Boolean(editingId);
            const adjustment: MarketAdjustment = {
                id: editingId || generateId(),
                name: formData.name,
                type: formData.type as any,
                value: Number(formData.value),
                percentage: formData.type === 'PERCENTAGE' || formData.type === 'PERCENT' || formData.type === 'percentage' ? Number(formData.value) : undefined,
                appliesTo: 'COST',
                active: formData.active ?? true,
                isActive: formData.active ?? true,
                description: formData.description,
                category: formData.category,
                displayName: formData.displayName || formData.name,
                adjustmentCategory: formData.adjustmentCategory,
                sortOrder: formData.sortOrder || 0,
                createdAt: editingId ? adjustments.find(a => a.id === editingId)?.createdAt : new Date().toISOString()
            };

            await dbService.put('marketAdjustments', adjustment);
            await repriceMasterInventory();
            await syncBackendAdjustments();
            notify(isEditing ? 'Market adjustment updated' : 'Market adjustment created', 'success');

            setEditingId(null);
            setShowForm(false);
            setFormData({
                name: '',
                type: 'PERCENTAGE',
                value: 0,
                description: '',
                category: 'general',
                adjustmentCategory: 'Custom',
                displayName: '',
                sortOrder: 0,
                active: true
            });
            loadAdjustments();
            refreshMarketAdjustments?.(); // Refresh DataContext for ItemModal
            broadcastAdjustmentsChanged(isEditing ? 'updated' : 'created', adjustment.id);
        } catch (error) {
            console.error('Error saving adjustment:', error);
            notify('Failed to save adjustment', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this adjustment?')) return;

        try {
            await dbService.delete('marketAdjustments', id);
            await repriceMasterInventory();
            await syncBackendAdjustments();
            notify('Adjustment deleted', 'success');
            loadAdjustments();
            refreshMarketAdjustments?.(); // Refresh DataContext for ItemModal
            broadcastAdjustmentsChanged('deleted', id);
        } catch (error) {
            console.error('Error deleting adjustment:', error);
            notify('Failed to delete adjustment', 'error');
        }
    };

    const handleEdit = (adjustment: MarketAdjustment) => {
        setEditingId(adjustment.id);
        setFormData({
            name: adjustment.name,
            type: adjustment.type as any,
            value: adjustment.value,
            description: adjustment.description,
            category: adjustment.category,
            displayName: adjustment.displayName || adjustment.name,
            adjustmentCategory: adjustment.adjustmentCategory || 'Custom',
            sortOrder: adjustment.sortOrder || 0,
            active: adjustment.active ?? adjustment.isActive
        });
        setShowForm(true);
    };

    const handleViewHistory = async (adjustment: MarketAdjustment) => {
        setSelectedAdjustment(adjustment);
        await loadTransactionHistory(adjustment.id);
        setShowHistory(true);
    };

    const formatCurrency = (amount: number) => {
        // Map common currency symbols used in companyConfig to ISO currency codes
        const symbolToCode: Record<string, string> = {
            '$': 'USD',
            'KES': 'KES',
            'ZAR': 'ZAR',
            'GBP': 'GBP',
            'EUR': 'EUR',
            'UGX': 'UGX',
            'K': 'MWK' // Common single-letter symbol used in some views -> Malawi Kwacha
        };

        const currencyCode = symbolToCode[currency] || currency || 'USD';

        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currencyCode
            }).format(amount || 0);
        } catch (err) {
            // Fallback: when Intl fails (invalid currency code), return a simple formatted string
            return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    };

    const toggleActive = async (adjustment: MarketAdjustment) => {
        try {
            const currentActive = adjustment.active ?? adjustment.isActive ?? false;
            const updated = {
                ...adjustment,
                active: !currentActive,
                isActive: !currentActive
            };
            await dbService.put('marketAdjustments', updated);
            await repriceMasterInventory();
            await syncBackendAdjustments();
            notify(`Adjustment ${updated.active ? 'activated' : 'deactivated'}`, 'success');
            loadAdjustments();
            refreshMarketAdjustments?.(); // Refresh DataContext for ItemModal
            broadcastAdjustmentsChanged('toggled', adjustment.id);
        } catch (error) {
            console.error('Error toggling adjustment:', error);
            notify('Failed to update adjustment', 'error');
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-amber-100 border-t-amber-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 to-amber-50/30 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-100 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Market Adjustments</h1>
                            <p className="text-slate-500">Manage cost adjustments, inflation factors, and surcharges</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setEditingId(null);
                            setFormData({
                                name: '',
                                type: 'PERCENTAGE',
                                value: 0,
                                description: '',
                                category: 'general',
                                active: true
                            });
                            setShowForm(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Adjustment
                    </button>
                </div>

                {/* Form Modal */}
                {showForm && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-700">
                                {editingId ? 'Edit Adjustment' : 'New Adjustment'}
                            </h2>
                            <button
                                onClick={() => setShowForm(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    placeholder="e.g., Inflation Adjustment 2024"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Type *</label>
                                    <select
                                        value={formData.type || 'PERCENTAGE'}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    >
                                        <option value="PERCENTAGE">Percentage (%)</option>
                                        <option value="FIXED">Fixed Amount ($)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Value *</label>
                                    <div className="relative">
                                        {formData.type === 'PERCENTAGE' || formData.type === 'PERCENT' || formData.type === 'percentage' ? (
                                            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        ) : (
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        )}
                                        <input
                                            type="number"
                                            value={formData.value || ''}
                                            onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                                            className="w-full p-3 pl-10 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                            placeholder="Enter value"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
                                <select
                                    value={formData.category || 'general'}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                >
                                    <option value="general">General</option>
                                    <option value="inflation">Inflation</option>
                                    <option value="logistics">Logistics</option>
                                    <option value="materials">Materials</option>
                                    <option value="labor">Labor</option>
                                    <option value="energy">Energy</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Adjustment Category</label>
                                <select
                                    value={formData.adjustmentCategory || 'Custom'}
                                    onChange={(e) => setFormData({ ...formData, adjustmentCategory: e.target.value as any })}
                                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                >
                                    <option value="Profit Margin">Profit Margin</option>
                                    <option value="Transport/Logistics">Transport/Logistics</option>
                                    <option value="Wastage Factor">Wastage Factor</option>
                                    <option value="Overhead">Overhead</option>
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={formData.displayName || ''}
                                        onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="Name for reports"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Sort Order</label>
                                    <input
                                        type="number"
                                        value={formData.sortOrder || 0}
                                        onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    rows={3}
                                    placeholder="Optional description..."
                                />
                            </div>

                            <label className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={formData.active ?? true}
                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="text-slate-700">Active</span>
                            </label>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {editingId ? 'Update' : 'Create'} Adjustment
                                </button>
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="px-6 py-3 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Adjustments List */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {adjustments.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-medium">No market adjustments yet</p>
                            <p className="text-sm">Create your first adjustment to get started</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Name</th>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Type</th>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Value</th>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Category</th>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Statistics</th>
                                    <th className="text-left p-4 text-sm font-semibold text-slate-600">Status</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {adjustments.map(adjustment => {
                                    const stats = adjustmentStats.get(adjustment.id) || { totalApplied: 0, applicationCount: 0 };
                                    return (
                                        <tr key={adjustment.id} className="hover:bg-slate-50">
                                            <td className="p-4">
                                                <div>
                                                    <div className="font-medium text-slate-800">{adjustment.displayName || adjustment.name}</div>
                                                    {adjustment.description && (
                                                        <div className="text-sm text-slate-500">{adjustment.description}</div>
                                                    )}
                                                    {adjustment.adjustmentCategory && (
                                                        <div className="text-xs text-amber-600 font-medium mt-1">{adjustment.adjustmentCategory}</div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${adjustment.type === 'PERCENTAGE' || adjustment.type === 'PERCENT' || adjustment.type === 'percentage'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-green-100 text-green-700'
                                                    }`}>
                                                    {adjustment.type === 'PERCENTAGE' || adjustment.type === 'PERCENT' || adjustment.type === 'percentage' ? 'Percentage' : 'Fixed'}
                                                </span>
                                            </td>
                                            <td className="p-4 font-medium text-slate-700">
                                                {adjustment.type === 'PERCENTAGE' || adjustment.type === 'PERCENT' || adjustment.type === 'percentage'
                                                    ? `${adjustment.value || adjustment.percentage}%`
                                                    : `$${adjustment.value}`}
                                            </td>
                                            <td className="p-4 text-slate-600 capitalize">{adjustment.category || 'general'}</td>
                                            <td className="p-4">
                                                <div className="text-sm">
                                                    <div className="flex items-center gap-1 text-slate-600">
                                                        <BarChart3 className="w-3 h-3" />
                                                        <span>{stats.applicationCount} applications</span>
                                                    </div>
                                                    <div className="text-xs text-emerald-600 font-medium">
                                                        {formatCurrency(stats.totalApplied)} total
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <button
                                                    onClick={() => toggleActive(adjustment)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${adjustment.active ?? adjustment.isActive
                                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    {(adjustment.active ?? adjustment.isActive) ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleViewHistory(adjustment)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700"
                                                        title="View History"
                                                    >
                                                        <Clock className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(adjustment)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(adjustment.id)}
                                                        className="p-2 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Transaction History Modal */}
                {showHistory && selectedAdjustment && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">Transaction History</h2>
                                    <p className="text-sm text-slate-500">{selectedAdjustment.displayName || selectedAdjustment.name}</p>
                                </div>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="p-2 hover:bg-slate-100 rounded-lg"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-6 overflow-auto max-h-[60vh]">
                                {transactionHistory.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p>No transactions yet</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="text-left p-3 font-semibold text-slate-600">Date</th>
                                                <th className="text-left p-3 font-semibold text-slate-600">Sale ID</th>
                                                <th className="text-left p-3 font-semibold text-slate-600">Item</th>
                                                <th className="text-right p-3 font-semibold text-slate-600">Qty</th>
                                                <th className="text-right p-3 font-semibold text-slate-600">Unit Amt</th>
                                                <th className="text-right p-3 font-semibold text-slate-600">Total</th>
                                                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {transactionHistory.map(tx => (
                                                <tr key={tx.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-600">
                                                        {new Date(tx.timestamp).toLocaleDateString()}
                                                    </td>
                                                    <td className="p-3 font-mono text-xs text-slate-500">{tx.saleId}</td>
                                                    <td className="p-3 text-slate-800">{tx.itemId}</td>
                                                    <td className="p-3 text-right text-slate-600">{tx.quantity}</td>
                                                    <td className="p-3 text-right text-slate-600">{formatCurrency(tx.unitAmount)}</td>
                                                    <td className="p-3 text-right font-medium text-emerald-600">{formatCurrency(tx.calculatedAmount)}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${tx.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                                tx.status === 'Reversed' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {tx.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                                <div className="text-sm text-slate-600">
                                    Total: <span className="font-bold text-slate-800">{transactionHistory.length}</span> transactions
                                </div>
                                <div className="text-sm text-slate-600">
                                    Total Applied: <span className="font-bold text-emerald-600">
                                        {formatCurrency(transactionHistory.reduce((sum, tx) => sum + tx.calculatedAmount, 0))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketAdjustments;
