
import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingCart, Trash2, User, Plus, Minus, ShoppingBag, PauseCircle, Undo2, ArrowRight, UserPlus, CreditCard, Clock, ChevronRight, Tag, School, Building2, AlertTriangle, X, TrendingUp, Truck, Scale } from 'lucide-react';
import { CartItem } from '../../../types';
import { useData } from '../../../context/DataContext';

import { formatNumber } from '../../../utils/helpers';

interface CartSidebarProps {
    cart: CartItem[];
    selectedCustomerName: string | null;
    selectedSubAccount: string;
    setSelectedSubAccount: (val: string) => void;
    onSelectCustomer: () => void;
    updateQuantity: (id: string, delta: number, isAbsolute?: boolean) => void;
    updatePrice: (id: string, newPrice: number) => void;
    resetPriceOverride: (id: string) => void | Promise<void>;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    onPark: () => void;
    onReturn: () => void;
    onPay: () => void;
    totals: { subtotal: number, discount: number, total: number };
    /** Adjustment summary for display in totals section */
    // TODO: normalise to adjustmentSnapshots — see cleanup tracker
    adjustmentSummary?: { adjustmentId: string; adjustmentName: string; totalAmount: number; itemCount: number; }[];
    pricingSummary?: {
        profitMarginTotal: number;
        roundingTotal: number;
    };
    rounding?: {
        enabled: boolean;
        applyRounding: boolean;
        calculatedPrice: number;
        roundedPrice: number;
        difference: number;
        method: string;
        methodLabel?: string;
        methodOptions?: { value: string; label: string }[];
        showOriginalPrice?: boolean;
        manualOverrideAllowed?: boolean;
        onToggle?: (value: boolean) => void;
        onMethodChange?: (value: string) => void;
    };
}

