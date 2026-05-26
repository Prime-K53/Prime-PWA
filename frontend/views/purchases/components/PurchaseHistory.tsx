import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useHighlight } from '../../../hooks/useHighlight';
import { DocLink } from '../../../components/DocLink';
import { Package, CheckCircle, Eye, DollarSign, Trash2, ChevronRight, RefreshCw, Edit2, Layers, CheckSquare, Square, XCircle, FileText, Download, FileDown } from 'lucide-react';
import { Purchase } from '../../../types';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { WhatsAppLogo } from '../../../components/Icons';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import { OfflineImage } from '../../../components/OfflineImage';
import { mapToInvoiceData } from '../../../utils/pdfMapper';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { downloadBlob } from '../../../utils/helpers';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';

interface PurchaseHistoryProps {
    purchases: Purchase[];
    suppliers: any[];
    onReceive: (id: string) => void;
    onView?: (purchase: Purchase) => void;
    onEdit: (purchase: Purchase) => void;
    onMerge: (ids: string[]) => void;
    onBatchDelete: (ids: string[]) => void;
    onPayment?: (purchase: Purchase) => void;
}

const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
                setActiveSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).closest('.relative');
        if (container) {
            const rect = container.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;

            // Simple boundary check (assume menu width 256px, height ~300px)
            if (x + 256 > rect.width) x = rect.width - 256 - 10;
            if (y + 350 > rect.height) y = rect.height - 350 - 10;

            setMenuPos({ x: Math.max(10, x), y: Math.max(10, y) });
        } else {
            setMenuPos({ x: e.clientX, y: e.clientY });
        }
        setOpenMenuId(id);
        setActiveSubmenu(null);
    };

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        if (openMenuId === id) {
            setOpenMenuId(null);
            setActiveSubmenu(null);
        } else {
            const container = (e.currentTarget as HTMLElement).closest('.relative');
            if (container) {
                const rect = container.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;

                if (x + 256 > rect.width) x = rect.width - 256 - 10;
                if (y + 350 > rect.height) y = rect.height - 350 - 10;

                setMenuPos({ x: Math.max(10, x), y: Math.max(10, y) });
            } else {
                setMenuPos({ x: e.clientX, y: e.clientY });
            }
            setOpenMenuId(id);
            setActiveSubmenu(null);
        }
    };

    return { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId };
};

