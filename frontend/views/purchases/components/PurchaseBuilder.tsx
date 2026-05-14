import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ShoppingCart, Save, X, Trash2, Sparkles, Loader2, ScanLine, ExternalLink, ChevronDown, Plus, Building } from 'lucide-react';
import { Item, Purchase, Invoice, Supplier } from '../../../types';
import { useData } from '../../../context/DataContext';
import { OfflineImage } from '../../../components/OfflineImage';
import { extractInvoiceData } from '../../../services/geminiService';
import { localFileStorage } from '../../../services/localFileStorage';
import { useNavigate } from 'react-router-dom';
import { SupplierModal } from './SupplierModal';

interface PurchaseBuilderProps {
    inventory: Item[];
    supplierNames?: string[];
    suppliers?: any[];
    onCreateOrder: (data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => void;
    initialData?: Purchase | null;
    onUpdateOrder?: (id: string, data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => void;
    onCancel?: () => void;
}

export const PurchaseBuilder: React.FC<PurchaseBuilderProps> = ({ inventory, supplierNames, onCreateOrder, initialData, onUpdateOrder, onCancel }) => {
    const { companyConfig, notify, isOnline, suppliers, purchases, addSupplier } = useData();
    const currency = companyConfig.currencySymbol;
    const navigate = useNavigate();
    
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const supplierDropdownRef = useRef<HTMLDivElement>(null);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);

    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    const [reference, setReference] = useState('');
    
    const [searchItem, setSearchTerm] = useState('');
    const [poItems, setPoItems] = useState<{item: Item, qty: number, cost: number}[]>([]);

    // Scanning State
    const [isScanning, setIsScanning] = useState(false);
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getSupplierOutstanding = (id: string) => {
        const supplier = suppliers.find(s => s.id === id);
        if (!supplier) return 0;
        
        // Calculate outstanding from purchases
        return (purchases || [])
            .filter(p => p.supplierId === id && p.paymentStatus !== 'Paid' && p.status !== 'Cancelled')
            .reduce((sum, p) => sum + (p.totalAmount - (p.paidAmount || 0)), 0);
    };

    const selectedSupplierObj = useMemo(() => 
        suppliers.find(s => s.id === selectedSupplierId),
    [selectedSupplierId, suppliers]);

    useEffect(() => {
        if (initialData) {
            setSelectedSupplierId(initialData.supplierId);
            const sName = suppliers.find(s => s.id === initialData.supplierId)?.name || initialData.supplierId;
            setSupplierSearch(sName);
            setBillDate(new Date(initialData.date).toISOString().split('T')[0]);
            setDueDate(initialData.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
            setReference(initialData.reference || '');
            
            const items = (initialData.items || []).map(pItem => {
                const invItem = inventory.find(i => i.id === pItem.itemId);
                // Construct item object if inventory item missing (deleted), or use existing
                const fullItem = invItem || { 
                    id: pItem.itemId, 
                    name: pItem.name, 
                    sku: 'N/A', 
                    price: pItem.cost, 
                    cost: pItem.cost, 
                    type: 'Material',
                    category: 'Unknown',
                    stock: 0,
                    minStockLevel: 0
                } as Item;
                
                return {
                    item: fullItem,
                    qty: pItem.quantity,
                    cost: pItem.cost
                };
            });
            setPoItems(items);
        } else {
            // Reset
            setSelectedSupplierId('');
            setSupplierSearch('');
            setPoItems([]);
            setBillDate(new Date().toISOString().split('T')[0]);
            setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
            setReference('');
        }
    }, [initialData, inventory, suppliers]);

    const filteredSuppliers = useMemo(() => {
        if (!supplierSearch) return suppliers;
        return suppliers.filter(s => 
            s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
            s.email?.toLowerCase().includes(supplierSearch.toLowerCase())
        );
    }, [suppliers, supplierSearch]);

    const selectSupplier = (supplier: any) => {
        setSelectedSupplierId(supplier.id);
        setSupplierSearch(supplier.name);
        setIsSupplierDropdownOpen(false);
    };

    const handleAddSupplier = async (supplierData: Supplier) => {
        try {
            const newSupplier = await addSupplier(supplierData);
            selectSupplier(newSupplier);
            setIsSupplierModalOpen(false);
            notify('Supplier added successfully', 'success');
        } catch (error) {
            notify('Failed to add supplier', 'error');
        }
    };

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
                setIsSupplierDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Requirement: Hide products and services. Only allow materials/stationery for Bills/Purchases.
    const availableItems = inventory.filter(i => 
        (i.type === 'Raw Material' || i.type === 'Stationery') &&
        (i.name.toLowerCase().includes(searchItem.toLowerCase()) || 
        i.sku.toLowerCase().includes(searchItem.toLowerCase()))
    );

    const addItemToPO = (item: Item, qty: number = 10, cost?: number) => {
        setPoItems(prev => {
          const exists = prev.find(p => p.item.id === item.id);
          if(exists) return prev;
          return [...prev, { item, qty, cost: cost || item.cost || item.price }];
        });
    };

    const updatePOItem = (id: string, field: 'qty' | 'cost', value: number) => {
        setPoItems(prev => prev.map(p => 
          p.item.id === id ? { ...p, [field]: value } : p
        ));
    };

    const removePOItem = (id: string) => {
        setPoItems(prev => prev.filter(p => p.item.id !== id));
    };

    const handleSubmit = () => {
        if(!selectedSupplierId || poItems.length === 0) return;
        
        const payload = {
            supplierId: selectedSupplierId,
            items: poItems,
            reference,
            dueDate,
            date: billDate
        };

        if (initialData && onUpdateOrder) {
            onUpdateOrder(initialData.id, payload);
        } else {
            onCreateOrder(payload);
            setPoItems([]);
            setSelectedSupplierId('');
            setReference('');
        }
        setScannedImage(null);
    };

    const handleScanInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!isOnline) {
            notify("Scanning requires internet connection.", "error");
            return;
        }

        setIsScanning(true);
        try {
            // 1. Preview
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target?.result as string;
                setScannedImage(base64);
                
                try {
                    // 2. AI Processing
                    const extracted = await extractInvoiceData(base64);
                    
                    if (extracted) {
                        // Match Supplier - AI returns clientName as the entity on the doc
                        const supplierName = extracted.supplierName || extracted.clientName;
                        if (supplierName) {
                            const match = suppliers.find(s => s.name.toLowerCase().includes(supplierName.toLowerCase()));
                            if (match) {
                                setSelectedSupplierId(match.id);
                                setSupplierSearch(match.name);
                                notify(`Matched Supplier: ${match.name}`, "success");
                            } else {
                                notify(`Supplier '${supplierName}' not found. Please select manually.`, "info");
                            }
                        }

                        // Match Items
                        const newItems: {item: Item, qty: number, cost: number}[] = [];
                        
                        extracted.items?.forEach((scanItem: any) => {
                            // Fuzzy Match Logic (Simple includes for now)
                            // Use desc or name from AI extraction
                            const itemName = scanItem.desc || scanItem.name || "";
                            const matchedInv = inventory.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
                            
                            // Check if matched item is allowed (Material/Stationery)
                            if (matchedInv && (matchedInv.type === 'Raw Material' || matchedInv.type === 'Stationery')) {
                                newItems.push({
                                    item: matchedInv,
                                    qty: scanItem.qty || 1,
                                    cost: scanItem.price || scanItem.unitPrice || matchedInv.cost || 0
                                });
                            }
                        });

                        if (newItems.length > 0) {
                            setPoItems(prev => [...prev, ...newItems]);
                            notify(`Matched ${newItems.length} items from invoice.`, "success");
                        } else {
                            notify("No matching purchaseable inventory items found in invoice.", "info");
                        }
                        
                        if(extracted.date) setBillDate(extracted.date);
                    } else {
                        notify("Could not extract data from image.", "error");
                    }
                } catch (err) {
                    console.error(err);
                    notify("AI Analysis failed.", "error");
                } finally {
                    setIsScanning(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            setIsScanning(false);
        }
        e.target.value = '';
    };

    const totalCost = poItems.reduce((sum, p) => sum + (p.qty * p.cost), 0);

    return (
        <div className="flex gap-6 flex-1 min-h-0 h-full overflow-hidden">
            {/* Scan Preview Panel (Conditional) */}
            {scannedImage && (
                <div className="w-1/4 bg-slate-900 rounded-2xl overflow-hidden relative flex flex-col shadow-2xl border border-slate-700 animate-in slide-in-from-left-4">
                    <div className="p-4 bg-slate-800/80 backdrop-blur-md text-white flex justify-between items-center absolute top-0 left-0 right-0 z-10">
                        <h3 className="font-bold flex items-center gap-2 text-[13px]"><ScanLine size={16} className="text-emerald-400"/> Scanned Invoice</h3>
                        <button onClick={() => setScannedImage(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={16}/></button>
                    </div>
                    <img src={scannedImage} alt="Scanned" className="w-full h-full object-contain opacity-80 hover:opacity-100 transition-opacity"/>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-10 gap-6 h-full min-h-0">
                {/* 30% Column: Select Bill Items */}
                <div className="lg:col-span-3 flex flex-col bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/30 flex justify-between items-center">
                        <h2 className="text-title flex items-center gap-2 text-slate-800">
                            <Search size={16} className="text-blue-600"/> Select Items
                        </h2>
                        {isOnline && (
                            <>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center"
                                    disabled={isScanning}
                                    title="Scan Bill"
                                >
                                    {isScanning ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleScanInvoice}/>
                            </>
                        )}
                    </div>
                    <div className="px-4 pt-3 pb-1">
                         <input 
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200/80 rounded-xl bg-white/50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-[13px] outline-none"
                            placeholder="e.g. Paper, Ink"
                            aria-label="Search materials"
                            value={searchItem}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {availableItems.map(item => (
                        <button 
                            key={item.id}
                            onClick={() => addItemToPO(item)}
                            className="w-full text-left p-2 border border-slate-200/60 rounded-xl hover:border-blue-400 hover:bg-white/80 transition-all group bg-white/40 backdrop-blur-sm shadow-sm flex gap-3 items-center"
                        >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                <OfflineImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            
                            <div className="flex-1 min-w-0 py-1">
                                <div className="font-bold text-slate-800 text-[13px] truncate">{item.name}</div>
                                <div className="text-[10px] text-slate-400 font-bold font-mono truncate uppercase tracking-tight">{item.sku}</div>
                            </div>
                        </button>
                    ))}
                    </div>
                </div>

                {/* 70% Column: Bill Summary */}
                <div className="lg:col-span-7 flex flex-col bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden h-full">
                    <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/30 flex justify-between items-center">
                        <h2 className="text-title flex items-center gap-2 text-slate-800">
                            <ShoppingCart size={16} className="text-blue-600"/> Bill Summary
                        </h2>
                        <div className="text-[13px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 uppercase tracking-tight finance-nums">
                            Total: {currency}{totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                    </div>
                    
                    <div className="p-4 border-b border-slate-200/60 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white/40">
                        <div className="md:col-span-2 lg:col-span-1 relative" ref={supplierDropdownRef}>
                            <div className="flex justify-between items-center mb-1 px-1">
                                <label className="text-label">Supplier Entity</label>
                                {selectedSupplierObj && (
                                    <button 
                                        type="button"
                                        onClick={() => navigate('/purchases/suppliers', { state: { selectedId: selectedSupplierObj.id } })}
                                        className="text-[10px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        View Profile <ExternalLink size={10}/>
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <input 
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[13px] bg-white/80 focus:ring-2 focus:ring-blue-500 outline-none font-bold placeholder:text-slate-400"
                                    placeholder="e.g. ABC Suppliers"
                                    value={supplierSearch}
                                    onChange={(e) => {
                                        setSupplierSearch(e.target.value);
                                        setIsSupplierDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsSupplierDropdownOpen(true)}
                                />
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>

                            {isSupplierDropdownOpen && (
                                <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-premium max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                                    {filteredSuppliers.length === 0 ? (
                                        <div className="p-4 flex flex-col items-center gap-2">
                                            <p className="text-[11px] text-slate-400 italic">No vendors found</p>
                                            <button
                                                onClick={() => {
                                                    setIsSupplierModalOpen(true);
                                                    setIsSupplierDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-[11px] font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus size={12} />
                                                Add "{supplierSearch}" as New Supplier
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {filteredSuppliers.map(s => {
                                                const outstanding = getSupplierOutstanding(s.id);
                                                return (
                                                    <button 
                                                        key={s.id} 
                                                        onClick={() => selectSupplier(s)}
                                                        className="w-full px-4 py-2 text-left hover:bg-blue-50 flex justify-between items-center transition-colors border-b border-slate-50 last:border-0"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-bold text-slate-800">{s.name}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">{s.category || 'General Vendor'}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`text-[11px] font-black tabular-nums ${outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                {currency}{outstanding.toLocaleString()}
                                                            </div>
                                                            <div className="text-[9px] text-slate-400 uppercase font-bold">Outstanding</div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {supplierSearch && !filteredSuppliers.some(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())) && (
                                                <button
                                                    onClick={() => {
                                                        setIsSupplierModalOpen(true);
                                                        setIsSupplierDropdownOpen(false);
                                                    }}
                                                    className="w-full px-4 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 border-t border-slate-100"
                                                >
                                                    <Plus size={14} />
                                                    <span className="text-[12px] font-bold">Add "{supplierSearch}" as New Supplier</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="text-label mb-1">Bill Date</label>
                            <input 
                                type="date" 
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[13px] bg-white/80 font-bold"
                                value={billDate}
                                onChange={e => setBillDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-label mb-1">Due Date</label>
                            <input 
                                type="date" 
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[13px] bg-white/80 font-bold"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-label mb-1">Vendor Ref #</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[13px] bg-white/80 font-bold uppercase"
                                placeholder="e.g. INV-2024-001"
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50/50">
                                    <th className="table-header px-4 py-2">Item Identity</th>
                                    <th className="table-header px-4 py-2 text-center w-24">Quantity</th>
                                    <th className="table-header px-4 py-2 text-center w-40">Unit Cost</th>
                                    <th className="table-header px-4 py-2 text-right w-40">Line Total</th>
                                    <th className="table-header px-4 py-2 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {poItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-20 text-center text-slate-300 font-bold italic text-[13px]">No items added to bill yet. Select from left panel.</td>
                                    </tr>
                                )}
                                {poItems.map(p => (
                                    <tr key={p.item.id} className="hover:bg-blue-50/20 transition-all group">
                                        <td className="table-body-cell px-4 py-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                                                    <OfflineImage src={p.item.image} alt="" className="w-full h-full object-cover"/>
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-[13px]">{p.item.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold font-mono uppercase tracking-tight">{p.item.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="table-body-cell px-4 py-2">
                                            <input 
                                                    type="number" 
                                                    min="1"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] font-bold text-center bg-slate-50 focus:bg-white outline-none finance-nums"
                                                    value={p.qty || 0}
                                                    onChange={e => updatePOItem(p.item.id, 'qty', parseFloat(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="table-body-cell px-4 py-2">
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 tracking-tight uppercase">{currency}</span>
                                                    <input 
                                                        type="number" 
                                                        min="0" 
                                                        step="0.01"
                                                        className="w-full pl-6 pr-3 py-2 border border-slate-200 rounded-lg text-[13px] font-bold text-center bg-slate-50 focus:bg-white outline-none finance-nums"
                                                        value={p.cost || 0}
                                                        onChange={e => updatePOItem(p.item.id, 'cost', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </td>
                                        <td className="table-body-cell px-4 py-2 text-right font-bold text-slate-800 finance-nums">
                                            {currency}{(p.qty * p.cost).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </td>
                                        <td className="table-body-cell px-4 py-2">
                                            <button 
                                                onClick={() => removePOItem(p.item.id)}
                                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 border-t border-slate-200/60 bg-slate-50/30 flex justify-between items-center">
                        <button 
                            onClick={onCancel}
                            className="px-4 py-2 text-[13px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            Discard
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={!selectedSupplierId || poItems.length === 0}
                            className="zoho-button-primary flex items-center gap-2"
                        >
                            <Save size={16}/> {initialData ? 'Update Bill' : 'Save Bill'}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Supplier Modal */}
            <SupplierModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
                onSave={handleAddSupplier}
                supplier={{ name: supplierSearch } as Supplier}
            />
        </div>
    );
};
