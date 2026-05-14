import React, { useState, useMemo, useRef } from 'react';
import { 
  PackageCheck, Plus, Search, Calendar, Filter, CheckCircle, 
  AlertTriangle, Truck, Save, X, Printer, Trash2, Edit2, 
  ClipboardCheck, Barcode, Scale, AlertCircle, Eye, Package, Sparkles, Loader2,
  Ship, ArrowDownRight, Landmark, FileText, Download
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useInventory } from '../../context/InventoryContext';
import { GoodsReceipt, Purchase, Item, LandingCostItem } from '../../types';
import { useNavigate } from 'react-router-dom';
import { OfflineImage } from '../../components/OfflineImage';
import { pdf } from '@react-pdf/renderer';
import { InvoiceTemplate } from '../shared/components/PDF/InvoiceTemplate';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocData } from '../shared/components/PDF/schemas';
import { extractDeliveryNoteData } from '../../services/geminiService';
import { attachDocumentSecurity } from '../../utils/documentSecurity';

const GoodsReceived: React.FC = () => {
  const { purchases, goodsReceipts, inventory, warehouses, saveGoodsReceipt, processGoodsReceipt, deleteGoodsReceipt } = useInventory();
  // Fixed: Added 'user' to destructured properties from useData to resolve the error on line 154
  const { suppliers, notify, companyConfig, isOnline, user } = useData();
  const navigate = useNavigate();
  const currency = companyConfig.currencySymbol;

  const [view, setView] = useState<'List' | 'Form'>('List');
  const [activeTab, setActiveTab] = useState<'Pending' | 'History'>('Pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [editingGrn, setEditingGrn] = useState<Partial<GoodsReceipt>>({});
  const [selectedPO, setSelectedPO] = useState<Purchase | null>(null);

  // Scanning State
  const magicScanRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  // --- Helpers ---
  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || id;
  const getItemName = (id: string) => inventory.find(i => i.id === id)?.name || id;
  const getItemSKU = (id: string) => inventory.find(i => i.id === id)?.sku || '';

  // --- List Data ---
  const pendingPOs = useMemo(() => {
      return (purchases || []).filter(p => 
          (p.status === 'Ordered' || p.status === 'Partially Received') &&
          getSupplierName(p.supplierId).toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [purchases, searchTerm, suppliers]);

  const historyGRNs = useMemo(() => {
      return (goodsReceipts || []).filter(g => 
          (g.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (g.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (g.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase())
      ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [goodsReceipts, searchTerm]);

  // --- Handlers ---

  const handleScanGRN = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!isOnline) {
          notify("Scanning requires internet connection.", "error");
          return;
      }

      setIsScanning(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          try {
              const extracted = await extractDeliveryNoteData(base64);
              if (extracted) {
                  const matchingPO = (purchases || []).find(po => 
                      po.id === extracted.purchaseOrderId || 
                      (extracted.purchaseOrderId && po.id.includes(extracted.purchaseOrderId)) ||
                      (extracted.reference && po.reference === extracted.reference)
                  );

                  const grnItems = (extracted.items || []).map((item: any) => {
                      const matchedInv = (inventory || []).find(i => 
                          i.name.toLowerCase().includes(item.name.toLowerCase()) ||
                          item.name.toLowerCase().includes(i.name.toLowerCase())
                      );

                      return {
                          itemId: matchedInv ? matchedInv.id : 'UNKNOWN',
                          name: matchedInv ? matchedInv.name : item.name,
                          orderedQty: item.qty || 0,
                          quantityReceived: item.qty || 0,
                          quantityRejected: 0,
                          warehouseId: (warehouses && warehouses[0]?.id) || 'WH-MAIN',
                          cost: matchedInv?.cost || 0,
                          batchNumber: '',
                          expiryDate: ''
                      };
                  });

                  setEditingGrn({
                      id: '',
                      purchaseOrderId: matchingPO ? matchingPO.id : (extracted.purchaseOrderId || 'MANUAL'),
                      date: extracted.date || new Date().toISOString().split('T')[0],
                      supplierId: matchingPO ? matchingPO.supplierId : (suppliers.find(s => s.name.toLowerCase().includes(extracted.supplierName?.toLowerCase()))?.id || 'UNKNOWN'),
                      supplierName: extracted.supplierName || 'Unknown Supplier',
                      status: 'Draft',
                      items: grnItems,
                      reference: extracted.reference || '',
                      receivedBy: 'System AI',
                      landingCosts: matchingPO?.landingCosts || []
                  });

                  if (matchingPO) {
                      setSelectedPO(matchingPO);
                      notify(`Delivery Note matched to PO #${matchingPO.id}`, "success");
                  } else {
                      notify("Delivery Note scanned. No matching PO found, created as standalone.", "info");
                  }
                  setView('Form');
              } else {
                  notify("Could not extract data from the image.", "error");
              }
          } catch (err) {
              console.error(err);
              notify("AI Analysis failed.", "error");
          } finally {
              setIsScanning(false);
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const handleCreateFromPO = (po: Purchase) => {
      const newItems = (po.items || []).map(item => {
          const remaining = (item.quantity || 0) - (item.receivedQty || 0);
          return {
              itemId: item.itemId,
              name: item.name,
              orderedQty: item.quantity || 0,
              quantityReceived: Math.max(0, remaining), 
              quantityRejected: 0,
              warehouseId: po.targetWarehouseId || (warehouses && warehouses[0]?.id) || 'WH-MAIN',
              cost: item.cost || 0,
              batchNumber: '',
              expiryDate: ''
          };
      });

      setEditingGrn({
          purchaseOrderId: po.id,
          date: new Date().toISOString().split('T')[0],
          supplierId: po.supplierId,
          supplierName: getSupplierName(po.supplierId),
          status: 'Draft',
          items: newItems,
          receivedBy: user?.name || 'Current User',
          landingCosts: po.landingCosts || []
      });
      setSelectedPO(po);
      setView('Form');
  };

  const handleEditGrn = (grn: GoodsReceipt) => {
      setEditingGrn(grn);
      const po = (purchases || []).find(p => p.id === grn.purchaseOrderId);
      setSelectedPO(po || null);
      setView('Form');
  };

  const handleDownloadPDF = async (grn: GoodsReceipt) => {
        try {
            notify("Preparing GRN PDF...", "info");
            
            const pdfData: PrimeDocData = {
                number: grn.id,
                date: new Date(grn.date).toLocaleDateString(),
                clientName: grn.supplierName,
                address: 'N/A',
                items: grn.items.map((i: any) => ({
                    desc: i.name,
                    qty: i.quantityReceived,
                })),
                notes: `Ref: ${grn.purchaseOrderId || 'N/A'}`
            };

            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<InvoiceTemplate data={securedPdfData as PrimeDocData} type="DELIVERY_NOTE" />).toBlob();
            const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `GRN-${grn.id}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
          notify("GRN PDF downloaded successfully", "success");
      } catch (error) {
          console.error("PDF generation failed:", error);
          notify("Failed to generate PDF", "error");
      }
  };

  const handleSaveDraft = async () => {
      if (!editingGrn.purchaseOrderId || !editingGrn.items) return;
      
      const grnData = {
          ...editingGrn,
          id: editingGrn.id || '',
          supplierName: getSupplierName(editingGrn.supplierId || ''),
      } as GoodsReceipt;

      const savedId = await saveGoodsReceipt(grnData);
      setEditingGrn(prev => ({ ...prev, id: savedId }));
      notify("GRN Draft Saved", "success");
  };

  const handleVerify = async () => {
      if (!editingGrn.id) {
          notify("Please save draft first.", "error");
          return;
      }
      if (confirm("Verify GRN? This will update inventory stock and capitalize Landing Costs.")) {
          await processGoodsReceipt(editingGrn as GoodsReceipt);
          setView('List');
          setActiveTab('History');
      }
  };

  const handleDelete = (id: string) => {
      if (confirm("Delete this GRN Draft?")) {
          deleteGoodsReceipt(id);
      }
  };

  const updateLineItem = (index: number, field: string, value: any) => {
      const newItems = [...(editingGrn.items || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      setEditingGrn({ ...editingGrn, items: newItems });
  };

  const updateLandingCost = (index: number, field: string, value: any) => {
      const newCosts = [...(editingGrn.landingCosts || [])];
      newCosts[index] = { ...newCosts[index], [field]: value };
      setEditingGrn({ ...editingGrn, landingCosts: newCosts });
  };

  const toggleAllReceived = () => {
      const newItems = (editingGrn.items || []).map(item => {
          const remaining = item.orderedQty || 0; 
          return { ...item, quantityReceived: remaining };
      });
      setEditingGrn({ ...editingGrn, items: newItems });
  };

  // --- UI RENDERERS ---

  const renderList = () => (
      <div className="flex-1 flex flex-col min-h-0 bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
          <div className="flex border-b border-slate-200/60">
              <button 
                  onClick={() => setActiveTab('Pending')}
                  className={`flex-1 py-3 text-[13px] font-bold transition-colors ${activeTab === 'Pending' ? 'bg-blue-50/50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  Pending Orders ({(pendingPOs || []).length})
              </button>
              <button 
                  onClick={() => setActiveTab('History')}
                  className={`flex-1 py-3 text-[13px] font-bold transition-colors ${activeTab === 'History' ? 'bg-blue-50/50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  Received History
              </button>
          </div>

          <div className="p-4 border-b border-slate-200/60 flex gap-4 bg-slate-50/30">
              <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                  <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder={activeTab === 'Pending' ? "Search POs or Suppliers..." : "Search GRNs..."}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                  />
              </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50/80 backdrop-blur text-slate-500 font-bold border-b border-slate-200/60 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="table-header p-4 uppercase tracking-tight">{activeTab === 'Pending' ? 'PO Number' : 'GRN ID'}</th>
                        <th className="table-header p-4 uppercase tracking-tight">Date</th>
                        <th className="table-header p-4 uppercase tracking-tight">Supplier</th>
                        <th className="table-header p-4 text-center uppercase tracking-tight">Items</th>
                        <th className="table-header p-4 text-center uppercase tracking-tight">Status</th>
                        <th className="table-header p-4 text-right uppercase tracking-tight">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                    {activeTab === 'Pending' ? (
                        (pendingPOs || []).length === 0 ? (
                            <tr><td colSpan={6} className="table-body-cell p-8 text-center text-slate-400">No pending orders found.</td></tr>
                        ) : (
                            pendingPOs.map(po => (
                                <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="table-body-cell p-4 font-mono font-bold text-blue-600 text-[13px]">{po.id}</td>
                                    <td className="table-body-cell p-4 text-slate-500 finance-nums">{new Date(po.date).toLocaleDateString()}</td>
                                    <td className="table-body-cell p-4 font-bold text-slate-900">{getSupplierName(po.supplierId)}</td>
                                    <td className="table-body-cell p-4 text-center finance-nums">{(po.items || []).length} Lines</td>
                                    <td className="table-body-cell p-4 text-center">
                                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold border border-amber-100 uppercase tracking-tight">{po.status}</span>
                                    </td>
                                    <td className="table-body-cell p-4 text-right">
                                        <button 
                                            onClick={() => handleCreateFromPO(po)}
                                            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[13px] font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2 ml-auto"
                                        >
                                            <Truck size={14}/> Receive
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )
                    ) : (
                        (historyGRNs || []).length === 0 ? (
                            <tr><td colSpan={6} className="table-body-cell p-8 text-center text-slate-400">No received notes found.</td></tr>
                        ) : (
                            historyGRNs.map(grn => (
                                <tr key={grn.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="table-body-cell p-4 font-mono font-bold text-slate-700 text-[13px]">
                                        {grn.id}
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Ref: <span className="finance-nums">{grn.purchaseOrderId}</span></div>
                                    </td>
                                    <td className="table-body-cell p-4 text-slate-500 finance-nums">{new Date(grn.date).toLocaleDateString()}</td>
                                    <td className="table-body-cell p-4 font-bold text-slate-900">{grn.supplierName}</td>
                                    <td className="table-body-cell p-4 text-center finance-nums">{(grn.items || []).length} Lines</td>
                                    <td className="table-body-cell p-4 text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${grn.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'} uppercase tracking-tight`}>
                                            {grn.status}
                                        </span>
                                    </td>
                                    <td className="table-body-cell p-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => handleDownloadPDF(grn)} 
                                            className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all" 
                                            title="Download PDF"
                                        >
                                            <Download size={16}/>
                                        </button>
                                        {grn.status === 'Draft' ? (
                                            <button 
                                                onClick={() => handleEditGrn(grn)} 
                                                className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all" 
                                                title="Edit"
                                            >
                                                <Edit2 size={16}/>
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleEditGrn(grn)} 
                                                className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all" 
                                                title="View"
                                            >
                                                <Eye size={16}/>
                                            </button>
                                        )}
                                        {grn.status === 'Draft' && (
                                            <button onClick={() => handleDelete(grn.id)} className="p-2 text-slate-500 hover:text-red-600 bg-slate-50 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-all" title="Delete">
                                                <Trash2 size={16}/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )
                    )}
                </tbody>
              </table>
          </div>
      </div>
  );

  const renderForm = () => (
      <div id="grn-panel" className="flex-1 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <button onClick={() => setView('List')} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                      <X size={20}/>
                  </button>
                  <div>
                      <h2 className="text-[24px] font-bold text-slate-900 flex items-center gap-2">
                          <ClipboardCheck className="text-blue-600"/> Goods Received Note
                      </h2>
                      <div className="flex gap-3 text-[10px] font-bold uppercase tracking-tight text-slate-500 mt-1">
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-[13px] finance-nums">{editingGrn.id || 'NEW'}</span>
                          <span>PO: <b className="finance-nums">{editingGrn.purchaseOrderId}</b></span>
                          <span>Supplier: <b>{editingGrn.supplierName}</b></span>
                      </div>
                  </div>
              </div>
              <div className="flex gap-2">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tight ${editingGrn.status === 'Verified' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {editingGrn.status?.toUpperCase()}
                  </div>
              </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  
                  {/* Landing Costs Verification */}
                  {(editingGrn.landingCosts?.length || 0) > 0 && (
                      <div className="mb-10 animate-in fade-in slide-in-from-top-4">
                          <div className="flex justify-between items-center mb-4">
                              <h3 className="font-bold text-slate-700 text-[13px] flex items-center gap-2"><Ship size={18} className="text-blue-600"/> Capitalized Landing Costs</h3>
                              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Verification Phase</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {editingGrn.landingCosts?.map((cost, idx) => (
                                  <div key={cost.id} className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100/50 flex flex-col gap-3">
                                      <div className="flex justify-between items-start">
                                          <div className="flex items-center gap-2">
                                              <div className="p-1.5 bg-white rounded-lg border border-blue-100 text-blue-500"><Landmark size={14}/></div>
                                              <span className="text-[13px] font-bold text-slate-800">{cost.category}</span>
                                          </div>
                                          <span className="text-[10px] font-bold uppercase tracking-tight font-mono text-slate-400">#{(cost.id || '').split('-').pop()}</span>
                                      </div>
                                      <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-blue-600">{currency}</span>
                                          <input 
                                              type="number"
                                              disabled={editingGrn.status === 'Verified'}
                                              className="w-full pl-7 p-2 border border-blue-200 rounded-xl text-[13px] font-bold outline-none focus:border-blue-500 bg-white finance-nums"
                                              value={cost.amount || ''}
                                              onChange={e => updateLandingCost(idx, 'amount', parseFloat(e.target.value) || 0)}
                                          />
                                      </div>
                                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic truncate" title={cost.description}>{cost.description || 'No description'}</p>
                                  </div>
                              ))}
                          </div>
                          <div className="mt-4 p-4 bg-slate-900 rounded-2xl flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase tracking-tight text-blue-400">Total Capitalized Load</span>
                              <span className="text-[24px] font-bold text-white finance-nums">{currency}{(editingGrn.landingCosts?.reduce((s,c)=>s+(c.amount || 0),0) || 0).toLocaleString()}</span>
                          </div>
                      </div>
                  )}

                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-slate-700 text-[13px] flex items-center gap-2"><PackageCheck size={18} className="text-emerald-600"/> Line Items</h3>
                      {editingGrn.status === 'Draft' && (
                          <button onClick={toggleAllReceived} className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1 uppercase tracking-tight">
                              <CheckCircle size={14}/> Receive All Ordered
                          </button>
                      )}
                  </div>
                  
                  <div className="space-y-4">
                      {(editingGrn.items || []).map((item, idx) => (
                          <div key={idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:border-blue-300 transition-colors">
                              <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
                                          <Package size={20} className="text-slate-400"/>
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-800 text-[13px]">{getItemName(item.itemId)}</div>
                                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight font-mono">SKU: <span className="finance-nums">{getItemSKU(item.itemId)}</span></div>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Ordered</div>
                                      <div className="font-bold text-[24px] text-slate-800 finance-nums">{item.orderedQty || 0}</div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Received Qty</label>
                                      <input 
                                          type="number" 
                                          min="0"
                                          disabled={editingGrn.status === 'Verified'}
                                          className="w-full p-2 border border-slate-300 rounded-lg text-[13px] font-bold bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-center text-emerald-700 finance-nums"
                                          value={item.quantityReceived || 0}
                                          onChange={e => updateLineItem(idx, 'quantityReceived', parseFloat(e.target.value) || 0)}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Rejected Qty</label>
                                      <input 
                                          type="number" 
                                          min="0"
                                          disabled={editingGrn.status === 'Verified'}
                                          className={`w-full p-2 border rounded-lg text-[13px] font-bold bg-white focus:ring-2 focus:ring-red-500 outline-none text-center finance-nums ${(item.quantityRejected || 0) > 0 ? 'border-red-300 text-red-600 bg-red-50' : 'border-slate-300 text-slate-400'}`}
                                          value={item.quantityRejected || 0}
                                          onChange={e => updateLineItem(idx, 'quantityRejected', parseFloat(e.target.value) || 0)}
                                      />
                                  </div>
                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1 tracking-tight">
                                          <Barcode size={10}/> Batch / Lot #
                                      </label>
                                      <input 
                                          type="text" 
                                          disabled={editingGrn.status === 'Verified'}
                                          className="w-full p-2 border border-slate-300 rounded-lg text-[13px] font-bold bg-white"
                                          placeholder="Optional"
                                          value={item.batchNumber || ''}
                                          onChange={e => updateLineItem(idx, 'batchNumber', e.target.value)}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1 tracking-tight">
                                          <Calendar size={10}/> Expiry
                                      </label>
                                      <input 
                                          type="date" 
                                          disabled={editingGrn.status === 'Verified'}
                                          className="w-full p-2 border border-slate-300 rounded-lg text-[13px] font-bold bg-white"
                                          value={item.expiryDate || ''}
                                          onChange={e => updateLineItem(idx, 'expiryDate', e.target.value)}
                                      />
                                  </div>
                              </div>

                              {(item.quantityRejected || 0) > 0 && (
                                  <div className="mt-3 pt-3 border-t border-slate-200">
                                      <input 
                                          type="text" 
                                          disabled={editingGrn.status === 'Verified'}
                                          className="w-full p-2 border border-red-200 bg-red-50 rounded-lg text-[10px] font-bold uppercase tracking-tight text-red-800 placeholder-red-300"
                                          placeholder="Reason for rejection (e.g. Damaged, Expired)"
                                          value={item.rejectionReason || ''}
                                          onChange={e => updateLineItem(idx, 'rejectionReason', e.target.value)}
                                      />
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>

              <div className="w-full md:w-80 bg-slate-50 border-l border-slate-200 p-6 flex flex-col overflow-y-auto">
                  <h3 className="font-bold text-slate-800 text-[13px] mb-4">GRN Details</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Received Date</label>
                          <input 
                              type="date" 
                              disabled={editingGrn.status === 'Verified'}
                              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-[13px] font-bold finance-nums"
                              value={editingGrn.date || ''}
                              onChange={e => setEditingGrn({...editingGrn, date: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Vendor Delivery Note #</label>
                          <input 
                              type="text" 
                              disabled={editingGrn.status === 'Verified'}
                              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-[13px] font-bold"
                              placeholder="e.g. DN-9988"
                              value={editingGrn.reference || ''}
                              onChange={e => setEditingGrn({...editingGrn, reference: e.target.value})}
                          />
                      </div>

                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Received To</label>
                          <select 
                              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-[13px] font-bold"
                              disabled
                              value={(warehouses && warehouses[0]?.id) || ''}
                          >
                              {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tight">Notes</label>
                          <textarea 
                              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-[13px] font-bold h-24 resize-none"
                              disabled={editingGrn.status === 'Verified'}
                              placeholder="Condition of goods, delivery method..."
                              value={editingGrn.notes || ''}
                              onChange={e => setEditingGrn({...editingGrn, notes: e.target.value})}
                          />
                      </div>
                  </div>

                  {editingGrn.status === 'Draft' && (
                      <div className="mt-auto space-y-3 pt-6 border-t border-slate-200">
                          <button onClick={handleSaveDraft} className="w-full py-3 border border-slate-300 bg-white text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-[13px]">
                              <Save size={16}/> Save Draft
                          </button>
                          <button onClick={handleVerify} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-[13px] shadow-lg shadow-emerald-200">
                              <CheckCircle size={16}/> Verify & Commit Stock
                          </button>
                      </div>
                  )}

                  {editingGrn.status === 'Verified' && (
                       <div className="mt-auto pt-6 border-t border-slate-200 space-y-3">
                           <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                               <CheckCircle size={32} className="mx-auto text-emerald-600 mb-2"/>
                               <h4 className="font-bold text-emerald-800 text-[13px]">Verified</h4>
                               <p className="text-[10px] font-bold uppercase tracking-tight text-emerald-600 mt-1">Stock and Landed Costs committed.</p>
                           </div>
                           <button 
                               onClick={() => handleDownloadPDF(editingGrn as any)} 
                               className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-[13px] shadow-lg shadow-blue-200"
                           >
                               <Download size={16}/> Download GRN PDF
                           </button>
                       </div>
                  )}
              </div>
          </div>
      </div>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
        <div className="mb-6 flex justify-between items-center shrink-0">
           <div>
               <h1 className="text-title flex items-center gap-2 uppercase">
                   <PackageCheck className="text-blue-600" size={20}/> Goods Received
               </h1>
               <p className="text-[13px] text-slate-500 mt-0.5">Receive inventory and finalize Landing Cost capitalization.</p>
           </div>
           
           <div className="flex gap-2">
                {isOnline && view === 'List' && (
                    <>
                        <button 
                            onClick={() => magicScanRef.current?.click()}
                            disabled={isScanning}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-[13px] flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-70"
                        >
                            {isScanning ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                            {isScanning ? 'Processing...' : 'Scan Delivery Note'}
                        </button>
                        <input 
                            type="file" 
                            accept="image/*"
                            ref={magicScanRef} 
                            className="hidden" 
                            onChange={handleScanGRN}
                        />
                    </>
                )}
           </div>
        </div>

        {view === 'List' ? renderList() : renderForm()}
    </div>
  );
};

export default GoodsReceived;