export const PurchaseHistory: React.FC<PurchaseHistoryProps> = ({ purchases, suppliers, onReceive, onView, onEdit, onMerge, onBatchDelete, onPayment }) => {
    const { companyConfig, notify } = useAuth(); const { updatePurchase, inventory } = useInventory();
    const { handlePreview } = useDocumentPreview();
    const currency = companyConfig.currencySymbol;
    const location = useLocation();
    useHighlight();

    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const itemsPerPage = 15;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(purchases, itemsPerPage);

    const enrichPO = (po: Purchase) => {
        const supplier = (suppliers || []).find(s => s.id === po.supplierId) ||
            (suppliers || []).find(s => s.name === po.supplierId);
        return {
            ...po,
            supplierName: supplier?.name || po.supplierId,
            vendorName: supplier?.name || po.supplierId,
            vendorAddress: supplier?.address,
            vendorPhone: supplier?.phone,
            address: supplier?.address,
            phone: supplier?.phone,
            clientName: supplier?.name || po.supplierId
        };
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleMergeClick = () => {
        onMerge(selectedIds);
        setSelectedIds([]);
    };

    const handleDownloadPDF = async (po: Purchase) => {
        try {
            notify("Preparing Purchase Order PDF...", "info");
            const enriched = enrichPO(po);
            const pdfData = mapToInvoiceData(enriched, companyConfig, 'PO');
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="PO" data={securedPdfData as any} />).toBlob();
            const poNumber = po.poNumber || po.id || '';
            const fileName = poNumber ? `Purchase Order - ${poNumber}.pdf` : `Purchase Order.pdf`;
            downloadBlob(blob, fileName);
            notify("Purchase Order PDF downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    const handleAction = async (action: string, po: Purchase, extra?: string) => {
        if (action !== 'toggle_status_menu') {
            setOpenMenuId(null);
        }

        switch (action) {
            case 'view':
                if (onView) onView(po);
                break;
            case 'edit':
                onEdit(po);
                break;
            case 'whatsapp':
                const supplier = (suppliers || []).find(s => s.id === po.supplierId);
                if (supplier?.contact) {
                    const phone = supplier.contact.replace(/\D/g, '');
                    const msg = `Hello, regarding Purchase Order ${po.id}...`;
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                } else {
                    notify("Supplier phone number not available", "error");
                }
                break;
            case 'change_status':
                if (extra) {
                    const updated: Partial<Purchase> = { status: extra as any };
                    if (extra === 'Cancelled') {
                        updated.paymentStatus = 'Cancelled';
                    }
                    updatePurchase({ ...po, ...updated });
                    notify(`Bill status changed to ${extra}`, 'success');
                }
                break;
            case 'delete':
                if (po.paymentStatus === 'Paid' || po.paymentStatus === 'Partial' || (po.paidAmount || 0) > 0) {
                    const pwd = window.prompt("This bill has payments. Enter Admin Password to cancel:");
                    if (pwd !== 'password') {
                        notify("Incorrect Password. Action Cancelled.", "error");
                        return;
                    }
                }

                if (confirm("Cancel this Bill? This will mark both the order and payment status as Cancelled.")) {
                    updatePurchase({ ...po, status: 'Cancelled', paymentStatus: 'Cancelled' });
                    notify("Bill Cancelled", "success");
                }
                break;
            case 'download_pdf':
                handleDownloadPDF(po);
                break;
        }
    };

    const currentPO = (purchases || []).find(p => p.id === openMenuId);

    const renderMenu = (po: Purchase) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 500; // Estimated height for all menu items
        const submenuWidth = 192; // w-48 = 192px
        
        let x = menuPos?.x || 0;
        let y = menuPos?.y || 0;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth + submenuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth - submenuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
        <div
            ref={menuRef}
            className="fixed w-64 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-white/50 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
            style={{ top: y, left: x, maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl">PURCHASE ACTIONS</div>
            <button onClick={() => { setOpenMenuId(null); handlePreview('PO', enrichPO(po)); }} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                <Eye size={14} /> Preview Purchase Order
            </button>
            <div className="my-1 border-t border-slate-100/50"></div>
            <button onClick={() => handleAction('view', po)} className="w-full px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-100/50">
                <FileText size={14} /> View Details
            </button>
            <button onClick={() => handleAction('download_pdf', po)} className="w-full px-4 py-2.5 text-[13px] font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-slate-100/50">
                <FileDown size={14} /> Download PDF
            </button>

            {po.paymentStatus !== 'Paid' && po.status !== 'Draft' && po.status !== 'Cancelled' && onPayment && (
                <button onClick={() => { setOpenMenuId(null); onPayment(po); }} className="w-full px-4 py-2.5 text-[13px] font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-3 transition-colors">
                    <DollarSign size={14} /> Record Payment
                </button>
            )}

            {(po.status === 'Draft' || po.status === 'Ordered') && (
                <button onClick={() => handleAction('edit', po)} className="w-full px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-3 transition-colors">
                    <Edit2 size={14} /> Edit Bill
                </button>
            )}

            <button onClick={() => handleAction('whatsapp', po)} className="w-full px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-3 transition-colors border-b border-slate-100/50">
                <WhatsAppLogo size={14} /> Send via WhatsApp
            </button>

            <div className="relative group">
                <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'status' ? null : 'status')}
                    className="w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between gap-3 transition-colors"
                >
                    <div className="flex items-center gap-3"><RefreshCw size={14} /> Change Status</div>
                    <ChevronRight size={12} />
                </button>
                {(activeSubmenu === 'status') && (
                    <div className="absolute left-full top-0 ml-1 w-48 bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-white/50 py-1 overflow-hidden">
                        {['Draft', 'Ordered', 'Received', 'Closed', 'Cancelled'].map(status => (
                            <button
                                key={status}
                                onClick={() => handleAction('change_status', po, status)}
                                className={`w-full px-4 py-2.5 text-[13px] text-left hover:bg-blue-50 hover:text-blue-700 ${po.status === status ? 'font-bold text-blue-600 bg-blue-50' : 'text-slate-700 font-bold'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="my-1 border-t border-slate-100/50"></div>
            <button onClick={() => handleAction('delete', po)} className="w-full px-4 py-2.5 text-[13px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors">
                <Trash2 size={14} /> Cancel Bill
            </button>
        </div>
    );
};

    return (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 relative flex flex-col">
            {selectedIds.length > 0 && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-blue-600/90 backdrop-blur text-white px-4 py-2 rounded-2xl shadow-lg shadow-blue-200 flex items-center gap-4 animate-in slide-in-from-top-2 border border-blue-500/50">
                    <span className="text-[13px] font-bold">{selectedIds.length} selected</span>

                    {selectedIds.length > 1 && (
                        <button onClick={handleMergeClick} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors tracking-tight uppercase">
                            <Layers size={12} /> Merge Bills
                        </button>
                    )}

                    <button onClick={() => { onBatchDelete(selectedIds); setSelectedIds([]); }} className="bg-red-500/20 hover:bg-red-500/40 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors tracking-tight uppercase">
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            )}

            {openMenuId && menuPos && currentPO && renderMenu(currentPO)}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 shadow-sm">
                        <tr className="bg-slate-50/50">
                            <th className="table-header px-4 py-2 w-12 text-center">
                                <button onClick={() => setSelectedIds(selectedIds.length === currentItems.length ? [] : currentItems.map(p => p.id))} className="text-slate-400 hover:text-slate-600">
                                    {selectedIds.length > 0 && selectedIds.length === currentItems.length ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                </button>
                            </th>
                            <th className="table-header px-4 py-2 w-16">Item</th>
                            <th className="table-header px-4 py-2">Bill #</th>
                            <th className="table-header px-4 py-2">Date</th>
                            <th className="table-header px-4 py-2">Supplier</th>
                            <th className="table-header px-4 py-2">Vendor Ref</th>
                            <th className="table-header px-4 py-2">Due Date</th>
                            <th className="table-header px-4 py-2 text-right">Total</th>
                            <th className="table-header px-4 py-2 text-center">Payment</th>
                            <th className="table-header px-4 py-2 text-center">Status</th>
                            <th className="table-header px-4 py-2 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(currentItems || []).length === 0 && <tr><td colSpan={11} className="table-body-cell p-8 text-center text-slate-400">No bills found.</td></tr>}
                        {currentItems.map(po => {
                            const isSelected = selectedIds.includes(po.id);
                            const firstItem = po.items && po.items[0];
                            const product = firstItem ? (inventory || []).find(i => i.id === firstItem.itemId) : null;
                            const isOverdue = po.dueDate && new Date(po.dueDate) < new Date() && po.paymentStatus !== 'Paid';

                            return (
                                <tr
                                    key={po.id}
                                    id={`bill-${po.id}`}
                                    className={`transition-colors cursor-pointer hover:bg-slate-50/50 ${openMenuId === po.id ? 'bg-blue-50/60' : ''} ${isSelected ? 'bg-blue-50/50' : ''}`}
                                    onContextMenu={(e) => handleContextMenu(e, po.id)}
                                    onClick={(e) => handleRowClick(e, po.id)}
                                >
                                    <td className="table-body-cell px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleToggleSelect(po.id)} className="text-slate-400 hover:text-blue-600">
                                            {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                        </button>
                                    </td>
                                    <td className="table-body-cell px-4 py-2">
                                        <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                                            <OfflineImage
                                                src={product?.image}
                                                alt={firstItem?.name || 'Item'}
                                                className="w-full h-full object-cover"
                                                fallback={<Package size={16} className="text-slate-300 m-auto" />}
                                            />
                                        </div>
                                    </td>
                                    <td className="table-body-cell px-4 py-2 font-mono font-bold text-slate-600">
                                        <DocLink
                                            docNumber={po.id}
                                            targetPage="/procurement/bills"
                                            rowId={`bill-${po.id}`}
                                            currentPage={location.pathname}
                                        />
                                    </td>
                                    <td className="table-body-cell px-4 py-2 text-slate-500 finance-nums">{new Date(po.date).toLocaleDateString()}</td>
                                    <td className="table-body-cell px-4 py-2 font-medium text-slate-900">{(suppliers || []).find(s => s.id === po.supplierId)?.name || po.supplierId}</td>
                                    <td className="table-body-cell px-4 py-2 text-slate-500 text-[10px] font-bold uppercase tracking-tight">{po.reference || '-'}</td>
                                    <td className={`table-body-cell px-4 py-2 finance-nums font-bold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                                        {po.dueDate ? new Date(po.dueDate).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="table-body-cell px-4 py-2 text-right font-bold text-slate-800 finance-nums">{currency}{(po.total || 0).toFixed(2)}</td>
                                    <td className="table-body-cell px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-tight uppercase ${po.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : po.paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : po.paymentStatus === 'Cancelled' ? 'bg-slate-50 text-slate-500 border-slate-200 line-through' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {po.paymentStatus || 'Unpaid'}
                                        </span>
                                    </td>
                                    <td className="table-body-cell px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-tight uppercase ${po.status === 'Received' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : po.status === 'Ordered' ? 'bg-blue-100 text-blue-800 border-blue-200' : po.status === 'Draft' ? 'bg-slate-100 text-slate-600 border-slate-200' : po.status === 'Cancelled' ? 'bg-slate-50 text-slate-500 line-through border-slate-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="table-body-cell px-4 py-2 text-right relative">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePreview('PO', enrichPO(po)); }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Preview PDF"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDownloadPDF(po); }}
                                                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Download PDF"
                                            >
                                                <FileDown size={16} />
                                            </button>
                                            {(po.status === 'Ordered' || po.status === 'Partially Received' || po.status === 'Draft') ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onReceive(po.id); }}
                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm flex items-center gap-1 ${po.status === 'Draft' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                    title={po.status === 'Draft' ? 'Process Draft' : 'Receive Items'}
                                                >
                                                    <Package size={12} /> {po.status === 'Draft' ? 'Process' : 'Receive'}
                                                </button>
                                            ) : po.status === 'Cancelled' ? (
                                                <span className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-bold"><XCircle size={12} /> Cancelled</span>
                                            ) : (
                                                <span className="text-[10px] text-emerald-600 flex items-center justify-end gap-1 font-bold tracking-tight uppercase"><CheckCircle size={12} /> Done</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
        </div>
    );
};