export const CartSidebar: React.FC<CartSidebarProps> = ({
    cart, selectedCustomerName, selectedSubAccount, setSelectedSubAccount, onSelectCustomer, updateQuantity, updatePrice, resetPriceOverride, removeFromCart, clearCart, onPark, onReturn, onPay, totals, adjustmentSummary, pricingSummary, rounding
}) => {
    const { companyConfig, invoices } = useData();
    const currency = companyConfig.currencySymbol;
    const [showManualOverrideCard, setShowManualOverrideCard] = useState(false);
    const [selectedOverrideItemId, setSelectedOverrideItemId] = useState<string>('');
    const [overrideValue, setOverrideValue] = useState<string>('');

    const grandTotal = totals.total;
    const hasAdjustments = adjustmentSummary && adjustmentSummary.length > 0;
    const roundingTotal = Number(pricingSummary?.roundingTotal || 0);
    const profitMarginTotal = Number(pricingSummary?.profitMarginTotal || 0);
    const hasPricingBreakdown = Boolean(hasAdjustments || Math.abs(roundingTotal) > 0.0001 || Math.abs(profitMarginTotal) > 0.0001 || rounding?.enabled);
    const overrideEligibleItems = useMemo(
        () => cart.filter((item: any) => !item?.isVariantParent),
        [cart]
    );

    const getPricingDisplayMeta = (label: string) => {
        const normalized = String(label || '').toLowerCase();

        if (normalized.includes('transport') || normalized.includes('logistics') || normalized.includes('delivery')) {
            return { priority: 0, Icon: Truck, iconClass: 'text-blue-500', textClass: 'text-blue-600' };
        }
        if (normalized.includes('waste') || normalized.includes('wastage') || normalized.includes('shrinkage')) {
            return { priority: 1, Icon: Scale, iconClass: 'text-rose-500', textClass: 'text-rose-600' };
        }
        if (normalized.includes('round')) {
            return { priority: 3, Icon: Tag, iconClass: 'text-purple-500', textClass: normalized.includes('-') ? 'text-rose-600' : 'text-purple-600' };
        }
        if (normalized.includes('profit') || normalized.includes('margin')) {
            return { priority: 4, Icon: TrendingUp, iconClass: 'text-emerald-500', textClass: 'text-emerald-600' };
        }
        return { priority: 2, Icon: Tag, iconClass: 'text-indigo-500', textClass: 'text-indigo-600' };
    };

    const orderedAdjustmentSummary = useMemo(() => {
        const rows = Array.isArray(adjustmentSummary) ? [...adjustmentSummary] : [];
        return rows.sort((a, b) => {
            const aMeta = getPricingDisplayMeta(a.adjustmentName);
            const bMeta = getPricingDisplayMeta(b.adjustmentName);
            if (aMeta.priority !== bMeta.priority) return aMeta.priority - bMeta.priority;
            return a.adjustmentName.localeCompare(b.adjustmentName);
        });
    }, [adjustmentSummary]);

    const selectedOverrideItem = useMemo(
        () => overrideEligibleItems.find(item => item.id === selectedOverrideItemId) || overrideEligibleItems[0] || null,
        [overrideEligibleItems, selectedOverrideItemId]
    );

    const getAutomaticUnitPrice = (item: CartItem | null) => {
        if (!item) return 0;

        const explicitOriginal = Number((item as any).originalPrice);
        if (Number.isFinite(explicitOriginal) && explicitOriginal > 0) return explicitOriginal;

        const storedSelling = Number((item as any).selling_price);
        if (Number.isFinite(storedSelling) && storedSelling > 0) return storedSelling;

        const calculatedPrice = Number((item as any).calculated_price);
        if (Number.isFinite(calculatedPrice) && calculatedPrice > 0) return calculatedPrice;

        return Number(item.price) || 0;
    };

    useEffect(() => {
        if (!overrideEligibleItems.length) {
            setSelectedOverrideItemId('');
            return;
        }

        const currentExists = overrideEligibleItems.some(item => item.id === selectedOverrideItemId);
        if (!selectedOverrideItemId || !currentExists) {
            setSelectedOverrideItemId(overrideEligibleItems[0].id);
        }
    }, [overrideEligibleItems, selectedOverrideItemId]);

    useEffect(() => {
        if (selectedOverrideItem) {
            setOverrideValue(String(Number(selectedOverrideItem.price || 0)));
        } else {
            setOverrideValue('');
        }
    }, [selectedOverrideItem]);

    useEffect(() => {
        if (!overrideEligibleItems.length) {
            setShowManualOverrideCard(false);
        }
    }, [overrideEligibleItems.length]);

    const customerOutstanding = useMemo(() => {
        if (!selectedCustomerName) return 0;
        return (invoices || [])
            .filter((i: any) => i.customerName === selectedCustomerName && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((acc: number, inv: any) => acc + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
    }, [selectedCustomerName, invoices]);

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden border-l border-slate-200 rounded-xl">
            {/* Checkout Header */}
            <div className="px-6 py-3 flex justify-between items-center bg-white border-b border-slate-200 shrink-0 rounded-t-xl">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 rounded text-slate-800">
                        <ShoppingCart size={16} />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-slate-800">Current Order</h3>
                        <p className="text-[10px] text-slate-500 font-medium">{cart.reduce((s, i) => s + i.quantity, 0)} items</p>
                    </div>
                </div>
                <button
                    onClick={clearCart}
                    disabled={cart.length === 0}
                    className="text-red-600 hover:underline text-[10px] font-semibold disabled:opacity-0"
                >
                    Clear all
                </button>
            </div>

            {/* Customer Selector */}
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
                <button
                    onClick={onSelectCustomer}
                    className={`w-full flex justify-between items-center p-1.5 rounded-xl border transition-all bg-white
                    ${selectedCustomerName
                            ? 'border-blue-600'
                            : 'border-slate-200 hover:border-slate-400'}`}
                >
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center
                          ${selectedCustomerName ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {selectedCustomerName ? <User size={12} /> : <UserPlus size={12} />}
                        </div>
                        <div className="text-left">
                            <div className="text-[10px] font-semibold text-slate-800">
                                {selectedCustomerName ? selectedCustomerName : 'Add Customer'}
                            </div>
                            {selectedCustomerName && (
                                <div className="text-[8px] text-slate-500 font-medium">
                                    Bal: {currency}{customerOutstanding.toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                    <ChevronRight size={10} className="text-slate-400" />
                </button>
            </div>

            {/* Cart Item List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-10 text-center">
                        <ShoppingBag size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-medium">Your cart is empty</p>
                        <p className="text-xs mt-1">Add items from the product grid to start an order.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {cart.map(item => (
                            <CartItemRow
                                key={item.id}
                                item={item}
                                updateQuantity={updateQuantity}
                                updatePrice={updatePrice}
                                removeFromCart={removeFromCart}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Checkout Totals Summary */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0 rounded-b-xl">
                {showManualOverrideCard && selectedOverrideItem && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                        <div className="space-y-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Override Pricing</div>
                            <div className="text-[11px] text-slate-600">
                                Auto Price: <span className="font-semibold">{currency}{formatNumber(getAutomaticUnitPrice(selectedOverrideItem))}</span>
                                <span className="mx-2 text-slate-400">|</span>
                                Final Price: <span className="font-semibold">{currency}{formatNumber(Number(selectedOverrideItem.price || 0))}</span>
                            </div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${selectedOverrideItem.manual_override ? 'text-amber-700' : 'text-slate-500'}`}>
                                {selectedOverrideItem.manual_override ? 'Status: Manual Override Active' : 'Status: Auto Pricing'}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <select
                                value={selectedOverrideItem.id}
                                onChange={(e) => setSelectedOverrideItemId(e.target.value)}
                                className="w-full p-2 border border-amber-200 rounded-lg bg-white text-[11px] font-semibold text-slate-700"
                            >
                                {overrideEligibleItems.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} ({currency}{formatNumber(Number(item.price || 0))})
                                    </option>
                                ))}
                            </select>

                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={overrideValue}
                                    onChange={(e) => setOverrideValue(e.target.value)}
                                    className="flex-1 p-2 border border-amber-200 rounded-lg bg-white text-[11px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                    placeholder="Override unit price"
                                />
                                <button
                                    onClick={() => updatePrice(selectedOverrideItem.id, Number(overrideValue) || 0)}
                                    className="px-3 py-2 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700"
                                >
                                    {selectedOverrideItem.manual_override ? 'Update' : 'Apply'}
                                </button>
                                {selectedOverrideItem.manual_override && (
                                    <button
                                        onClick={() => resetPriceOverride(selectedOverrideItem.id)}
                                        className="px-3 py-2 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-100"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Pricing Breakdown */}
                {hasPricingBreakdown && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-50">
                        {orderedAdjustmentSummary.map((adj, idx) => {
                            const meta = getPricingDisplayMeta(adj.adjustmentName);
                            const Icon = meta.Icon;
                            return (
                                <div key={idx} className="flex justify-between items-center">
                                    <span className="text-slate-400 text-[11px] font-normal tracking-tight flex items-center gap-1.5">
                                        <Icon size={10} className={meta.iconClass} /> {adj.adjustmentName}
                                    </span>
                                    <span className={`${meta.textClass} font-mono text-[11px] font-medium`}>+{currency}{formatNumber(adj.totalAmount)}</span>
                                </div>
                            );
                        })}
                        {(rounding?.enabled || Math.abs(roundingTotal) > 0.0001) && (
                            <div className={`${orderedAdjustmentSummary.length > 0 ? 'space-y-1.5 pt-2 mt-2 border-t border-slate-100' : 'space-y-1.5'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="text-purple-600 text-[11px] font-semibold tracking-tight flex items-center gap-1.5">
                                        <Tag size={10} className="text-purple-500" /> Round Up
                                        {rounding?.enabled && (
                                            <label className="inline-flex items-center gap-1 ml-1 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-3 h-3"
                                                    checked={rounding.applyRounding}
                                                    disabled={!rounding.manualOverrideAllowed}
                                                    onChange={e => rounding.onToggle?.(e.target.checked)}
                                                />
                                                <span className="text-[9px] text-slate-400 font-normal">
                                                    {rounding.manualOverrideAllowed ? (rounding.applyRounding ? 'On' : 'Off') : 'Locked'}
                                                </span>
                                            </label>
                                        )}
                                    </span>
                                    <span className={`font-mono text-[11px] font-semibold ${roundingTotal >= 0 ? 'text-purple-600' : 'text-rose-600'}`}>
                                        {roundingTotal >= 0 ? '+' : ''}{currency}{formatNumber(roundingTotal)}
                                    </span>
                                </div>
                                {rounding?.enabled && rounding.manualOverrideAllowed && rounding.methodOptions && rounding.applyRounding && (
                                    <select
                                        className="w-full p-1 border border-purple-100 rounded-lg bg-white text-[10px] font-semibold text-slate-700"
                                        value={rounding.method}
                                        onChange={e => rounding.onMethodChange?.(e.target.value)}
                                    >
                                        {rounding.methodOptions.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}
                        {profitMarginTotal > 0 && (
                            <div className={`flex justify-between items-center ${orderedAdjustmentSummary.length > 0 || rounding?.enabled || Math.abs(roundingTotal) > 0.0001 ? 'pt-2 mt-2 border-t border-slate-100' : ''}`}>
                                <span className="text-emerald-600 text-[11px] font-semibold tracking-tight flex items-center gap-1.5">
                                    <TrendingUp size={10} className="text-emerald-500" /> Profit Margin
                                </span>
                                <span className="text-emerald-600 font-mono text-[11px] font-semibold">+{currency}{formatNumber(profitMarginTotal)}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Total</span>
                    <span className="text-xl font-bold text-slate-800">{currency}{formatNumber(grandTotal)}</span>
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={onPay}
                        disabled={cart.length === 0}
                        className="w-full py-2.5 rounded-full bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:bg-slate-300 flex items-center justify-center gap-2 shadow-sm"
                    >
                        <span>Receive Payment</span> <ArrowRight size={16} />
                    </button>

                    <div className={`grid gap-2 ${companyConfig.transactionSettings?.pos?.allowReturns !== false ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                            onClick={() => setShowManualOverrideCard(prev => !prev)}
                            disabled={cart.length === 0 || !selectedOverrideItem}
                            className={`flex items-center justify-center gap-2 py-2 rounded-full border font-bold text-xs transition-all disabled:opacity-50 ${showManualOverrideCard ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                        >
                            <Tag size={12} /> {showManualOverrideCard ? 'Close Override' : 'Override'}
                        </button>
                        {companyConfig.transactionSettings?.pos?.allowReturns !== false && (
                            <button onClick={onReturn} className="flex items-center justify-center gap-2 py-2 rounded-full border border-slate-200 bg-white text-slate-800 font-bold text-xs hover:bg-slate-50 transition-all">
                                <Undo2 size={12} /> Refund
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const CartItemRow: React.FC<{ item: CartItem, updateQuantity: (id: string, delta: number, isAbsolute?: boolean) => void, updatePrice: (id: string, newPrice: number) => void, removeFromCart: (id: string) => void }> = ({ item, updateQuantity, updatePrice, removeFromCart }) => {
    const { companyConfig } = useData();
    const currency = companyConfig.currencySymbol;
    const [localQty, setLocalQty] = useState(item.quantity.toString());
    const serviceDetails = (item as any).serviceDetails;

    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [localPrice, setLocalPrice] = useState(item.price.toString());

    useEffect(() => {
        setLocalQty(item.quantity.toString());
    }, [item.quantity]);

    useEffect(() => {
        setLocalPrice(item.price.toString());
    }, [item.price]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const val = parseInt(localQty);
            if (!isNaN(val) && val >= 1) {
                updateQuantity(item.id, val, true);
            } else {
                setLocalQty(item.quantity.toString());
            }
        }
    };

    const handleBlur = () => {
        const val = parseInt(localQty);
        if (!isNaN(val) && val >= 1) {
            updateQuantity(item.id, val, true);
        } else {
            setLocalQty(item.quantity.toString());
        }
    };

    const handlePriceKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const val = parseFloat(localPrice);
            if (!isNaN(val) && val >= 0) {
                updatePrice(item.id, val);
                setIsEditingPrice(false);
            } else {
                setLocalPrice(item.price.toString());
                setIsEditingPrice(false);
            }
        } else if (e.key === 'Escape') {
            setLocalPrice(item.price.toString());
            setIsEditingPrice(false);
        }
    };

    const handlePriceBlur = () => {
        const val = parseFloat(localPrice);
        if (!isNaN(val) && val >= 0) {
            updatePrice(item.id, val);
        } else {
            setLocalPrice(item.price.toString());
        }
        setIsEditingPrice(false);
    };

    return (
        <div className="p-4 bg-slate-50 hover:bg-blue-50/30 transition-all group relative rounded-xl">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 pr-8">
                    <h4 className="font-semibold text-slate-800 text-xs leading-tight mb-1">{item.name}</h4>
                    {serviceDetails && (
                        <div className="text-[10px] text-slate-500 leading-snug mb-1.5">
                            <div>{serviceDetails.pages} pages x {serviceDetails.copies} copies</div>
                        </div>
                    )}
                    {item.attributes && Object.keys(item.attributes).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(item.attributes).map(([key, value]) => (
                                <span key={key} className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {key.replace(/_/g, ' ')}: {String(value)}
                                </span>
                            ))}
                        </div>
                    )}

                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1">
                    <X size={14} />
                </button>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 flex items-center justify-center hover:bg-slate-50 border-r border-slate-200"><Minus size={10} /></button>
                        <input
                            type="number"
                            className="w-10 text-xs font-bold text-slate-800 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localQty}
                            onChange={(e) => setLocalQty(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                        />
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 flex items-center justify-center hover:bg-slate-50 border-l border-slate-200"><Plus size={10} /></button>
                    </div>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        @ {currency}
                        {isEditingPrice ? (
                            <input
                                type="number"
                                autoFocus
                                className="w-16 bg-white border border-blue-400 rounded px-1 text-xs font-bold text-blue-600 outline-none"
                                value={localPrice}
                                onChange={(e) => setLocalPrice(e.target.value)}
                                onKeyDown={handlePriceKeyDown}
                                onBlur={handlePriceBlur}
                            />
                        ) : (
                            <span 
                                onClick={() => setIsEditingPrice(true)}
                                className={`font-bold cursor-pointer hover:text-blue-600 transition-colors ${item.manual_override ? 'text-blue-600 underline decoration-dotted' : 'text-slate-800'}`}
                                title="Click to override price"
                            >
                                {formatNumber(item.price)}
                            </span>
                        )}
                    </span>
                </div>
                <div className="text-right">
                    <div className="font-bold text-slate-800 text-sm">{currency}{formatNumber(item.price * item.quantity)}</div>

                </div>
            </div>
        </div>
    );
};
