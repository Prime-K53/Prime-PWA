
import React, { useState, useMemo } from 'react';
import { 
  Maximize, Ruler, Calculator, Box, ArrowRight, 
  Trash2, Plus, Info, Scale, CheckCircle, RefreshCw,
  Layers, Package, ChevronRight, FileText, Save, X
} from 'lucide-react';
import { useData } from '../../context/DataContext';

const GangRunEstimator: React.FC = () => {
    const { companyConfig, workOrders, updateWorkOrder, notify } = useData();
    const currency = companyConfig.currencySymbol;

    // State
    const [parentSize, setParentSize] = useState({ w: 457, h: 305 }); // SRA3 Default in mm
    const [finalSize, setFinalSize] = useState({ w: 85, h: 55 }); // Business Card Default
    const [gutter, setGutter] = useState(3);
    const [bleed, setBleed] = useState(2);
    const [margin, setMargin] = useState(5);
    const [targetQty, setTargetQty] = useState(1000);
    
    // Save state
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [selectedWoId, setSelectedWoId] = useState('');

    const result = useMemo(() => {
        const pW = parentSize.w - (margin * 2);
        const pH = parentSize.h - (margin * 2);
        
        const fW = finalSize.w + (bleed * 2) + gutter;
        const fH = finalSize.h + (bleed * 2) + gutter;

        const cols1 = Math.floor(pW / fW);
        const rows1 = Math.floor(pH / fH);
        const yield1 = cols1 * rows1;

        const cols2 = Math.floor(pW / fH);
        const rows2 = Math.floor(pH / fW);
        const yield2 = cols2 * rows2;

        const bestYield = Math.max(yield1, yield2);
        const sheetsNeeded = Math.ceil(targetQty / (bestYield || 1));
        const wastePercent = 100 - ((bestYield * fW * fH) / (pW * pH) * 100);

        return {
            bestYield,
            sheetsNeeded,
            wastePercent: Math.max(0, Math.min(100, wastePercent)),
            orientation: yield1 >= yield2 ? 'Optimal' : 'Rotated'
        };
    }, [parentSize, finalSize, gutter, bleed, margin, targetQty]);

    const handleApplyToOrder = () => {
        const wo = workOrders.find((w: any) => w.id === selectedWoId);
        if (!wo) return;

        const note = `[IMPOSITION LOGIC]: Sheet Size: ${parentSize.w}x${parentSize.h}mm, Final Size: ${finalSize.w}x${finalSize.h}mm, Yield: ${result.bestYield} Up, Pull: ${result.sheetsNeeded} Sheets. Waste Factor: ${result.wastePercent.toFixed(1)}%.`;
        
        updateWorkOrder({
            ...wo,
            notes: (wo.notes ? wo.notes + '\n' : '') + note
        });

        notify(`Imposition data saved to Order ${selectedWoId}`, "success");
        setShowSaveModal(false);
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8fafc] font-sans overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-200 bg-white/70 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <Scale size={32} className="text-blue-600"/> Production Sheet Intelligence
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Mathematical gang-run optimization for maximum yield.</p>
                </div>
                <button 
                    onClick={() => setShowSaveModal(true)}
                    className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center gap-2"
                >
                    <Save size={16}/> Apply to Job
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="w-96 border-r border-slate-200 bg-white overflow-y-auto p-8 space-y-10 custom-scrollbar shrink-0">
                    <section>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <Layers size={14} className="text-blue-500"/> Parent Sheet Matrix (mm)
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Width</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={parentSize.w} onChange={e => setParentSize({...parentSize, w: parseFloat(e.target.value)})}/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Height</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={parentSize.h} onChange={e => setParentSize({...parentSize, h: parseFloat(e.target.value)})}/>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <Maximize size={14} className="text-purple-500"/> Cut Size Matrix (mm)
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Final Width</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-600" value={finalSize.w} onChange={e => setFinalSize({...finalSize, w: parseFloat(e.target.value)})}/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Final Height</label>
                                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-600" value={finalSize.h} onChange={e => setFinalSize({...finalSize, h: parseFloat(e.target.value)})}/>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Technical Offsets</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-600">Sheet Margin</label>
                                <input type="number" className="w-20 p-2 border border-slate-200 rounded-lg text-right text-xs" value={margin} onChange={e => setMargin(parseFloat(e.target.value))}/>
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-600">Gutter (Gap)</label>
                                <input type="number" className="w-20 p-2 border border-slate-200 rounded-lg text-right text-xs" value={gutter} onChange={e => setGutter(parseFloat(e.target.value))}/>
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-600">Bleed Radius</label>
                                <input type="number" className="w-20 p-2 border border-slate-200 rounded-lg text-right text-xs" value={bleed} onChange={e => setBleed(parseFloat(e.target.value))}/>
                            </div>
                        </div>
                    </section>

                    <section className="pt-6 border-t border-slate-100">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Order Target</label>
                        <input type="number" className="w-full p-4 bg-slate-900 text-white rounded-2xl text-2xl font-black tracking-tighter" value={targetQty} onChange={e => setTargetQty(parseInt(e.target.value))}/>
                    </section>
                </div>

                <main className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-10">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform"><CheckCircle size={48}/></div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Yield</p>
                            <h3 className="text-3xl font-black text-slate-900">{result.bestYield} <span className="text-sm font-bold text-slate-400 uppercase">Up</span></h3>
                            <p className="text-[9px] font-bold text-blue-500 mt-2 uppercase tracking-tight">{result.orientation} Fit</p>
                        </div>
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Pull</p>
                            <h3 className="text-3xl font-black text-slate-900">{result.sheetsNeeded} <span className="text-sm font-bold text-slate-400 uppercase">Sheets</span></h3>
                            <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Parent Material Count</p>
                        </div>
                        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Waste Factor</p>
                            <h3 className={`text-3xl font-black ${result.wastePercent > 25 ? 'text-rose-400' : 'text-emerald-400'}`}>{result.wastePercent.toFixed(1)}%</h3>
                            <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Unutilized Area</p>
                        </div>
                        <div className="bg-blue-600 p-6 rounded-3xl shadow-xl text-white">
                            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Imposition Logic</p>
                            <h3 className="text-xl font-bold uppercase tracking-tighter mt-1">Ready for RIP</h3>
                            <div className="mt-4 flex items-center gap-1">
                                <CheckCircle size={14} className="text-emerald-300"/>
                                <span className="text-[9px] font-black uppercase">Mathematically Optimized</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-slate-100"></div>
                        
                        <h3 className="font-bold text-slate-400 uppercase tracking-[0.3em] text-[10px] mb-10">Imposition Preview Matrix</h3>
                        
                        <div 
                            className="bg-slate-100 border-2 border-slate-300 rounded shadow-2xl relative transition-all duration-500"
                            style={{ 
                                width: '400px', 
                                height: `${(parentSize.h / parentSize.w) * 400}px`,
                                padding: `${(margin / parentSize.w) * 400}px`
                            }}
                        >
                            <div className="w-full h-full border border-dashed border-blue-200 flex flex-wrap gap-[2px] content-start overflow-hidden">
                                {Array.from({ length: result.bestYield }).map((_, i) => (
                                    <div 
                                        key={i} 
                                        className="bg-white border border-blue-500/20 rounded-sm shadow-inner animate-in fade-in zoom-in-95 duration-500"
                                        style={{ 
                                            width: `${((finalSize.w + bleed*2) / parentSize.w) * 400}px`,
                                            height: `${((finalSize.h + bleed*2) / parentSize.h) * ((parentSize.h / parentSize.w) * 400)}px`
                                        }}
                                    ></div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-12 flex gap-10 items-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Ruler size={14}/> {parentSize.w}mm x {parentSize.h}mm</span>
                            <span className="flex items-center gap-2"><Info size={14}/> {bleed}mm Bleed + {gutter}mm Gutter</span>
                        </div>
                    </div>
                </main>
            </div>

            {showSaveModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-black text-slate-900 uppercase tracking-tighter">Apply to Work Order</h3>
                            <button onClick={() => setShowSaveModal(false)}><X/></button>
                        </div>
                        <div className="p-6">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Target Job</label>
                            <select 
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm mb-6"
                                value={selectedWoId}
                                onChange={e => setSelectedWoId(e.target.value)}
                            >
                                <option value="">-- Choose Work Order --</option>
                                {workOrders.filter(w => !['Completed', 'Cancelled'].includes(w.status)).map(wo => (
                                    <option key={wo.id} value={wo.id}>{wo.id} - {wo.productName}</option>
                                ))}
                            </select>
                            <button onClick={handleApplyToOrder} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl hover:bg-blue-700">
                                Save Optimization Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GangRunEstimator;
