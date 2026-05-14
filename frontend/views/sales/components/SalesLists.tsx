import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHighlight } from '../../../hooks/useHighlight';
import { DocLink } from '../../../components/DocLink';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useData } from '../../../context/DataContext';
import { Quotation, Invoice, JobOrder, RecurringInvoice, DeliveryNote, CartItem, SalesExchange, Order } from '../../../types';
import { WhatsAppLogo } from '../../../components/Icons';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import { OfflineImage } from '../../../components/OfflineImage';
import { mapToInvoiceData } from '../../../utils/pdfMapper';
import { resolveTransactionPricingSummary } from '../../../utils/pricingBreakdown';
import { Edit2, Trash2, Star, List, LayoutGrid, CheckCircle, Check, Clock, User, Calendar, Box, Eye, Send, Copy, Plus, Phone, ChevronRight, FileText, FileCheck, Briefcase, Mail, MessageCircle, Repeat, XCircle, Archive, History as HistoryIcon, Users, RefreshCw, ArrowUp, ArrowDown, Link as LinkIcon, Paperclip, CalendarClock, AlertTriangle, Download, Truck, MoreVertical, Play, Pause, Package, Globe, DollarSign, TrendingUp, Zap, Target, Share2, ExternalLink, PlayCircle, Coins, Wallet, ShoppingBag, Printer } from 'lucide-react';

export interface ListProps<T> {
    data: T[];
    onView: (item: T) => void;
    onEdit: (item: T) => void;
    onDelete: (id: string) => void;
    onAction?: (item: T, action: string) => void;
    viewMode?: 'List' | 'Card';
    selectedIds?: string[];
    onSelect?: (id: string) => void;
    onSort?: (field: any) => void;
    sortConfig?: { field: any; direction: 'asc' | 'desc' };
    selectedId?: string;
}

const getSubscriptionToggleAction = (status?: string) => {
    switch (status) {
        case 'Active':
            return { label: 'Pause Subscription', icon: 'pause' as const };
        case 'Draft':
            return { label: 'Activate Subscription', icon: 'play' as const };
        case 'Paused':
            return { label: 'Resume Subscription', icon: 'play' as const };
        default:
            return null;
    }
};

/**
 * Shared Hover Menu Component for Sales Documents
 */
export const HoverActionMenu: React.FC<{
    id: string,
    type: 'Invoice' | 'Quotation' | 'Subscription' | 'Delivery Note' | 'SalesExchange',
    pos: { x: number, y: number },
    data: any,
    onAction?: (item: any, action: string) => void
}> = ({ id, type, pos, data, onAction }) => {
    const { companyConfig } = useData();
    const currency = companyConfig.currencySymbol;
    const pricingSummary = useMemo(() => resolveTransactionPricingSummary(data), [data]);
    const hasPricingMetrics = Math.abs(pricingSummary.adjustmentTotal) > 0.0001
        || Math.abs(pricingSummary.profitMarginTotal) > 0.0001
        || Math.abs(pricingSummary.roundingTotal) > 0.0001;

    if (!data) return null;

    return (
        <div
            className="fixed z-[200] pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
            style={{ top: pos.y + 15, left: pos.x + 15 }}
        >
            <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-premium p-4 min-w-[280px] flex flex-col gap-3 text-white">
                <div className="flex items-center gap-3 border-b border-slate-700 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        {type === 'Invoice' ? <FileCheck size={16} /> :
                            type === 'Quotation' ? <FileText size={16} /> :
                                type === 'Subscription' ? <RefreshCw size={16} /> :
                                    type === 'SalesExchange' ? <RefreshCw size={16} /> :
                                        <Truck size={16} />}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-blue-400 tracking-tight">{type === 'SalesExchange' ? 'Exchange' : type} details</p>
                        <p className="text-xs font-bold font-mono">{data.exchange_number || id}</p>
                    </div>
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    <p className="text-[10px] font-bold text-slate-400 tracking-tight mb-2">
                        {type === 'SalesExchange' ? 'Exchange Items' : 'Items summary'}
                    </p>
                    {data.items && data.items.length > 0 ? (
                        data.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-start gap-4 text-xs py-1 border-b border-white/5 last:border-0">
                                <span className="text-slate-200 font-medium line-clamp-1">
                                    {type === 'SalesExchange' && item.qty_replaced > 0 && item.replaced_product_name && item.replaced_product_name !== item.product_name
                                        ? `${item.product_name} → ${item.replaced_product_name}`
                                        : (item.product_name || item.productName || item.name || item.desc || 'Item')
                                    }
                                </span>
                                <span className="text-blue-400 font-bold whitespace-nowrap">
                                    {type === 'SalesExchange' ? `Ret: ${item.qty_returned || 0}` : `x${item.quantity || item.qty || 0}`}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="text-[10px] text-slate-500 italic">No items listed</p>
                    )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 tracking-tight">
                        {type === 'SalesExchange' ? 'Price Difference' : 'Total value'}
                    </span>
                    <span className="text-[13px] font-bold text-emerald-400 finance-nums">
                        {currency}{(data.total || data.totalAmount || data.total_price_difference || 0).toLocaleString()}
                    </span>
                </div>

                {hasPricingMetrics && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Adj</div>
                            <div className="text-[11px] font-bold text-indigo-300 finance-nums">{currency}{pricingSummary.adjustmentTotal.toLocaleString()}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Margin</div>
                            <div className="text-[11px] font-bold text-emerald-300 finance-nums">{currency}{pricingSummary.profitMarginTotal.toLocaleString()}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Round</div>
                            <div className={`text-[11px] font-bold finance-nums ${pricingSummary.roundingTotal >= 0 ? 'text-blue-300' : 'text-rose-300'}`}>
                                {pricingSummary.roundingTotal >= 0 ? '+' : ''}{currency}{pricingSummary.roundingTotal.toLocaleString()}
                            </div>
                        </div>
                    </div>
                )}

                {type === 'SalesExchange' && onAction && (data.status === 'pending' || data.status === 'Pending') && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700">
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction(data, 'approve_exchange'); }}
                            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                        >
                            <CheckCircle size={12} /> Approve
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction(data, 'cancel_exchange'); }}
                            className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                        >
                            <XCircle size={12} /> Cancel
                        </button>
                    </div>
                )}

                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-[9px] text-slate-300 font-bold tracking-tight font-mono italic">Secure snapshot</span>
                </div>
            </div>
        </div>
    );
};


