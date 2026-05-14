import React, { useState, useMemo } from 'react';
import { 
  Share2, Truck, ExternalLink, Clock, CheckCircle, 
  AlertCircle, Plus, Search, Filter, FileText, 
  Building2, ArrowRight, Package, DollarSign, X, 
  ChevronRight, ArrowLeftRight, Trash2, Edit2
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { WorkOrder, SubcontractOrder } from '../../types';
import { generateNextId } from '../../utils/helpers';

const Subcontracting: React.FC = () => {
    const { workOrders, companyConfig, notify, updateWorkOrder, subcontractOrders, addSubcontractOrder, updateSubcontractOrder, deleteSubcontractOrder, purchases } = useData();
    
    // Derive Supplier List from Purchases
    const supplierNames = useMemo(() => {
        const names = new Set<string>();
        purchases?.forEach(p => {
            if (p.supplierId) names.add(p.supplierId); // In this system, supplierId seems to be used as the name
        });
        return Array.from(names).sort();
    }, [purchases]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form State
    const [selectedWoId, setSelectedWoId] = useState('');
    const [selectedSupId, setSelectedSupId] = useState('');
    const [opName, setOpName] = useState('Lamination');
    const [qty, setQty] = useState(0);
    const [cost, setCost] = useState(0);
    const [dueDate, setDueDate] = useState('');

    const currency = companyConfig.currencySymbol;

    // Filter Work Orders that are actionable for outsourcing
    const activeWOs = useMemo(() => 
        workOrders.filter(wo => ['Scheduled', 'In Progress'].includes(wo.status)),
    [workOrders]);

    const handleCreateSubOrder = async () => {
        if (!selectedWoId || !selectedSupId) return;

        const newOrderId = generateNextId('SUB', subcontractOrders, companyConfig);
        const newOrder: SubcontractOrder = {
            id: newOrderId,
            workOrderId: selectedWoId,
            supplierId: selectedSupId,
            operationName: opName,
            quantity: qty,
            cost: cost,
            date: new Date().toISOString(),
            dueDate: dueDate || new Date().toISOString(),
            status: 'Sent'
        };

        await addSubcontractOrder(newOrder);
        
        // Update the Work Order to reflect outsourcing
        const wo = workOrders.find(w => w.id === selectedWoId);
        if (wo) {
            updateWorkOrder({
                ...wo,
                notes: `${wo.notes || ''} [OUTSOURCED: ${opName} to ${selectedSupId}]`
            });
        }

        notify("Subcontracting Order Sent to Partner", "success");
        setIsModalOpen(false);
        resetForm();
    };

    const resetForm = () => {
        setSelectedWoId('');
        setSelectedSupId('');
        setOpName('Lamination');
        setQty(0);
        setCost(0);
        setDueDate('');
    };

    const handleUpdateStatus = async (id: string, status: SubcontractOrder['status']) => {
        const order = subcontractOrders.find(o => o.id === id);
        if (order) {
            await updateSubcontractOrder({ ...order, status });
            notify(`Subcontract status updated to ${status}`, "info");
        }
    };

    const handleDeleteOrder = async (id: string) => {
        if (confirm("Delete this subcontract record?")) {
            await deleteSubcontractOrder(id);
            notify("Record deleted", "info");
        }
    };

    const handleOpenPortal = (vendorId: string) => {
        const url = window.location.origin + window.location.pathname + `#/portal/vendor/${vendorId}`;
        window.open(url, '_blank');
        notify("Opening Subcontractor Portal...", "info");
    };

    const filteredSubcontracts = (subcontractOrders || []).filter(o => 
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.operationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.supplierId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8fafc] font-sans overflow-hidden">
            <header className="px-10 py-6 border-b border-slate-200 bg-white/70 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                        <Share2 size={24} className="text-purple-600"/> Subcontracting
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Manage external production partners and outsourced operations.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition-all shadow-lg flex items-center gap-2"
                    >
                        <Plus size={16}/> New Sub-Job
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <main className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-8">
                    {/* Partner Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(supplierNames || []).slice(0, 3).map(name => (
                            <div key={name} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 group-hover:scale-110 transition-transform">
                                        <Building2 size={24}/>
                                    </div>
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase">Partner</span>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 mb-1">{name}</h3>
                                <p className="text-xs text-slate-500 mb-6 flex items-center gap-2"><Clock size={12}/> Lead Time: 3-5 Days</p>
                                
                                <div className="space-y-2 mb-8">
                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        <span>Active Jobs</span>
                                        <span className="text-slate-900">{(subcontractOrders || []).filter(o => o.supplierId === name && o.status !== 'Completed').length}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500" style={{width: '60%'}}></div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleOpenPortal(name)}
                                    className="w-full py-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all flex items-center justify-center gap-2"
                                >
                                    <ExternalLink size={14}/> Launch Vendor Portal
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Active Sub-Jobs Table */}
                    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2">
                                <Package size={16} className="text-blue-500"/> Pipeline & Fulfillment
                            </h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                <input 
                                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/5 transition-all w-64"
                                    placeholder="Search subcontract jobs..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/60 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="table-header px-6 py-4">Job / Vendor</th>
                                    <th className="table-header px-6 py-4">Operation</th>
                                    <th className="table-header px-6 py-4 text-center">Qty Sent</th>
                                    <th className="table-header px-6 py-4 text-center">Due Back</th>
                                    <th className="table-header px-6 py-4 text-center">Status</th>
                                    <th className="table-header px-6 py-4 text-right">Cost</th>
                                    <th className="table-header px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredSubcontracts.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="table-body-cell px-6 py-5">
                                            <div className="font-bold text-slate-800">{workOrders.find(w => w.id === order.workOrderId)?.productName || 'Custom Job'}</div>
                                            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">Out to: {order.supplierId}</div>
                                        </td>
                                        <td className="table-body-cell px-6 py-5">
                                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[10px] uppercase border border-blue-100">{order.operationName}</span>
                                        </td>
                                        <td className="table-body-cell px-6 py-5 text-center font-bold text-slate-700 finance-nums">{order.quantity}</td>
                                        <td className="table-body-cell px-6 py-5 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-xs font-bold text-slate-600">{new Date(order.dueDate).toLocaleDateString()}</span>
                                                {new Date(order.dueDate) < new Date() && order.status !== 'Completed' && (
                                                    <span className="text-[8px] text-rose-500 font-black uppercase">Overdue</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="table-body-cell px-6 py-5 text-center">
                                            <select 
                                                className={`text-[10px] font-bold uppercase border rounded px-1.5 py-0.5 outline-none cursor-pointer
                                                    ${order.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}
                                                value={order.status}
                                                onChange={e => handleUpdateStatus(order.id, e.target.value as any)}
                                            >
                                                <option>Sent</option>
                                                <option>In Progress</option>
                                                <option>Completed</option>
                                                <option>Returned</option>
                                                <option>Cancelled</option>
                                            </select>
                                        </td>
                                        <td className="table-body-cell px-6 py-5 text-right font-bold text-slate-900 finance-nums">
                                            {currency}{order.cost.toFixed(2)}
                                        </td>
                                        <td className="table-body-cell px-6 py-5 text-right">
                                            <button onClick={() => handleDeleteOrder(order.id)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredSubcontracts.length === 0 && (
                                    <tr><td colSpan={7} className="table-body-cell p-20 text-center text-slate-400 font-medium italic">No outsourced jobs matching search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2"><ArrowLeftRight className="text-purple-600"/> Outsource Operation</h2>
                            <button onClick={() => setIsModalOpen(false)}><X/></button>
                        </div>
                        <div className="p-8 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Select Work Order</label>
                                <select className="w-full p-3 border border-slate-200 rounded-2xl bg-white text-sm font-bold" value={selectedWoId} onChange={e => setSelectedWoId(e.target.value)}>
                                    <option value="">-- Select Active Job --</option>
                                    {activeWOs.map(wo => <option key={wo.id} value={wo.id}>{wo.id} - {wo.productName} ({wo.quantityPlanned} units)</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Partner Supplier</label>
                                <select className="w-full p-3 border border-slate-200 rounded-2xl bg-white text-sm font-bold" value={selectedSupId} onChange={e => setSelectedSupId(e.target.value)}>
                                    <option value="">-- Select Partner --</option>
                                    {supplierNames.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Operation</label>
                                    <input className="w-full p-3 border border-slate-200 rounded-2xl text-sm" value={opName} onChange={e => setOpName(e.target.value)} placeholder="e.g. UV Varnish" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Expected Back</label>
                                    <input type="date" className="w-full p-3 border border-slate-200 rounded-2xl text-sm" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Units Sent</label>
                                    <input type="number" className="w-full p-3 border border-slate-200 rounded-2xl text-sm font-bold" value={qty} onChange={e => setQty(parseFloat(e.target.value))} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Agreed Cost</label>
                                    <input type="number" className="w-full p-3 border border-slate-200 rounded-2xl text-sm font-bold text-emerald-600" value={cost} onChange={e => setCost(parseFloat(e.target.value))} />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 border border-slate-300 rounded-2xl font-black uppercase text-[10px] tracking-widest text-slate-600 hover:bg-white transition-all">Cancel</button>
                            <button onClick={handleCreateSubOrder} className="px-8 py-3 bg-purple-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-700 shadow-xl shadow-purple-900/20 active:scale-95 transition-all">Create Subcontract Order</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Subcontracting;
