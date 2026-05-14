
import React, { useState } from 'react';
import { Layers, ShoppingCart, CheckSquare, Square, Truck, TrendingDown, PackagePlus, AlertTriangle, ShieldCheck, Info, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useNavigate } from 'react-router-dom';
import { OfflineImage } from '../../components/OfflineImage';
import { generateNextId } from '../../utils/helpers';

const MRP: React.FC = () => {
  const { 
    workOrders = [], 
    boms = [], 
    inventory = [], 
    purchases = [],
    addPurchase, 
    suppliers = [], 
    notify, 
    companyConfig 
  } = useData();
  const navigate = useNavigate();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const currency = companyConfig.currencySymbol;

  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || id;

  // 1. Get all Scheduled or In Progress Work Orders
  const activeWOs = workOrders.filter(wo => ['Scheduled', 'In Progress'].includes(wo.status));

  // 2. Aggregate Required Materials (Recursive Logic Simulation)
  const materialDemand: Record<string, number> = {};

  const explodeBOM = (bomId: string, multiplier: number) => {
      const bom = boms.find(b => b.id === bomId);
      if (!bom) return;
      
      bom.components.forEach(comp => {
          materialDemand[comp.materialId] = (materialDemand[comp.materialId] || 0) + (comp.quantity * multiplier);
          
          // Check if this component itself has a BOM (Sub-assembly)
          const subBom = boms.find(b => b.productId === comp.materialId);
          if (subBom) {
              explodeBOM(subBom.id, comp.quantity * multiplier);
          }
      });
  };

  activeWOs.forEach(wo => {
    const remainingQty = Math.max(0, wo.quantityPlanned - wo.quantityCompleted);
    explodeBOM(wo.bomId, remainingQty);
  });

  // 3. Compare with Inventory & Calculate Purchase Needs
  const mrpReport = Object.entries(materialDemand).map(([matId, requiredQty]) => {
      const item = inventory.find(i => i.id === matId);
      const currentStock = item?.stock || 0;
      
      // LOGIC LINK: Calculate what's already in the pipeline (Inbound)
      const inboundQty = purchases
        .filter(p => p.status === 'Ordered' || p.status === 'Partially Received')
        .reduce((sum, p) => {
            const line = p.items.find(li => li.itemId === matId);
            return sum + (line ? (line.quantity - (line.receivedQty || 0)) : 0);
        }, 0);

      const netPosition = currentStock + inboundQty - requiredQty;
      
      const minStock = item?.minStockLevel || 0;
      const shortage = netPosition < 0 ? Math.abs(netPosition) : 0;
      const safetyShortage = (netPosition < minStock && netPosition >= 0) ? (minStock - netPosition) : 0;
      
      let suggestedOrder = shortage + safetyShortage;
      const moq = 1; // Minimum Order Quantity

      return {
          id: matId,
          name: item?.name || 'Unknown',
          sku: item?.sku || 'N/A',
          image: item?.image,
          preferredSupplierId: item?.preferredSupplierId,
          currentStock,
          inboundQty,
          requiredQty,
          netStock: netPosition,
          status: netPosition < 0 ? 'Critical' : netPosition < minStock ? 'Buffer Warning' : 'Healthy',
          suggestedOrder: suggestedOrder > 0 ? Math.max(suggestedOrder, moq) : 0,
          unit: item?.unit || 'units'
      };
  }).sort((a, b) => {
      if (a.status === 'Critical') return -1;
      if (b.status === 'Critical') return 1;
      return 0;
  });

  const handleToggleSelect = (id: string) => {
      setSelectedItemIds(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };

  const handleGeneratePOs = async () => {
      if (selectedItemIds.length === 0) return;

      const itemsToOrder = mrpReport.filter(item => selectedItemIds.includes(item.id));
      const ordersBySupplier: Record<string, typeof itemsToOrder> = {};
      const stagedPurchases = [...purchases];
      
      itemsToOrder.forEach(item => {
          const supId = item.preferredSupplierId || 'SUP-GENERIC';
          if (!ordersBySupplier[supId]) ordersBySupplier[supId] = [];
          ordersBySupplier[supId].push(item);
      });

      let ordersCreated = 0;
      for (const [supId, items] of Object.entries(ordersBySupplier)) {
          const poItems = items.map(i => {
              const invItem = inventory.find(inv => inv.id === i.id);
              return {
                  itemId: i.id,
                  name: i.name,
                  quantity: Math.ceil(i.suggestedOrder),
                  cost: invItem?.cost || 0,
                  receivedQty: 0
              };
          });

          const nextPurchase = {
              id: generateNextId('PO', stagedPurchases, companyConfig),
              date: new Date().toISOString(),
              supplierId: supId,
              items: poItems,
              total: poItems.reduce((sum, p) => sum + (p.quantity * p.cost), 0),
              status: 'Draft',
              paymentStatus: 'Unpaid',
              paidAmount: 0,
              notes: 'Auto-generated via MRP recursive demand analysis.'
          };

          stagedPurchases.push(nextPurchase);
          await addPurchase(nextPurchase);
          ordersCreated++;
      }

      notify(`${ordersCreated} Procurement Drafts generated successfully.`, 'success');
      setSelectedItemIds([]);
      navigate('/purchases');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col font-sans text-[13px] leading-relaxed text-slate-700 bg-slate-50/30">
        <div className="mb-4 md:mb-6 flex justify-between items-center shrink-0 px-2 md:px-4 py-2.5 md:py-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm">
           <div>
               <h1 className="text-[20px] md:text-[24px] font-bold flex items-center gap-3 tracking-tight uppercase text-slate-800">
                   <Layers className="text-blue-600" size={24}/> MRP Intelligence
               </h1>
               <p className="text-[12.5px] text-slate-500 mt-0.5 font-medium">Multi-level BOM explosion for {activeWOs.length} active work orders.</p>
           </div>
           {selectedItemIds.length > 0 && (
               <button onClick={handleGeneratePOs} className="bg-blue-600 text-white px-3.5 py-2 md:px-4 md:py-2 rounded-xl font-semibold text-[13px] uppercase tracking-wide hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-900/10 animate-in zoom-in-95 transition-all active:scale-95 border border-blue-500/20">
                   <PackagePlus size={16}/> Generate {selectedItemIds.length} Lines
               </button>
           )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0">
             <div className="bg-slate-50/50 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex items-center gap-4 group">
                 <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner border border-rose-100/50">
                    <TrendingDown size={24}/>
                 </div>
                 <div>
                    <h3 className="text-[12.5px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Shortages</h3>
                    <div className="text-[22px] font-bold text-slate-800 tabular-nums leading-none">{mrpReport.filter(i => i.status === 'Critical').length}</div>
                 </div>
             </div>
             <div className="bg-slate-50/50 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex items-center gap-4 group">
                 <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner border border-blue-100/50">
                    <Truck size={24}/>
                 </div>
                 <div>
                    <h3 className="text-[12.5px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Inbound</h3>
                    <div className="text-[22px] font-bold text-slate-800 tabular-nums leading-none">
                        {mrpReport.reduce((s, i) => s + (i.inboundQty > 0 ? 1 : 0), 0)} <span className="text-[12.5px] font-semibold text-slate-400 ml-1">Items</span>
                    </div>
                 </div>
             </div>
             <div className="bg-slate-50/50 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex items-center gap-4 group">
                 <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner border border-amber-100/50">
                    <AlertTriangle size={24}/>
                 </div>
                 <div>
                    <h3 className="text-[12.5px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Warnings</h3>
                    <div className="text-[22px] font-bold text-slate-800 tabular-nums leading-none">{mrpReport.filter(i => i.status === 'Buffer Warning').length}</div>
                 </div>
             </div>
             <div className="bg-slate-800 p-4 rounded-2xl shadow-md flex items-center gap-4 text-slate-100 relative overflow-hidden group border border-slate-700">
                 <div className="absolute -top-4 -right-4 p-4 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700"><Truck size={80}/></div>
                 <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <CheckSquare size={24} className="text-blue-400"/>
                 </div>
                 <div>
                    <h3 className="text-[12.5px] font-semibold text-blue-300/80 uppercase tracking-wider mb-0.5">Yield</h3>
                    <div className="text-[22px] font-bold tabular-nums leading-none">{mrpReport.filter(i => i.status === 'Healthy').length} <span className="text-[12.5px] font-semibold text-slate-400 ml-1">Active</span></div>
                 </div>
             </div>
        </div>

        <div className="bg-slate-50/30 rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-2.5 bg-slate-100/50 border-b border-slate-200 flex items-center gap-3">
                <Info size={14} className="text-blue-500 shrink-0"/>
                <p className="text-[12.5px] font-semibold text-slate-600 uppercase tracking-wide">Logic: Net Position = (On-Hand + Inbound) - Gross Demand. Replenish suggestions auto-deduct items already in transit.</p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-[12.5px] leading-relaxed border-separate border-spacing-0">
                    <thead className="bg-slate-50/90 backdrop-blur-sm text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10 text-[13.5px] uppercase tracking-wider">
                        <tr>
                            <th className="w-14 px-4 py-2 text-center border-b border-slate-200">
                                <button onClick={() => setSelectedItemIds(selectedItemIds.length === mrpReport.length ? [] : mrpReport.map(i => i.id))} className="text-slate-400 hover:text-blue-600 transition-colors">
                                    {selectedItemIds.length > 0 && selectedItemIds.length === mrpReport.length ? <CheckSquare size={18}/> : <Square size={18}/>}
                                </button>
                            </th>
                            <th className="px-4 py-2 border-b border-slate-200 font-bold">Component Material</th>
                            <th className="px-4 py-2 text-right border-b border-slate-200 font-bold">On-Hand</th>
                            <th className="px-4 py-2 text-right border-b border-slate-200 font-bold">Inbound</th>
                            <th className="px-4 py-2 text-right border-b border-slate-200 font-bold">Net Position</th>
                            <th className="px-4 py-2 text-center border-b border-slate-200 font-bold">Procurement Advice</th>
                            <th className="px-4 py-2 text-right border-b border-slate-200 font-bold">Preferred Vendor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {mrpReport.map(row => (
                            <tr key={row.id} className={`hover:bg-blue-50/40 transition-colors cursor-pointer group ${row.status === 'Critical' ? 'bg-rose-50/20' : ''}`} onClick={() => handleToggleSelect(row.id)}>
                                <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => handleToggleSelect(row.id)} className={`transition-colors ${selectedItemIds.includes(row.id) ? 'text-blue-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                        {selectedItemIds.includes(row.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                                    </button>
                                </td>
                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-xl shadow-inner overflow-hidden shrink-0 border border-slate-200/60 group-hover:border-blue-200 transition-colors">
                                            <OfflineImage src={row.image} alt={row.name} className="w-full h-full object-cover"/>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate text-[13px]">{row.name}</div>
                                            <div className="text-[12.5px] text-slate-500 font-mono tracking-tight uppercase mt-0.5">{row.sku}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-right font-bold text-slate-700 tabular-nums">{row.currentStock}</td>
                                <td className="px-4 py-2 text-right font-bold text-blue-700 tabular-nums">+{row.inboundQty}</td>
                                <td className="px-4 py-2 text-right">
                                    <div className="flex flex-col items-end">
                                        <span className={`text-[13px] font-bold tabular-nums ${row.netStock < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                            {row.netStock.toFixed(1)} <span className="text-[12px] font-medium text-slate-400 ml-0.5">{row.unit}</span>
                                        </span>
                                        <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-tight">Req: {row.requiredQty}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-center">
                                    {row.suggestedOrder > 0 ? (
                                        <div className="inline-flex flex-col items-center">
                                            <span className="bg-blue-600 text-slate-50 px-2.5 py-0.5 rounded-lg font-bold text-[12px] uppercase shadow-md shadow-blue-900/10 border border-blue-500/20">
                                                +{row.suggestedOrder.toFixed(1)}
                                            </span>
                                            <span className={`text-[12px] font-bold mt-0.5 uppercase tracking-wider ${row.status === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`}>{row.status}</span>
                                        </div>
                                    ) : (
                                        <span className="text-emerald-700 font-bold text-[12px] uppercase flex items-center justify-center gap-1.5"><ShieldCheck size={14}/> Covered</span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    {row.preferredSupplierId ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-[12.5px] font-bold text-slate-700">{getSupplierName(row.preferredSupplierId)}</span>
                                            <span className="text-[12px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1">Source Linked</span>
                                        </div>
                                    ) : (
                                        <span className="text-[12px] font-semibold text-slate-400 uppercase italic">Unassigned</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {mrpReport.length === 0 && (
                            <tr><td colSpan={7} className="p-20 text-center text-slate-400 font-medium italic">All production requirements are currently covered by available inventory and inbound shipments.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default MRP;