export const SalesOrderList: React.FC<ListProps<JobOrder>> = (props) => {
    const { companyConfig } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? CARD_ITEMS_PER_PAGE : LIST_ITEMS_PER_PAGE;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const currentOrder = (props.data || []).find((d: any) => d.id === openMenuId);
    const hoveredOrder = (props.data || []).find((d: any) => d.id === hoveredId);

    const renderMenu = (order: JobOrder) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 400; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
            <div
                ref={menuRef}
                className="fixed w-64 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl">SALES ORDER ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); props.onView(order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><ChevronRight size={14} /> View Detail</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('SALES_ORDER', order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Eye size={14} /> Preview PDF Order</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('PO', order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors">
                    <ShoppingBag size={14} /> Preview Purchase Order
                </button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('WORK_ORDER', order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 flex items-center gap-3 transition-colors">
                    <Briefcase size={14} /> Preview Work Order
                </button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('DELIVERY_NOTE', order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-3 transition-colors">
                    <Truck size={14} /> Preview Delivery Note
                </button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(order, 'download_pdf'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Download size={14} /> Download PDF Order</button>
                <button onClick={() => { setOpenMenuId(null); props.onEdit(order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Order</button>

                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(order, 'convert_inv'); }} className="w-full text-left px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"><FileCheck size={14} /> Convert to Invoice</button>
                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onDelete(order.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentOrder && renderMenu(currentOrder)}
            {hoveredId && hoverPos && hoveredOrder && <HoverActionMenu id={hoveredId} type="Delivery Note" pos={hoverPos} data={hoveredOrder} />}

            {props.viewMode === 'Card' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                        {(currentItems || []).map((item: any) => (
                            <div key={item.id} onMouseEnter={(e) => onMouseEnter(item.id, e)} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
                                <GenericCard item={item} type="JobOrder" onView={props.onView} onEdit={props.onEdit} onDelete={props.onDelete} onAction={props.onAction} currencySymbol={companyConfig.currencySymbol} onContextMenu={handleContextMenu} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-3">
                        <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                    </div>
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="table-header">Order No.</th>
                                    <th className="table-header">Date</th>
                                    <th className="table-header">Customer</th>
                                    <th className="table-header">Title</th>
                                    <th className="table-header text-center">Status</th>
                                    <th className="table-header text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/50">
                                {(currentItems || []).map((o: any) => (
                                    <tr
                                        key={o.id}
                                        id={`so-${o.id}`}
                                        className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                        onClick={(e) => handleRowClick(e, o.id)}
                                        onContextMenu={(e) => handleContextMenu(e, o.id)}
                                        onMouseEnter={(e) => onMouseEnter(o.id, e)}
                                        onMouseMove={onMouseMove}
                                        onMouseLeave={onMouseLeave}
                                    >
                                        <td className="table-body-cell font-mono font-bold">
                                            <DocLink
                                                docNumber={o.id}
                                                targetPage="/sales-flow/sales-orders"
                                                rowId={`so-${o.id}`}
                                                currentPage={location.pathname}
                                            />
                                        </td>
                                        <td className="table-body-cell font-normal">{new Date(o.date).toLocaleDateString()}</td>
                                        <td className="table-body-cell font-medium text-slate-900">{o.customerName}</td>
                                        <td className="table-body-cell font-normal truncate max-w-[200px]">{o.jobTitle}</td>
                                        <td className="table-body-cell text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${o.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                o.status === 'In Progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                    o.status === 'Draft' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                                        'bg-amber-100 text-amber-700 border-amber-200'
                                                }`}>{o.status}</span>
                                        </td>
                                        <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-end gap-1 items-center">
                                                <button onClick={(e) => { e.stopPropagation(); handlePreview('WORK_ORDER', o); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Preview PDF">
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); props.onAction && props.onAction(o, 'download_pdf'); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Download PDF">
                                                    <Download size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); props.onEdit(o); }} className="p-1.5 text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Edit"><Edit2 size={14} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, o.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
<button onClick={(e) => { e.stopPropagation(); handleRowClick(e, o.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                </div>
            )}
        </div>
    );
};

export const OrdersList: React.FC<ListProps<Order>> = (props) => {
    const { companyConfig } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? 12 : 10;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const currentOrder = (props.data || []).find((d: any) => d.id === openMenuId);

    const renderMenu = (order: Order) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 400; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
            <div
                ref={menuRef}
                className="fixed w-64 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl">ORDER ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); props.onView(order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><ChevronRight size={14} /> View Detail</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('ORDER', order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Eye size={14} /> Preview Order Confirmation</button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(order, 'record_payment'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"><DollarSign size={14} /> Record Payment</button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(order, 'convert_to_invoice'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"><FileCheck size={14} /> Convert to Invoice</button>
                <button onClick={() => { setOpenMenuId(null); props.onEdit(order); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Order</button>

                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(order, 'cancel_order'); }} className="w-full text-left px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-3 transition-colors"><XCircle size={14} /> Cancel Order</button>
                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onDelete(order.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentOrder && renderMenu(currentOrder)}

            {props.viewMode === 'Card' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                        {(currentItems || []).map((item: Order) => (
                            <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{item.orderNumber}</p>
                                        <h4 className="font-bold text-slate-900 truncate max-w-[150px]">{item.customerName}</h4>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                        item.status === 'Pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                            item.status === 'Cancelled' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                'bg-blue-100 text-blue-700 border-blue-200'
                                        }`}>{item.status}</span>
                                </div>
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">Date:</span>
                                        <span className="font-medium">{new Date(item.orderDate).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">Total:</span>
                                        <span className="font-bold text-slate-900">{companyConfig.currencySymbol}{item.totalAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">Paid:</span>
                                        <span className="font-bold text-emerald-600">{companyConfig.currencySymbol}{item.paidAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => props.onView(item)} className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold transition-colors">Details</button>
                                    <button onClick={() => props.onEdit(item)} className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold transition-colors">Edit</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="table-header">Order No.</th>
                                    <th className="table-header">Date</th>
                                    <th className="table-header">Customer</th>
                                    <th className="table-header text-right">Total</th>
                                    <th className="table-header text-right">Paid</th>
                                    <th className="table-header text-center">Status</th>
                                    <th className="table-header text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/50">
                                {(currentItems || []).map((o: Order) => (
                                    <tr
                                        key={o.id}
                                        id={`ord-${o.id}`}
                                        className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                        onClick={(e) => handleRowClick(e, o.id)}
                                        onContextMenu={(e) => handleContextMenu(e, o.id)}
                                    >
                                        <td className="table-body-cell font-mono font-bold">
                                            <DocLink
                                                docNumber={o.orderNumber}
                                                targetPage="/sales-flow/orders"
                                                rowId={`ord-${o.id}`}
                                                currentPage={location.pathname}
                                            />
                                        </td>
                                        <td className="table-body-cell font-normal">{new Date(o.orderDate).toLocaleDateString()}</td>
                                        <td className="table-body-cell font-medium text-slate-900">{o.customerName}</td>
                                        <td className="table-body-cell text-right font-bold">{companyConfig.currencySymbol}{o.totalAmount.toLocaleString()}</td>
                                        <td className="table-body-cell text-right font-bold text-emerald-600">{companyConfig.currencySymbol}{o.paidAmount.toLocaleString()}</td>
                                        <td className="table-body-cell text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${o.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                o.status === 'Pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                    o.status === 'Cancelled' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                        'bg-blue-100 text-blue-700 border-blue-200'
                                                }`}>{o.status}</span>
                                        </td>
                                        <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-end gap-1 items-center">
                                                <button onClick={(e) => { e.stopPropagation(); handlePreview('ORDER', o); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Preview PDF">
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); props.onEdit(o); }} className="p-1.5 text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Edit"><Edit2 size={14} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, o.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                </div>
            )}
        </div>
    );
};

export const useHoverTimer = (delay: number = 2000) => {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
    const timerRef = useRef<any | null>(null);
    const activeIdRef = useRef<string | null>(null);

    const onMouseEnter = (id: string, e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        activeIdRef.current = id;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (activeIdRef.current === id) {
                setHoveredId(id);
                setHoverPos({ x: clientX, y: clientY });
            }
        }, delay);
    };

    const onMouseMove = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;

        // Disappear as soon as mouse moves if already showing
        if (hoveredId) {
            setHoveredId(null);
            activeIdRef.current = null;
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        // Reset timer if it was running (mouse stopped requirement)
        if (activeIdRef.current) {
            const currentId = activeIdRef.current;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                if (activeIdRef.current === currentId) {
                    setHoveredId(currentId);
                    setHoverPos({ x: clientX, y: clientY });
                }
            }, delay);
        }
    };

    const onMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setHoveredId(null);
        activeIdRef.current = null;
    };

    return { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave };
};

const GenericCard: React.FC<{ item: any, type: string, onView: any, onEdit: any, onDelete: any, onAction?: any, currencySymbol: string, renderStatus?: any, onContextMenu: any }> = ({ item, type, onView, onEdit, onDelete, onAction, currencySymbol, renderStatus, onContextMenu }) => {
    const title = item.jobTitle || item.customerName || item.id;
    const description = item.jobDescription || (item.items ? item.items.map((i: any) => i.name).join(', ') : '');
    const targetDate = new Date(item.dueDate || item.validUntil || item.date);
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let financials = null;
    if (type === 'JobOrder') {
        const cost = item.totalJobCost || item.costEstimate || 0;
        financials = (
            <div className="flex justify-between items-center text-[13px] mt-1">
                <span className="text-slate-500 font-normal">Value:</span>
                <span className="font-bold text-slate-800 finance-nums">{currencySymbol} {(cost || 0).toLocaleString()}</span>
            </div>
        );
    }

    let timerColor = 'text-slate-500';
    let timerText = `${diffDays} Days Left`;

    if (diffDays < 0) {
        timerColor = 'text-rose-600 font-bold';
        timerText = `${Math.abs(diffDays)} Days Overdue`;
    } else if (diffDays === 0) {
        timerColor = 'text-amber-600 font-bold';
        timerText = 'Due Today';
    }

    return (
        <div
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer p-4 flex flex-col h-44 relative overflow-hidden group"
            onClick={() => onView(item)}
            onContextMenu={(e) => onContextMenu(e, item.id)}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${type === 'Invoice' ? 'bg-blue-100 text-blue-600' : type === 'JobOrder' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                        {type === 'Invoice' ? <DollarSign size={14} /> : type === 'JobOrder' ? <Briefcase size={14} /> : <FileText size={14} />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 tracking-tight">{item.id}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onContextMenu(e, item.id); }} className="text-slate-300 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                    <MoreVertical size={14} />
                </button>
            </div>

            <h3 className="font-bold text-slate-800 text-[13px] truncate mb-1" title={title}>{title}</h3>
            <p className="text-[13px] text-slate-500 line-clamp-2 mb-auto leading-relaxed font-normal">{description || 'No description'}</p>

            {financials}

            <div className="pt-3 border-t border-slate-100 flex justify-between items-center mt-2">
                <div className={`text-[13px] flex items-center gap-1 ${timerColor}`}>
                    <Clock size={12} /> {timerText}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border bg-slate-50 text-slate-600 border-slate-200 tracking-tight`}>
                    {item.status}
                </span>
            </div>
        </div>
    );
};

const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null); setMenuPos(null); setActiveSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(id);
        const x = Math.min(e.clientX, window.innerWidth - 260);
        const y = Math.min(e.clientY, window.innerHeight - 300);
        setMenuPos({ x, y });
        setActiveSubmenu(null);
    };

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (openMenuId === id) {
            setOpenMenuId(null);
        } else {
            const x = Math.min(e.clientX, window.innerWidth - 260);
            const y = Math.min(e.clientY, window.innerHeight - 300);
            setMenuPos({ x, y });
            setOpenMenuId(id);
            setActiveSubmenu(null);
        }
    }

    return { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId };
};

const LIST_ITEMS_PER_PAGE = 15;
const CARD_ITEMS_PER_PAGE = 12;

export const SalesExchangeList: React.FC<ListProps<SalesExchange>> = (props) => {
    const { companyConfig } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? CARD_ITEMS_PER_PAGE : LIST_ITEMS_PER_PAGE;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const currentExchange = (props.data || []).find((d: any) => d.id === openMenuId);
    const hoveredExchange = (props.data || []).find((d: any) => d.id === hoveredId);

    const renderMenu = (exchange: SalesExchange) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 400; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
            <div
                ref={menuRef}
                className="fixed w-64 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl">EXCHANGE ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); props.onView(exchange); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><Eye size={14} /> View Details</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('SALES_EXCHANGE', exchange); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><FileText size={14} /> Preview Exchange Note</button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(exchange, 'print_note'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Printer size={14} /> Print Exchange Note</button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(exchange, 'email_note'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"><Mail size={14} /> Email Exchange Note</button>

                <div className="my-1 border-t border-slate-200"></div>
                {(exchange.status === 'pending' || exchange.status === 'Pending') && (
                    <>
                        <button
                            onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(exchange, 'approve_exchange'); }}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"
                        >
                            <CheckCircle size={14} /> Approve Exchange
                        </button>
                        <button
                            onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(exchange, 'cancel_exchange'); }}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-3 transition-colors"
                        >
                            <XCircle size={14} /> Cancel Exchange
                        </button>
                    </>
                )}

                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onDelete(exchange.id.toString()); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Mark as Deleted</button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentExchange && renderMenu(currentExchange)}
            {hoveredId && hoverPos && hoveredExchange && <HoverActionMenu id={hoveredId.toString()} type="SalesExchange" pos={hoverPos} data={hoveredExchange} onAction={props.onAction} />}

            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="table-header w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={props.data.length > 0 && props.selectedIds?.length === props.data.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                props.data.forEach(ex => {
                                                    if (!props.selectedIds?.includes(ex.id)) props.onSelect?.(ex.id);
                                                });
                                            } else {
                                                props.data.forEach(ex => {
                                                    if (props.selectedIds?.includes(ex.id)) props.onSelect?.(ex.id);
                                                });
                                            }
                                        }}
                                    />
                                </th>
                                <th className="table-header">Exchange No.</th>
                                <th className="table-header">Date</th>
                                <th className="table-header">Customer</th>
                                <th className="table-header">Reason</th>
                                <th className="table-header text-center">Status</th>
                                <th className="table-header text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50">
                            {(currentItems || []).map((ex: any) => (
                                <tr
                                    key={ex.id}
                                    id={`ex-${ex.id}`}
                                    className={`hover:bg-blue-50/50 cursor-pointer transition-colors group ${props.selectedIds?.includes(ex.id) ? 'bg-blue-50/80' : ''}`}
                                    onClick={(e) => handleRowClick(e, ex.id)}
                                    onContextMenu={(e) => handleContextMenu(e, ex.id)}
                                    onMouseEnter={(e) => onMouseEnter(ex.id, e)}
                                    onMouseMove={onMouseMove}
                                    onMouseLeave={onMouseLeave}
                                >
                                    <td className="table-body-cell" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={props.selectedIds?.includes(ex.id)}
                                            onChange={() => props.onSelect?.(ex.id)}
                                        />
                                    </td>
                                    <td className="table-body-cell font-mono font-bold">
                                        <DocLink
                                            docNumber={ex.exchange_number || ex.id}
                                            targetPage="/sales-flow/exchanges"
                                            rowId={`ex-${ex.id}`}
                                            currentPage={location.pathname}
                                        />
                                    </td>
                                    <td className="table-body-cell font-normal">{new Date(ex.exchange_date).toLocaleDateString()}</td>
                                    <td className="table-body-cell font-medium text-slate-900">{ex.customer_name}</td>
                                    <td className="table-body-cell font-normal">{ex.reason}</td>
                                    <td className="table-body-cell text-center">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${ex.status === 'Completed' || ex.status === 'Approved' || ex.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                            ex.status === 'Pending' || ex.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                ex.status === 'Rejected' || ex.status === 'rejected' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                    ex.status === 'Cancelled' || ex.status === 'cancelled' ? 'bg-slate-100 text-slate-400 border-slate-200' :
                                                        'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>{ex.status.toUpperCase()}</span>
                                    </td>
                                    <td className="table-body-cell text-right">
                                        <div className="flex justify-end gap-1 items-center">
                                            <button onClick={(e) => { e.stopPropagation(); props.onView(ex); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="View"><Eye size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, ex.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
            </div>
        </div>
    );
};

export const SalesSkeletonLoader: React.FC<{ type: 'table' | 'grid' }> = ({ type }) => {
    if (type === 'table') {
        return (
            <div className="flex-1 flex flex-col bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden animate-pulse">
                <div className="h-10 bg-slate-100/80 border-b border-slate-200/60"></div>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="h-12 border-b border-slate-100/50 flex items-center px-4 gap-4">
                        <div className="h-4 w-24 bg-slate-200 rounded"></div>
                        <div className="h-4 w-24 bg-slate-200 rounded"></div>
                        <div className="h-4 flex-1 bg-slate-200 rounded"></div>
                        <div className="h-4 w-[15%] bg-slate-200 rounded"></div>
                        <div className="h-4 w-[15%] bg-slate-200 rounded"></div>
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1 animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-44 flex flex-col">
                    <div className="flex justify-between mb-4">
                        <div className="h-6 w-20 bg-slate-100 rounded"></div>
                        <div className="h-4 w-4 bg-slate-100 rounded"></div>
                    </div>
                    <div className="h-4 w-full bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 w-3/4 bg-slate-100 rounded mb-auto"></div>
                    <div className="h-8 bg-slate-50 rounded mt-4"></div>
                </div>
            ))}
        </div>
    );
};

export const InvoiceList: React.FC<ListProps<Invoice>> = (props) => {
    const { companyConfig, notify } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? CARD_ITEMS_PER_PAGE : LIST_ITEMS_PER_PAGE;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const handleOpenPortal = (id: string) => {
        const url = window.location.origin + window.location.pathname + '#/portal/invoice/' + id;
        window.open(url, '_blank');
        setOpenMenuId(null);
    };

    const handleCopyPortalLink = (id: string) => {
        const url = window.location.origin + window.location.pathname + '#/portal/invoice/' + id;
        navigator.clipboard.writeText(url);
        notify("Portal link copied to clipboard", "success");
        setOpenMenuId(null);
    };

    const currentInvoice = (props.data || []).find((d: any) => d.id === openMenuId);
    const hoveredInvoice = (props.data || []).find((d: any) => d.id === hoveredId);
    const navigate = useNavigate();

    const renderMenu = (inv: Invoice) => {
        const isPaid = inv.status === 'Paid';
        const isPartial = inv.status === 'Partial' || (inv.paidAmount || 0) > 0;
        const isOverdue = !isPaid && new Date(inv.dueDate) < new Date();

        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 500; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        return (
            <div
                ref={menuRef}
                className="fixed w-64 bg-slate-50/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 tracking-tight bg-slate-100/50 rounded-t-xl shrink-0">Invoice actions</div>

                <div className="overflow-y-auto custom-scrollbar flex-1">
                    <button onClick={() => { setOpenMenuId(null); props.onView(inv); }} className="w-full px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                        <FileText size={14} /> View full detail
                    </button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('INVOICE', inv); }} className="w-full px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                        <Eye size={14} /> Preview PDF Invoice
                    </button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('WORK_ORDER', inv); }} className="w-full px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 flex items-center gap-3 transition-colors">
                        <Briefcase size={14} /> Preview Work Order
                    </button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('DELIVERY_NOTE', inv); }} className="w-full px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-3 transition-colors">
                        <Truck size={14} /> Preview Delivery Note
                    </button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('PO', inv); }} className="w-full px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors">
                        <ShoppingBag size={14} /> Preview Purchase Order
                    </button>
                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'download_pdf'); }} className="w-full px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                        <Download size={14} /> Download PDF Invoice
                    </button>
                    <div className="my-1 border-t border-slate-200"></div>
                    <div className="my-1 border-t border-slate-200"></div>
                    <button onClick={() => { setOpenMenuId(null); navigate(`/fiscal-reports/ledgers?query=${inv.id}`); }} className="w-full px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-3 transition-colors"><HistoryIcon size={14} className="text-slate-400" /> Audit Ledger Entries</button>
                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'analyze_profit'); }} className="w-full px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"><TrendingUp size={14} /> Analyze Profit</button>

                    {isOverdue && (
                        <button
                            onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'ai_followup'); }}
                            className="w-full px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"
                        >
                            <Zap size={14} className="fill-indigo-500" /> AI Follow-up Strategy
                        </button>
                    )}

                    <div className="relative group bg-blue-50/50">
                        <button
                            onClick={() => setActiveSubmenu(activeSubmenu === 'portal' ? null : 'portal')}
                            className="w-full px-4 py-2 text-xs font-bold text-blue-700 hover:bg-white flex items-center justify-between gap-3 transition-colors"
                        >
                            <div className="flex items-center gap-3"><Globe size={14} /> Client Portal</div>
                            <ChevronRight size={12} />
                        </button>
                        {activeSubmenu === 'portal' && (
                            <div className="absolute left-full top-0 ml-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 overflow-hidden z-50 animate-in slide-in-from-left-2">
                                <button onClick={() => handleOpenPortal(inv.id)} className="w-full px-4 py-2 text-xs text-left hover:bg-blue-50 flex items-center gap-2"><ExternalLink size={12} /> Open Portal</button>
                                <button onClick={() => handleCopyPortalLink(inv.id)} className="w-full px-4 py-2 text-xs text-left hover:bg-blue-50 flex items-center gap-2"><Share2 size={12} /> Copy Secret Link</button>
                            </div>
                        )}
                    </div>

                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'generate_dn'); }} className="w-full px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-3 transition-colors"><Truck size={14} /> Generate Delivery Note</button>

                    {!isPaid && !isPartial && (
                        <>
                            <button onClick={() => { setOpenMenuId(null); props.onEdit(inv); }} className="w-full px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Invoice</button>
                            <div className="relative group">
                                <button
                                    onClick={() => setActiveSubmenu(activeSubmenu === 'status' ? null : 'status')}
                                    className="w-full px-4 py-2 text-xs font-medium text-slate-700 hover:bg-white hover:text-blue-700 flex items-center justify-between gap-3 transition-colors"
                                >
                                    <div className="flex items-center gap-3"><RefreshCw size={14} /> Change Status</div>
                                    <ChevronRight size={12} />
                                </button>
                                {activeSubmenu === 'status' && (
                                    <div className="absolute left-full top-0 ml-1 w-48 bg-slate-50/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200 py-1 overflow-hidden z-50">
                                        {['Draft', 'Unpaid', 'Overdue', 'Cancelled'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => { props.onAction && props.onAction(inv, `status_${status}`); setOpenMenuId(null); }}
                                                className={`w-full px-4 py-2 text-xs text-left hover:bg-white hover:text-blue-700 ${inv.status === status ? 'font-bold text-blue-600 bg-blue-50' : 'text-slate-700'}`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {!isPaid && (
                        <button
                            onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'create_payment'); }}
                            className="w-full px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                        >
                            <DollarSign size={14} /> Receive Payment
                        </button>
                    )}

                    <button
                        onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'convert_to_recurring'); }}
                        className="w-full px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"
                    >
                        <RefreshCw size={14} /> Convert to Recurring Invoice
                    </button>

                    <button
                        onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'create_exchange'); }}
                        className="w-full px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-3 transition-colors"
                    >
                        <Repeat size={14} /> Create Sales Exchange
                    </button>

                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(inv, 'duplicate'); }} className="w-full px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 flex items-center gap-3 transition-colors"><Copy size={14} /> Duplicate</button>

                    <div className="my-1 border-t border-slate-200"></div>

                    {!isPaid && !isPartial && (
                        <button onClick={() => { setOpenMenuId(null); props.onDelete(inv.id); }} className="w-full px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete Invoice</button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentInvoice && renderMenu(currentInvoice)}
            {hoveredId && hoverPos && hoveredInvoice && <HoverActionMenu id={hoveredId} type="Invoice" pos={hoverPos} data={hoveredInvoice} />}

            {props.viewMode === 'Card' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                        {(currentItems || []).map((item: any) => (
                            <div key={item.id} onMouseEnter={(e) => onMouseEnter(item.id, e)} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
                                <GenericCard item={item} type="Invoice" onView={props.onView} onEdit={props.onEdit} onDelete={props.onDelete} onAction={props.onAction} currencySymbol={companyConfig.currencySymbol} onContextMenu={handleContextMenu} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-3">
                        <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                    </div>
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="table-header w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={props.data.length > 0 && props.selectedIds?.length === props.data.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    props.data.forEach(inv => {
                                                        if (!props.selectedIds?.includes(inv.id)) props.onSelect?.(inv.id);
                                                    });
                                                } else {
                                                    props.data.forEach(inv => {
                                                        if (props.selectedIds?.includes(inv.id)) props.onSelect?.(inv.id);
                                                    });
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="table-header">Invoice No.</th>
                                    <th className="table-header">Date</th>
                                    <th className="table-header">Customer</th>
                                    <th className="table-header text-right">Total</th>
                                    <th className="table-header text-right">Balance</th>
                                    <th className="table-header text-center">Status</th>
                                    <th className="table-header text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/50">
                                {(currentItems || []).map((inv: any) => {
                                    const isPaid = inv.status === 'Paid';
                                    const isCancelled = inv.status === 'Cancelled';
                                    const isPartial = inv.status === 'Partial' || (inv.paidAmount || 0) > 0;
                                    const isChecked = props.selectedIds?.includes(inv.id);
                                    const isSelected = props.selectedId === inv.id;
                                    const balanceDue = isCancelled ? 0 : ((inv.totalAmount || 0) - (inv.paidAmount || 0));
                                    const totalAmount = isCancelled ? 0 : (inv.totalAmount || 0);

                                    return (
                                        <tr
                                            key={inv.id}
                                            id={`inv-${inv.id}`}
                                            className={`transition-colors cursor-pointer group ${isChecked ? 'bg-blue-50/80' : isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-blue-50/50 border-l-4 border-l-transparent'}`}
                                            onClick={() => props.onView(inv)}
                                            onContextMenu={(e) => handleContextMenu(e, inv.id)}
                                            onMouseEnter={(e) => onMouseEnter(inv.id, e)}
                                            onMouseMove={onMouseMove}
                                            onMouseLeave={onMouseLeave}
                                        >
                                            <td className="table-body-cell" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={isChecked}
                                                    onChange={() => props.onSelect?.(inv.id)}
                                                />
                                            </td>
                                            <td className="table-body-cell font-mono text-slate-500 font-bold">
                                                <DocLink
                                                    docNumber={inv.id}
                                                    targetPage="/sales-flow/invoices"
                                                    rowId={`inv-${inv.id}`}
                                                    currentPage={location.pathname}
                                                />
                                            </td>
                                            <td className="table-body-cell font-normal">{new Date(inv.date).toLocaleDateString()}</td>
                                            <td className="table-body-cell font-medium text-slate-900">{inv.customerName}</td>
                                            <td className="table-body-cell text-right font-medium finance-nums">{companyConfig.currencySymbol} {totalAmount.toLocaleString()}</td>
                                            <td className="table-body-cell text-right text-red-600 font-medium finance-nums">{companyConfig.currencySymbol} {balanceDue.toLocaleString()}</td>
                                            <td className="table-body-cell text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                    inv.status === 'Partial' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                        inv.status === 'Overdue' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                            inv.status === 'Cancelled' ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' :
                                                                'bg-slate-100 text-slate-600 border-slate-200'
                                                    }`}>{inv.status}</span>
                                            </td>
                                            <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex justify-end gap-1 items-center">
                                                    <button onClick={(e) => { e.stopPropagation(); props.onView(inv); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="View full detail">
                                                        <ChevronRight size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handlePreview('INVOICE', inv); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Preview PDF">
                                                        <Eye size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); props.onAction && props.onAction(inv, 'download_pdf'); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Download PDF">
                                                        <Download size={14} />
                                                    </button>
                                                    {!isPaid && !isPartial && (
                                                        <button onClick={(e) => { e.stopPropagation(); props.onEdit(inv); }} className="p-1.5 text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Edit">
                                                            <Edit2 size={14} />
                                                        </button>
                                                    )}
                                                    {!isPaid && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); props.onAction && props.onAction(inv, 'create_payment'); }}
                                                            className="p-1.5 text-blue-600 hover:text-blue-700 transition-all flex items-center justify-center group/btn"
                                                            title="Receive Payment"
                                                        >
                                                            <DollarSign size={16} className="group-hover/btn:scale-110 transition-transform" />
                                                        </button>
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, inv.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                </div>
            )}
        </div>
    );
};

export const QuotationList: React.FC<ListProps<Quotation>> = (props) => {
    const { companyConfig } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? CARD_ITEMS_PER_PAGE : LIST_ITEMS_PER_PAGE;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const currentQuote = (props.data || []).find((d: any) => d.id === openMenuId);
    const hoveredQuote = (props.data || []).find((d: any) => d.id === hoveredId);

    const renderMenu = (quote: Quotation) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 500; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
            <div
                ref={menuRef}
                className="fixed w-64 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl">QUOTATION ACTIONS</div>
                <button onClick={() => { setOpenMenuId(null); props.onView(quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><ChevronRight size={14} /> View Detail</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('QUOTATION', quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                    <Eye size={14} /> Preview PDF Quotation
                </button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('PO', quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors">
                    <ShoppingBag size={14} /> Preview Purchase Order
                </button>
                <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(quote, 'download_pdf'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Download size={14} /> Download PDF Quotation</button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('WORK_ORDER', quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 flex items-center gap-3 transition-colors">
                    <Briefcase size={14} /> Preview Work Order
                </button>
                <button onClick={() => { setOpenMenuId(null); handlePreview('DELIVERY_NOTE', quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-3 transition-colors">
                    <Truck size={14} /> Preview Delivery Note
                </button>
                <button onClick={() => { setOpenMenuId(null); props.onEdit(quote); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Quotation</button>

                <div className="my-1 border-t border-slate-200"></div>
                <div className="my-1 border-t border-slate-200"></div>
                {quote.status === 'Pending Approval' && (
                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(quote, 'approve'); }} className="w-full text-left px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"><CheckCircle size={14} /> Approve Quotation</button>
                )}

                <button
                    disabled={quote.status === 'Pending Approval'}
                    onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(quote, 'convert_to_order'); }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold flex items-center gap-3 transition-colors ${quote.status === 'Pending Approval' ? 'text-slate-400 cursor-not-allowed opacity-50' : 'text-blue-600 hover:bg-blue-50'}`}
                >
                    <Package size={14} /> Convert to Order
                </button>

                <button
                    disabled={quote.status === 'Pending Approval'}
                    onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(quote, 'convert_inv'); }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold flex items-center gap-3 transition-colors ${quote.status === 'Pending Approval' ? 'text-slate-400 cursor-not-allowed opacity-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                >
                    <CheckCircle size={14} /> Convert to Invoice
                </button>
                <button
                    disabled={quote.status === 'Pending Approval'}
                    onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(quote, 'convert_wo'); }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold flex items-center gap-3 transition-colors ${quote.status === 'Pending Approval' ? 'text-slate-400 cursor-not-allowed opacity-50' : 'text-blue-700 hover:bg-blue-50'}`}
                >
                    <Briefcase size={14} /> Convert to Work Order
                </button>

                <div className="my-1 border-t border-slate-200"></div>
                <button onClick={() => { setOpenMenuId(null); props.onDelete(quote.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentQuote && renderMenu(currentQuote)}
            {hoveredId && hoverPos && hoveredQuote && <HoverActionMenu id={hoveredId} type="Quotation" pos={hoverPos} data={hoveredQuote} />}

            {props.viewMode === 'Card' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                        {(currentItems || []).map((item: any) => (
                            <div key={item.id} onMouseEnter={(e) => onMouseEnter(item.id, e)} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
                                <GenericCard item={item} type="Quotation" onView={props.onView} onEdit={props.onEdit} onDelete={props.onDelete} onAction={props.onAction} currencySymbol={companyConfig.currencySymbol} onContextMenu={handleContextMenu} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-3">
                        <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                    </div>
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="table-header">Quote No.</th>
                                    <th className="table-header">Date</th>
                                    <th className="table-header">Customer</th>
                                    <th className="table-header text-right">Total</th>
                                    <th className="table-header text-center">Status</th>
                                    <th className="table-header text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/50">
                                {(currentItems || []).map((q: any) => (
                                    <tr
                                        key={q.id}
                                        id={`qt-${q.id}`}
                                        className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                        onClick={(e) => handleRowClick(e, q.id)}
                                        onContextMenu={(e) => handleContextMenu(e, q.id)}
                                        onMouseEnter={(e) => onMouseEnter(q.id, e)}
                                        onMouseMove={onMouseMove}
                                        onMouseLeave={onMouseLeave}
                                    >
                                        <td className="table-body-cell font-mono font-bold">
                                            <DocLink
                                                docNumber={q.id}
                                                targetPage="/sales-flow/quotations"
                                                rowId={`qt-${q.id}`}
                                                currentPage={location.pathname}
                                            />
                                        </td>
                                        <td className="table-body-cell font-normal">{new Date(q.date).toLocaleDateString()}</td>
                                        <td className="table-body-cell font-medium text-slate-900">{q.customerName}</td>
                                        <td className="table-body-cell text-right font-medium finance-nums">{companyConfig.currencySymbol} {(q.total || 0).toLocaleString()}</td>
                                        <td className="table-body-cell text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${q.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                q.status === 'Sent' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                    q.status === 'Pending Approval' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                        'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>{q.status}</span>
                                        </td>
                                        <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-end gap-1 items-center">
                                                <button onClick={(e) => { e.stopPropagation(); handlePreview('QUOTATION', q); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Preview PDF">
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); props.onAction && props.onAction(q, 'download_pdf'); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Download PDF">
                                                    <Download size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); props.onEdit(q); }} className="p-1.5 text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Edit"><Edit2 size={14} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, q.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                </div>
            )}
        </div>
    );
};

export const RecurringList: React.FC<ListProps<RecurringInvoice>> = (props) => {
    const { companyConfig } = useData();
    const { handlePreview } = useDocumentPreview();
    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);
    const location = useLocation();
    useHighlight();

    const itemsPerPage = props.viewMode === 'Card' ? CARD_ITEMS_PER_PAGE : LIST_ITEMS_PER_PAGE;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(props.data, itemsPerPage);

    const currentSub = (props.data || []).find((d: any) => d.id === openMenuId);
    const hoveredSub = (props.data || []).find((d: any) => d.id === hoveredId);

    const renderMenu = (sub: RecurringInvoice) => {
        const toggleAction = getSubscriptionToggleAction(sub.status);
        const statusColors: Record<string, string> = {
            Draft: 'text-slate-700',
            Active: 'text-emerald-700',
            Paused: 'text-amber-700',
            Cancelled: 'text-rose-700',
            Expired: 'text-slate-500',
        };
        
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 256; // w-64 = 256px
        const menuHeight = 450; // Estimated height for all menu items
        const submenuWidth = 176; // w-44 = 176px
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen (account for submenu)
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
                className="fixed w-64 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar"
                style={{ top: y, left: x, maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-tight bg-slate-100/50 rounded-t-xl shrink-0">RECURRING INVOICE ACTIONS</div>
                <div className="flex-1 overflow-y-auto">
                    <button onClick={() => { setOpenMenuId(null); props.onView(sub); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><ChevronRight size={14} /> View Details</button>
                    <button onClick={() => { setOpenMenuId(null); props.onEdit(sub); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Subscription</button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('SUBSCRIPTION', sub); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Eye size={14} /> Preview Recurring Invoice</button>
                    <button onClick={() => { setOpenMenuId(null); handlePreview('PO', sub); }} className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition-colors"><ShoppingBag size={14} /> Preview Purchase Order</button>
                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(sub, 'download_pdf'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Download size={14} /> Download Recurring Invoice</button>

                    <div className="my-1 border-t border-slate-200"></div>

                    {/* Change Status submenu */}
                    <div className="relative">
                        <button
                            onClick={() => setActiveSubmenu(activeSubmenu === 'sub_status' ? null : 'sub_status')}
                            className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                        >
                            <div className="flex items-center gap-3"><RefreshCw size={14} /> Change Status</div>
                            <ChevronRight size={12} />
                        </button>
                        {activeSubmenu === 'sub_status' && (
                            <div className="absolute left-full top-0 ml-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in slide-in-from-left-2 overflow-hidden">
                                {(['Draft', 'Active', 'Paused', 'Cancelled', 'Expired'] as const).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(sub, `status_${status}`); }}
                                        className={`w-full px-4 py-2 text-xs text-left hover:bg-slate-50 flex items-center gap-2 transition-colors ${sub.status === status ? 'font-bold bg-slate-50' : 'font-medium'} ${statusColors[status] || 'text-slate-700'}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-emerald-500' : status === 'Paused' ? 'bg-amber-500' : status === 'Cancelled' ? 'bg-rose-500' : 'bg-slate-400'}`}></span>
                                        {status}
                                        {sub.status === status && <Check size={12} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {toggleAction && (
                        <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(sub, 'toggle_status'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-3 transition-colors">
                            {toggleAction.icon === 'pause' ? <><Pause size={14} /> {toggleAction.label}</> : <><Play size={14} /> {toggleAction.label}</>}
                        </button>
                    )}

                    <div className="my-1 border-t border-slate-200"></div>
                    <button onClick={() => { setOpenMenuId(null); props.onAction && props.onAction(sub, 'duplicate_exact'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 flex items-center gap-3 transition-colors"><Copy size={14} /> Duplicate</button>
                    <div className="my-1 border-t border-slate-200"></div>
                    <button onClick={() => { setOpenMenuId(null); props.onDelete(sub.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {openMenuId && menuPos && currentSub && renderMenu(currentSub)}
            {hoveredId && hoverPos && hoveredSub && <HoverActionMenu id={hoveredId} type="Subscription" pos={hoverPos} data={hoveredSub} />}

            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="table-header">ID</th>
                                <th className="table-header">Customer</th>
                                <th className="table-header">Frequency</th>
                                <th className="table-header">Next Run</th>
                                <th className="table-header text-right">Total</th>
                                <th className="table-header text-center">Status</th>
                                <th className="table-header text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50">
                            {(currentItems || []).map((sub: any) => (
                                <tr
                                    key={sub.id}
                                    id={`sub-${sub.id}`}
                                    className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                    onClick={(e) => handleRowClick(e, sub.id)}
                                    onContextMenu={(e) => handleContextMenu(e, sub.id)}
                                    onMouseEnter={(e) => onMouseEnter(sub.id, e)}
                                    onMouseMove={onMouseMove}
                                    onMouseLeave={onMouseLeave}
                                >
                                    <td className="table-body-cell font-mono font-bold">
                                        <DocLink
                                            docNumber={sub.id}
                                            targetPage="/sales-flow/recurring"
                                            rowId={`sub-${sub.id}`}
                                            currentPage={location.pathname}
                                        />
                                    </td>
                                    <td className="table-body-cell font-medium text-slate-900">{sub.customerName}</td>
                                    <td className="table-body-cell font-normal">{sub.frequency}</td>
                                    <td className="table-body-cell font-normal">{new Date(sub.nextRunDate).toLocaleDateString()}</td>
                                    <td className="table-body-cell text-right font-medium finance-nums">{companyConfig.currencySymbol} {(sub.total || 0).toLocaleString()}</td>
                                    <td className="table-body-cell text-center">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${sub.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                            'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>{sub.status}</span>
                                    </td>
                                        <td className="table-body-cell text-right" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-end gap-1 items-center">
                                            <button onClick={(e) => { e.stopPropagation(); handlePreview('SUBSCRIPTION', sub); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Preview Recurring Invoice">
                                                <Eye size={14} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); props.onAction && props.onAction(sub, 'download_pdf'); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Download Recurring Invoice">
                                                <Download size={14} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); props.onEdit(sub); }} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all" title="Edit"><Edit2 size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleRowClick(e, sub.id); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><MoreVertical size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
            </div>
        </div>
    );
};
