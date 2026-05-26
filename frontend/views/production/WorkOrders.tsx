
import React, { useState, useEffect, useRef, useMemo } from 'react';
/* Added Play to the lucide-react imports */
import { Plus, LayoutGrid, List as ListIcon, Eye, Receipt, XCircle, Trash2, Edit, RefreshCw, ChevronRight, CheckSquare, Zap, Target, History, MoreVertical, MonitorPlay, FileText, Settings, Calendar, AlertTriangle, ShieldCheck, Clock, Play, Printer, X, Download, FileDown } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useProduction } from '../../context/ProductionContext';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { WorkOrderKanban } from './components/ProductionLists';
import { WorkOrderModal, MaterialReconciliationModal } from './components/ProductionForms';
import { WorkOrder, CartItem, Invoice } from '../../types';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';

/**
 * Job Hover Card
 */
const JobHoverCard: React.FC<{
    pos: { x: number, y: number },
    wo: WorkOrder
}> = ({ pos, wo }) => {
    const progress = Math.min(100, ((wo.quantityCompleted || 0) / (wo.quantityPlanned || 1)) * 100);

    return (
        <div
            className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
            style={{ top: pos.y + 10, left: pos.x + 10 }}
        >
            <div className="bg-slate-900/90 backdrop-blur-md border border-white/20 rounded-2xl shadow-premium p-4 min-w-[220px] flex flex-col gap-3">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-white">
                        <Target size={16} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-tight">Production Status</p>
                        <p className="text-[13px] font-bold text-white font-mono">{wo.id}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Product</span>
                        <span className="text-[13px] text-white font-bold truncate max-w-[120px]">{wo.productName}</span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Progress</span>
                            <span className="text-[13px] text-blue-400 font-bold finance-nums">{(progress || 0).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></div>
                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tight">Tracking Live</span>
                </div>
            </div>
        </div>
    );
};

const WorkOrders: React.FC = () => {
    const { workOrders = [], boms = [], deleteWorkOrder, createWorkOrder, updateWorkOrder, updateWorkOrderStatus } = useProduction();
    const { customers = [], convertJobOrderToInvoice } = useSales();
    const { inventory = [] } = useInventory();
    const { notify, companyConfig } = useAuth();
    const { handlePreview } = useDocumentPreview();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewType, setViewType] = useState<'Kanban' | 'List'>('List');
    const [editingOrder, setEditingOrder] = useState<WorkOrder | undefined>(undefined);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'all' | 'examination' | 'regular'>('all');

    // Advanced Options State
    const [showAdvancedMenu, setShowAdvancedMenu] = useState<string | null>(null);
    const [advancedMenuPos, setAdvancedMenuPos] = useState({ x: 0, y: 0 });

    const navigate = useNavigate();
    const location = useLocation();

    // Hover State
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
    const hoverTimerRef = useRef<any | null>(null);

    useEffect(() => {
        if (location.state?.action === 'create') {
            if (location.state.customer) {
                setEditingOrder({ customerName: location.state.customer } as any);
            } else {
                setEditingOrder(undefined);
            }
            setIsModalOpen(true);
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    const handleMouseEnter = (id: string, e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoveredId(id);
            setHoverPos({ x: clientX, y: clientY });
        }, 2000);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        // Intentionally do nothing to prevent flickering on movement
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredId(null);
    };

    const handleConvertInvoice = async (wo: WorkOrder) => {
        if (!confirm(`Generate Sales Invoice for ${wo.customerName}?`)) return;
        try {
            // Find or create a price for this item
            const item = inventory.find(i => i.id === wo.productId);
            const price = item?.price || 0;

            const joWithItems = {
                ...wo,
                items: [{
                    id: wo.productId,
                    name: wo.productName,
                    quantity: wo.quantityCompleted || wo.quantityPlanned,
                    price: price,
                    cost: item?.cost || 0,
                    category: item?.category || 'General',
                    type: (item?.type || 'Product') as any,
                    unit: item?.unit || 'pcs',
                    compositeItems: item?.isComposite ? (boms.find(b => b.productId === item.id)?.components || []) : [],
                    sku: item?.sku || wo.productId,
                    minStockLevel: 0,
                    stock: 0
                }]
            };

            const invoiceId = await convertJobOrderToInvoice(joWithItems as any);
            notify(`Invoice ${invoiceId} generated successfully.`, "success");
            navigate('/sales/invoices', { state: { action: 'view', id: invoiceId } });
        } catch (err: any) {
            notify(`Billing failed: ${err.message}`, "error");
        }
    };

    const handleDownloadPDF = async (wo: WorkOrder) => {
        try {
            notify("Preparing Work Order PDF...", "info");
            const enrichedWorkOrder = enrichDocumentCustomerData(wo, customers);
            const pdfData = mapToInvoiceData(enrichedWorkOrder, companyConfig, 'WORK_ORDER', boms, inventory);
            await initializePrimePdfFonts();
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            const blob = await pdf(<PrimeDocument type="WORK_ORDER" data={securedPdfData as any} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `WORK-ORDER-${wo.id}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Work Order PDF downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    const handlePreviewPDF = (wo: WorkOrder) => {
        handlePreview('WORK_ORDER', wo, boms, inventory);
    };

    const handleSaveWorkOrder = (data: Partial<WorkOrder>) => {
        if (editingOrder) {
            updateWorkOrder({ ...editingOrder, ...data } as WorkOrder);
            notify("Work Order updated successfully", "success");
        } else {
            createWorkOrder({
                ...data,
                quantityCompleted: 0,
                logs: [],
                status: data.status || 'Draft'
            } as WorkOrder);
            notify("New Work Order created", "success");
        }
        setIsModalOpen(false);
        setEditingOrder(undefined);
    };

    const handleOpenCreate = () => {
        setEditingOrder(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (wo: WorkOrder) => {
        setEditingOrder(wo);
        setIsModalOpen(true);
    };

    const handleOpenAdvanced = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setAdvancedMenuPos({ x: e.clientX, y: e.clientY });
        setShowAdvancedMenu(id);
    };

    const handleAdvancedAction = (id: string, action: string, value?: any) => {
        const wo = workOrders.find(w => w.id === id);
        if (!wo) return;

        switch (action) {
            case 'set_status':
                updateWorkOrderStatus(id, value);
                notify(`Job status updated to ${value}`, "info");
                break;
            case 'set_priority':
                updateWorkOrder({ ...wo, notes: (wo.notes || '') + `\n[PRIORITY]: ${value}` });
                notify(`Priority set to ${value}`, "info");
                break;
            case 'extend_date':
                const newDate = new Date(wo.dueDate);
                newDate.setDate(newDate.getDate() + 7);
                updateWorkOrder({ ...wo, dueDate: newDate.toISOString() });
                notify("Delivery date extended by 7 days", "success");
                break;
            case 'delete':
                if (confirm("Delete this work order? This is permanent.")) {
                    deleteWorkOrder(id);
                    notify("Order removed.", "info");
                    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
                }
                break;
        }
        setShowAdvancedMenu(null);
    };

    const handleToggleSelectAll = () => {
        if (selectedIds.length === workOrders.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(workOrders.map(wo => wo.id));
        }
    };

    const handleToggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0) return;
        if (confirm(`Delete ${selectedIds.length} selected work orders? This is permanent.`)) {
            try {
                for (const id of selectedIds) {
                    await deleteWorkOrder(id);
                }
                notify(`${selectedIds.length} orders removed.`, "info");
                setSelectedIds([]);
            } catch (err: any) {
                notify(`Batch delete failed: ${err.message}`, "error");
            }
        }
    };

    const hoveredWO = useMemo(() => workOrders.find(w => w.id === hoveredId), [workOrders, hoveredId]);

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'Scheduled':
            case 'Planned':
                return 'bg-amber-50 text-amber-700 border-amber-100 shadow-[0_0_8px_rgba(251,191,36,0.15)]';
            case 'In Progress':
                return 'bg-blue-50 text-blue-700 border-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.2)] animate-pulse';
            case 'QA':
            case 'Verification':
                return 'bg-purple-50 text-purple-700 border-purple-100 shadow-[0_0_8px_rgba(168,85,247,0.15)]';
            case 'Completed':
            case 'Finished':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
            case 'Cancelled':
                return 'bg-slate-100 text-slate-500 border-slate-200 opacity-60';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col font-normal">
            {hoveredId && hoverPos && hoveredWO && <JobHoverCard pos={hoverPos} wo={hoveredWO} />}

            {isModalOpen && (
                <WorkOrderModal
                    boms={boms}
                    inventory={inventory}
                    onSave={handleSaveWorkOrder}
                    onClose={() => { setIsModalOpen(false); setEditingOrder(undefined); }}
                    initialData={editingOrder}
                />
            )}

            {/* Advanced Options Popup Menu */}
            {showAdvancedMenu && (
                <>
                    <div className="fixed inset-0 z-[80]" onClick={() => setShowAdvancedMenu(null)}></div>
                    <div
                        className="fixed z-[90] bg-white rounded-2xl shadow-premium border border-slate-200 p-1 min-w-[200px] animate-in zoom-in-95 duration-100"
                        style={{ left: Math.min(advancedMenuPos.x, window.innerWidth - 220), top: Math.min(advancedMenuPos.y, window.innerHeight - 300) }}
                    >
                        <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-tight">Advanced Protocols</div>
                        <div className="py-1">
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_status', 'QA')} className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-purple-50 flex items-center gap-3"><RefreshCw size={14} /> Move to QA</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_status', 'In Progress')} className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-blue-50 flex items-center gap-3"><Play size={14} /> Force Resume</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'extend_date')} className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-amber-50 flex items-center gap-3"><Calendar size={14} /> Extend Due Date</button>
                        </div>
                        <div className="border-t border-slate-100 py-1">
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_priority', 'CRITICAL')} className="w-full text-left px-4 py-2 text-[13px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-3"><AlertTriangle size={14} /> Mark Critical</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'delete')} className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 flex items-center gap-3"><Trash2 size={14} /> Terminate Order</button>
                        </div>
                    </div>
                </>
            )}

            <div className="mb-4 flex justify-between items-center shrink-0 header-container">
                <div>
                    <h1 className="text-title flex items-center gap-2 uppercase">
                        <Target className="text-blue-600" /> Production Queue
                    </h1>
                    <p className="text-[13px] text-slate-500 mt-0.5">Manufacturing pipeline control and logistics</p>
                </div>
                <div className="flex gap-4 items-center">
                    {/* Filter buttons for examination vs regular work orders */}
                    <div className="flex bg-white/70 backdrop-blur border border-white/60 rounded-xl p-1 shadow-sm">
                        <button 
                            onClick={() => setFilterType('all')} 
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-colors ${filterType === 'all' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            All
                        </button>
                        <button 
                            onClick={() => setFilterType('examination')} 
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-colors ${filterType === 'examination' ? 'bg-purple-50 text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            📝 Examination
                        </button>
                        <button 
                            onClick={() => setFilterType('regular')} 
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-colors ${filterType === 'regular' ? 'bg-emerald-50 text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            🏭 Regular
                        </button>
                    </div>
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[13px] font-bold hover:bg-rose-100 transition-all border border-rose-100 uppercase tracking-tight animate-in fade-in slide-in-from-right-4"
                        >
                            <Trash2 size={16} /> Delete ({selectedIds.length})
                        </button>
                    )}
                    <button
                        onClick={handleOpenCreate}
                        className="zoho-button-primary"
                    >
                        <Plus size={16} /> Create New
                    </button>
                    <button
                        onClick={() => navigate('/production/shop-floor')}
                        className="zoho-button-secondary bg-slate-900 text-white hover:bg-slate-800 border-none"
                    >
                        <MonitorPlay size={16} /> Terminal View
                    </button>
                    <div className="flex bg-white/70 backdrop-blur border border-white/60 rounded-xl p-1 shadow-sm">
                        <button onClick={() => setViewType('List')} className={`p-1.5 rounded-lg transition-colors ${viewType === 'List' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><ListIcon size={16} /></button>
                        <button onClick={() => setViewType('Kanban')} className={`p-1.5 rounded-lg transition-colors ${viewType === 'Kanban' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={16} /></button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden relative">
                {(() => {
                    // Filter work orders based on filterType
                    const filteredWorkOrders = workOrders.filter(wo => {
                        if (filterType === 'all') return true;
                        const isExamination = wo.tags?.includes('Examination') || 
                                             wo.productName?.includes('Exam') ||
                                             wo.productId === 'EXAM-PRINT';
                        return filterType === 'examination' ? isExamination : !isExamination;
                    });

                    if (viewType === 'Kanban') {
                        return (
                            <WorkOrderKanban
                                orders={filteredWorkOrders}
                                onUpdateStatus={(id, s) => updateWorkOrderStatus(id, s)}
                                onView={handleOpenEdit}
                                onPreview={handlePreviewPDF}
                                onConvertInvoice={handleConvertInvoice}
                            />
                        );
                    }

                    return (
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden h-full flex flex-col">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="table-header sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-2 w-10">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={filteredWorkOrders.length > 0 && selectedIds.length === filteredWorkOrders.length}
                                                onChange={handleToggleSelectAll}
                                            />
                                        </th>
                                        <th className="px-4 py-2 uppercase tracking-tight">Order Specification</th>
                                        <th className="px-4 py-2 text-center uppercase tracking-tight">Batch Target</th>
                                        <th className="px-4 py-2 uppercase tracking-tight">Delivery Due</th>
                                        <th className="px-4 py-2 uppercase tracking-tight">Current Phase</th>
                                        <th className="px-4 py-2 text-right uppercase tracking-tight">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50">
                                    {filteredWorkOrders.map(wo => {
                                        const isExamination = wo.tags?.includes('Examination') || 
                                                            wo.productName?.includes('Exam') ||
                                                            wo.productId === 'EXAM-PRINT';
                                        return (
                                        <tr
                                            key={wo.id}
                                            className={`hover:bg-blue-50/30 cursor-pointer transition-colors group ${isExamination ? 'bg-purple-50/30' : ''}`}
                                            onClick={() => handleOpenEdit(wo)}
                                            onMouseEnter={(e) => handleMouseEnter(wo.id, e)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    checked={selectedIds.includes(wo.id)}
                                                    onChange={(e) => handleToggleSelect(wo.id, e as any)}
                                                />
                                            </td>
                                            <td className="table-body-cell px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-bold text-slate-800 text-[13px]">{wo.productName}</div>
                                                    {isExamination && (
                                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold uppercase tracking-widest border border-purple-200">
                                                            📝 Exam
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {wo.attributes && Object.entries(wo.attributes).map(([key, value]) => {
                                                        if (key === 'variantId') return null;
                                                        const label = key === 'batch_number' ? 'Batch' : key;
                                                        return (
                                                            <span key={key} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-tight border border-slate-200">
                                                                {label}: {String(value)}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="font-mono text-slate-400 font-bold text-[10px] uppercase tracking-tight">#{wo.id}</span>
                                                    <span className="text-slate-300 text-[10px]">•</span>
                                                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-tight">{isExamination 
                                                        ? (() => {
                                                            const customer = (customers || []).find(c => c.id === wo.customerId);
                                                            return customer?.name || wo.customerName || 'Unknown School';
                                                        })()
                                                        : (wo.customerName || 'Stock Build')
                                                    }</span>
                                                </div>
                                            </td>
                                            <td className="table-body-cell px-4 py-2 text-center">
                                                <div className="text-[13px] font-bold text-slate-900 finance-nums">{wo.quantityCompleted || 0} / {wo.quantityPlanned || 0}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Units Logged</div>
                                            </td>
                                            <td className="table-body-cell px-4 py-2">
                                                <div className="text-[13px] font-bold text-slate-700 finance-nums text-left">{new Date(wo.dueDate).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Production Deadline</div>
                                            </td>
                                            <td className="table-body-cell px-4 py-2">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-widest w-fit ${wo.priority === 'Critical' ? 'bg-red-50 text-red-600 border-red-100' :
                                                        wo.priority === 'High' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            wo.priority === 'Low' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                                                                'bg-blue-50 text-blue-600 border-blue-100'
                                                        }`}>
                                                        {wo.priority || 'Normal'}
                                                    </span>
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-widest transition-all duration-300 w-fit ${getStatusStyles(wo.status)}`}>
                                                        {wo.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="table-body-cell px-4 py-2 text-right">
                                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                                    {(wo.status === 'Scheduled' || wo.status === 'Planned') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'In Progress'); notify('Production started', 'info'); }}
                                                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white border border-blue-100 shadow-sm transition-all"
                                                            title="Start Production"
                                                        >
                                                            <Play size={13} fill="currentColor" />
                                                        </button>
                                                    )}
                                                    {wo.status === 'In Progress' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'QA'); notify('Moved to Quality Assurance', 'info'); }}
                                                            className="p-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white border border-purple-100 shadow-sm transition-all"
                                                            title="Move to QA"
                                                        >
                                                            <ShieldCheck size={13} />
                                                        </button>
                                                    )}
                                                    {wo.status === 'QA' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'Completed'); notify('Work order completed', 'success'); }}
                                                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white border border-emerald-100 shadow-sm transition-all"
                                                            title="Complete Order"
                                                        >
                                                            <CheckSquare size={13} />
                                                        </button>
                                                    )}
                                                    {wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); if (confirm('Cancel this work order?')) updateWorkOrderStatus(wo.id, 'Cancelled'); }}
                                                            className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600 border border-slate-100 shadow-sm transition-all"
                                                            title="Cancel Job"
                                                        >
                                                            <XCircle size={13} />
                                                        </button>
                                                    )}
                                                    {wo.status === 'Completed' && !wo.id.startsWith('WO-EXAM-') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleConvertInvoice(wo); }}
                                                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white border border-emerald-100 shadow-sm transition-all"
                                                            title="Bill Customer"
                                                        >
                                                            <FileText size={13} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePreviewPDF(wo); }}
                                                        className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white border border-indigo-100 shadow-sm transition-all"
                                                        title="Preview PDF"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownloadPDF(wo); }}
                                                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white border border-blue-100 shadow-sm transition-all"
                                                        title="Download PDF"
                                                    >
                                                        <FileDown size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenEdit(wo);
                                                        }}
                                                        className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-600 hover:text-white border border-slate-100 shadow-sm transition-all"
                                                        title="View Work Order"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleOpenAdvanced(e, wo.id)}
                                                        className="p-1.5 bg-white text-slate-400 hover:text-blue-600 rounded-lg border border-slate-200 shadow-sm transition-all"
                                                        title="More Options"
                                                    >
                                                        <Settings size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filteredWorkOrders.length === 0 && (
                            <div className="flex-1 flex items-center justify-center p-12">
                                <div className="text-center">
                                    <Target className="mx-auto h-12 w-12 text-slate-300" />
                                    <h3 className="mt-4 text-sm font-semibold text-slate-600">No work orders found</h3>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {filterType === 'examination' 
                                            ? 'No examination work orders. Calculate an examination batch to create work orders.'
                                            : filterType === 'regular'
                                            ? 'No regular work orders found.'
                                            : 'Get started by creating a new work order.'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    );
                })()}
            </div>

        </div>
    );
};

export default WorkOrders;
