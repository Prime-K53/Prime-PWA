
import React, { useState, useRef } from 'react';
import { Search, Printer, Plus, Minus, X, ScanLine, Box, FileText, Loader2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Item } from '../../types';

const BarcodePrinter: React.FC = () => {
    const { inventory, companyConfig, notify } = useData();
    const currency = companyConfig.currencySymbol;
    const [searchTerm, setSearchTerm] = useState('');
    const [printQueue, setPrintQueue] = useState<{item: Item, qty: number}[]>([]);
    
    // Settings
    const [labelSize, setLabelSize] = useState<'Standard' | 'Small'>('Standard'); // Standard: 50x30mm, Small: 38x25mm
    const [showPrice, setShowPrice] = useState(true);
    const [showName, setShowName] = useState(true);
    const [showSKU, setShowSKU] = useState(true);

    const handlePrint = () => {
        if (printQueue.length === 0) {
            notify("Print queue is empty", "error");
            return;
        }
        window.print();
    };

    const filteredItems = inventory.filter(i => 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.sku.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10);

    const addToQueue = (item: Item) => {
        setPrintQueue(prev => {
            const exists = prev.find(p => p.item.id === item.id);
            if (exists) return prev.map(p => p.item.id === item.id ? { ...p, qty: p.qty + 1 } : p);
            return [...prev, { item, qty: 1 }];
        });
    };

    const updateQty = (id: string, delta: number) => {
        setPrintQueue(prev => prev.map(p => {
            if (p.item.id === id) {
                const newQty = p.qty + delta;
                return newQty > 0 ? { ...p, qty: newQty } : p;
            }
            return p;
        }));
    };

    const remove = (id: string) => setPrintQueue(prev => prev.filter(p => p.item.id !== id));

    // Simple visual barcode generation (CSS Stripes)
    const BarcodeStrip = () => (
        <div className="h-8 w-full flex justify-center items-end gap-[1px] overflow-hidden my-1 opacity-80">
            {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="bg-black" style={{ width: Math.random() > 0.5 ? '2px' : '1px', height: Math.random() > 0.5 ? '100%' : '80%' }}></div>
            ))}
        </div>
    );

    const printStyles = `
        @media print {
            body * { visibility: hidden; }
            #printable-labels, #printable-labels * { visibility: visible; }
            #printable-labels { position: absolute; left: 0; top: 0; width: 100%; display: grid; grid-template-columns: repeat(auto-fill, ${labelSize === 'Standard' ? '50mm' : '38mm'}); gap: 2mm; }
            .label-item { break-inside: avoid; border: 1px solid #ddd; page-break-inside: avoid; }
            @page { margin: 5mm; size: auto; }
        }
    `;

    return (
        <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
            <style>{printStyles}</style>
            
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><ScanLine className="text-blue-600"/> Barcode Label Printer</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Generate and print product labels</p>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Left: Selection */}
                <div className="w-1/3 flex flex-col gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                            <input 
                                className="w-full pl-9 p-2 border rounded-lg text-sm bg-slate-50" 
                                placeholder="Search Item..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {filteredItems.map(item => (
                                <button key={item.id} onClick={() => addToQueue(item)} className="w-full text-left p-2 hover:bg-slate-50 rounded flex justify-between items-center group">
                                    <div>
                                        <div className="text-xs font-bold text-slate-700">{item.name}</div>
                                        <div className="text-[10px] text-slate-500">{item.sku}</div>
                                    </div>
                                    <Plus size={14} className="text-slate-300 group-hover:text-blue-600"/>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                        <h3 className="font-bold text-sm text-slate-700 mb-2">Print Queue</h3>
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {printQueue.map(p => (
                                <div key={p.item.id} className="flex justify-between items-center p-2 border border-slate-100 rounded bg-slate-50">
                                    <div className="text-xs truncate max-w-[150px] font-medium">{p.item.name}</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => updateQty(p.item.id, -1)} className="p-1 hover:bg-white rounded"><Minus size={12}/></button>
                                        <span className="text-xs font-bold w-4 text-center">{p.qty}</span>
                                        <button onClick={() => updateQty(p.item.id, 1)} className="p-1 hover:bg-white rounded"><Plus size={12}/></button>
                                        <button onClick={() => remove(p.item.id)} className="p-1 text-red-400 hover:text-red-600"><X size={12}/></button>
                                    </div>
                                </div>
                            ))}
                            {printQueue.length === 0 && <div className="text-center text-xs text-slate-400 py-8">Queue empty.</div>}
                        </div>
                    </div>
                </div>

                {/* Right: Preview & Settings */}
                <div className="flex-1 flex flex-col bg-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center">
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)}/> Name
                            </label>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)}/> Price
                            </label>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={showSKU} onChange={e => setShowSKU(e.target.checked)}/> SKU
                            </label>
                            <select className="text-xs border rounded p-1" value={labelSize} onChange={e => setLabelSize(e.target.value as any)}>
                                <option value="Standard">50x30mm</option>
                                <option value="Small">38x25mm</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handlePrint} 
                                disabled={printQueue.length === 0}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Printer size={14}/> Print
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 p-8 overflow-y-auto flex flex-wrap content-start gap-4">
                        <div id="printable-labels" className="flex flex-wrap gap-4">
                            {printQueue.flatMap(p => Array(p.qty).fill(p.item)).map((item, i) => (
                                <div 
                                    key={i} 
                                    className="bg-white border border-slate-300 rounded flex flex-col items-center justify-center text-center p-2 shadow-sm label-item"
                                    style={{ 
                                        width: labelSize === 'Standard' ? '50mm' : '38mm', 
                                        height: labelSize === 'Standard' ? '30mm' : '25mm' 
                                    }}
                                >
                                    {showName && <div className="text-[9px] font-bold leading-tight line-clamp-2">{item.name}</div>}
                                    <BarcodeStrip/>
                                    {showSKU && <div className="text-[8px] font-mono text-slate-500">{item.sku}</div>}
                                    {showPrice && <div className="text-xs font-bold">{currency}{item.price.toFixed(2)}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BarcodePrinter;
