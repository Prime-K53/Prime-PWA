import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Calendar as CalendarIcon, List, DollarSign, TrendingUp, RefreshCw,
    Play, Pause, Edit2, Trash2, Mail, MoreVertical, CreditCard, CheckCircle, Eye,
    ChevronLeft, ChevronRight, AlertCircle, ShoppingBag, Clock, Copy, Target, Activity, Zap,
    ArrowUpRight, ShieldCheck, User, ArrowRight, Wallet, Layout, Box, History as HistoryIcon, PlayCircle,
    Download
} from 'lucide-react';
import { RecurringInvoice } from '../../../types';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useData } from '../../../context/DataContext';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import { HoverActionMenu, useHoverTimer, RecurringList } from './SalesLists';

interface SubscriptionViewProps {
    data: RecurringInvoice[];
    onEdit: (item: RecurringInvoice) => void;
    onView: (item: RecurringInvoice) => void;
    onDelete: (id: string) => void;
    onAction: (item: RecurringInvoice, action: string) => void;
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

// Local Hook for Context Menu
const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(id);

        const menuWidth = 224; // w-56 = 224px
        const menuHeight = 280; // Estimated height of menu with 7 items

        // Calculate available space
        const spaceBelow = window.innerHeight - e.clientY;
        const spaceAbove = e.clientY;

        // Determine optimal position (prefer below, but check above if needed)
        let y = e.clientY;
        if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
            y = e.clientY - menuHeight;
        } else if (spaceBelow < menuHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        // Ensure menu stays within horizontal bounds
        const x = Math.max(0, Math.min(e.clientX, window.innerWidth - menuWidth));

        setMenuPos({ x, y });
    };

    return { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId };
};

const SubscriptionView: React.FC<SubscriptionViewProps> = ({ data, onEdit, onView, onDelete, onAction }) => {
    const { companyConfig, invoices, runRecurringBilling } = useData();
    const { handlePreview } = useDocumentPreview();
    const currency = companyConfig.currencySymbol;
    const [viewMode, setViewMode] = useState<'List' | 'Grid' | 'Calendar'>('List');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isRunningBilling, setIsRunningBilling] = useState(false);
    const { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);

    const stats = useMemo(() => {
        let mrr = 0;
        let activeCount = 0;
        let totalSubscriptions = (data || []).length;
        let upcomingTotal = 0;

        (data || []).forEach(sub => {
            if (sub.status === 'Active') {
                activeCount++;
                upcomingTotal += sub.total;
                let monthlyVal = sub.total;
                if (sub.frequency === 'Weekly') monthlyVal = sub.total * 4.33;
                else if (sub.frequency === 'Quarterly') monthlyVal = sub.total / 3;
                else if (sub.frequency === 'Annually') monthlyVal = sub.total / 12;
                mrr += monthlyVal;
            }
        });
        return { mrr, activeCount, upcomingTotal, totalSubscriptions, arr: mrr * 12 };
    }, [data]);

    const handleRunBilling = async () => {
        setIsRunningBilling(true);
        await runRecurringBilling();
        setIsRunningBilling(false);
    };

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = new Date(year, month, i).toISOString().split('T')[0];
            const triggers = (data || []).filter(sub => sub.status === 'Active' && (sub.nextRunDate === dateStr || (sub.scheduledDates && sub.scheduledDates.includes(dateStr))));
            days.push({ day: i, date: dateStr, triggers });
        }
        return days;
    }, [currentMonth, data]);

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentMonth(newDate);
    };

    const itemsPerPage = 12;
    const { currentItems, currentPage, maxPage, totalItems, next, prev } = usePagination(data || [], itemsPerPage);
    const currentSub = (data || []).find(s => s.id === openMenuId);
    const hoveredSub = (data || []).find(s => s.id === hoveredId);

    const renderMenu = (sub: RecurringInvoice) => {
        const toggleAction = getSubscriptionToggleAction(sub.status);
        
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 224; // w-56 = 224px
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
        <div ref={menuRef} className="fixed w-56 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar" style={{ top: y, left: x, maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100/50 rounded-t-xl">Subscription Actions</div>
            <button onClick={() => { setOpenMenuId(null); onView(sub); }} className="w-full text-left px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Eye size={14} /> Preview Details</button>
            <button onClick={() => { setOpenMenuId(null); handlePreview('SUBSCRIPTION', sub); }} className="w-full text-left px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Eye size={14} /> Preview Recurring Invoice</button>
            <button onClick={() => { setOpenMenuId(null); onAction(sub, 'download_pdf'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"><Download size={14} /> Download Recurring Invoice</button>
            <div className="my-1 border-t border-slate-200"></div>
            <button onClick={() => { setOpenMenuId(null); onEdit(sub); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><Edit2 size={14} /> Edit Subscription</button>
            {toggleAction && (
                <button onClick={() => { setOpenMenuId(null); onAction(sub, 'toggle_status'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-3 transition-colors">
                    {toggleAction.icon === 'pause' ? <><Pause size={14} /> {toggleAction.label}</> : <><Play size={14} /> {toggleAction.label}</>}
                </button>
            )}
            <button onClick={() => { setOpenMenuId(null); onAction(sub, 'duplicate_exact'); }} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"><Copy size={14} /> Duplicate</button>
            <div className="my-1 border-t border-slate-200"></div>
            <button onClick={() => { setOpenMenuId(null); onDelete(sub.id); }} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 size={14} /> Delete</button>
        </div>
    );
};

    const getFrequencyBadge = (freq: string) => {
        switch (freq) {
            case 'Weekly': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Monthly': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'Quarterly': return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'Annually': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    return (
        <>
            {openMenuId && menuPos && currentSub && renderMenu(currentSub)}
            {hoveredId && hoverPos && hoveredSub && <HoverActionMenu id={hoveredId} type="Subscription" pos={hoverPos} data={hoveredSub} />}
            <div className="flex flex-col h-full space-y-6 print-force-white relative font-normal">

            {/* Stats Header */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white/80 backdrop-blur-md p-4 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                        <TrendingUp size={24} />
                    </div>
                    <div className="font-normal">
                        <p className="text-[12px] font-normal text-slate-400 uppercase tracking-widest">Est. MRR</p>
                        <p className="text-base font-semibold text-slate-900">{currency}{stats.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                </div>
                <div className="bg-white/80 backdrop-blur-md p-4 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                        <RefreshCw size={24} />
                    </div>
                    <div className="font-normal">
                        <p className="text-[12px] font-normal text-slate-400 uppercase tracking-widest">Active Plans</p>
                        <p className="text-base font-semibold text-slate-900">{stats.activeCount}</p>
                    </div>
                </div>
                <div className="bg-white/80 backdrop-blur-md p-4 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                        <CheckCircle size={24} />
                    </div>
                    <div className="font-normal">
                        <p className="text-[12px] font-normal text-slate-400 uppercase tracking-widest">Next Run Value</p>
                        <p className="text-base font-semibold text-slate-900">{currency}{stats.upcomingTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-[2rem] shadow-xl flex items-center gap-4 text-white overflow-hidden relative font-normal">
                    <div className="absolute -top-4 -right-4 p-4 opacity-10 rotate-12"><Target size={80} /></div>
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                        <Target size={24} />
                    </div>
                    <div>
                        <p className="text-[12px] font-normal text-blue-400 uppercase tracking-widest">ARR Projection</p>
                        <p className="text-base font-semibold">{currency}{(stats.arr / 1000).toFixed(1)}k</p>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-3xl shadow-sm border border-white/60 flex flex-col overflow-hidden min-h-0 print:bg-white print:border-none print:shadow-none font-normal">
                <div className="p-4 border-b border-slate-200/60 flex justify-between items-center bg-slate-50/30 print:hidden">
                    <div className="flex bg-white/50 p-1 rounded-xl border border-slate-200/60 shadow-sm">
                        <button onClick={() => setViewMode('List')} className={`px-4 py-2 rounded-lg text-xs font-normal uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'List' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
                            <List size={14} /> List View
                        </button>
                        <button onClick={() => setViewMode('Grid')} className={`px-4 py-2 rounded-lg text-xs font-normal uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'Grid' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Layout size={14} /> Grid View
                        </button>
                        <button onClick={() => setViewMode('Calendar')} className={`px-4 py-2 rounded-lg text-xs font-normal uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'Calendar' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
                            <CalendarIcon size={14} /> Run Calendar
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRunBilling}
                            disabled={isRunningBilling}
                            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 flex items-center gap-2 shadow-lg disabled:opacity-50"
                        >
                            {isRunningBilling ? <RefreshCw size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                            Process Due Cycles
                        </button>
                        {viewMode === 'Calendar' && (
                            <div className="flex items-center gap-4 bg-white/50 px-3 py-1.5 rounded-2xl border border-slate-200/60 ml-4">
                                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"><ChevronLeft size={18} /></button>
                                <span className="font-semibold text-slate-800 w-40 text-center text-[12px] uppercase tracking-widest">{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"><ChevronRight size={18} /></button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar print:overflow-visible font-normal">
                    {viewMode === 'List' ? (
                        <RecurringList
                            data={data}
                            onEdit={onEdit}
                            onView={onView}
                            onDelete={onDelete}
                            onAction={onAction}
                            viewMode="List"
                        />
                    ) : viewMode === 'Grid' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {(currentItems || []).map(sub => {
                                    // Find last invoice generated for this sub to show activity
                                    const lastGeneratedInvoice = (invoices || [])
                                        .filter(inv => inv.customerName === sub.customerName && inv.id.includes('REC'))
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

                                    return (
                                        <div
                                            key={sub.id}
                                            onClick={() => onEdit(sub)}
                                            onContextMenu={(e) => handleContextMenu(e, sub.id)}
                                            onMouseEnter={(e) => onMouseEnter(sub.id, e)}
                                            onMouseMove={onMouseMove}
                                            onMouseLeave={onMouseLeave}
                                            className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-float transition-all p-6 cursor-pointer group flex flex-col relative overflow-hidden"
                                        >
                                            <div className={`absolute top-0 left-0 w-full h-1 ${sub.status === 'Active' ? 'bg-blue-500' : 'bg-slate-300'}`}></div>

                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100 shadow-inner group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                        <User size={20} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-slate-900 text-sm leading-tight">{sub.customerName}</h4>
                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 font-normal">{sub.id}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 items-center">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getFrequencyBadge(sub.frequency)}`}>
                                                        {sub.frequency}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePreview('SUBSCRIPTION', sub); }}
                                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Preview PDF"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, sub.id); }} className="text-slate-300 hover:text-slate-600 p-1">
                                                        <MoreVertical size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Description: Item List */}
                                            <div className="mb-4 bg-slate-50/50 rounded-2xl p-3 border border-slate-100 flex-1">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                    <Box size={10} /> Order Description
                                                </p>
                                                <div className="space-y-1.5">
                                                    {(sub.items || []).slice(0, 2).map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-[11px]">
                                                            <span className="text-slate-700 font-medium truncate pr-4">{item.name}</span>
                                                            <span className="text-blue-600 font-bold shrink-0">x{item.quantity}</span>
                                                        </div>
                                                    ))}
                                                    {(sub.items || []).length > 2 && (
                                                        <p className="text-[9px] text-slate-400 italic">+{(sub.items || []).length - 2} more items...</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                    <div className="text-[9px] font-normal text-slate-400 uppercase tracking-widest mb-1">Cycle Total</div>
                                                    <div className="text-sm font-semibold text-slate-900">{currency}{sub.total.toLocaleString()}</div>
                                                </div>
                                                <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                    <div className="text-[9px] font-normal text-slate-400 uppercase tracking-widest mb-1">Next Trigger</div>
                                                    <div className="text-xs font-semibold text-blue-600">{new Date(sub.nextRunDate).toLocaleDateString()}</div>
                                                </div>
                                            </div>

                                            <div className="mt-auto space-y-3 pt-4 border-t border-slate-50 font-normal">
                                                {/* Activity Snippet */}
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                    <HistoryIcon size={12} className="text-slate-300" />
                                                    <span>{lastGeneratedInvoice ? `Last Run: ${new Date(lastGeneratedInvoice.date).toLocaleDateString()}` : 'No history yet'}</span>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-2">
                                                        <div className={`p-1.5 rounded-lg border transition-colors ${sub.autoDeductWallet ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`} title="Auto-Pay via Wallet">
                                                            <Wallet size={14} />
                                                        </div>
                                                        <div className={`p-1.5 rounded-lg border transition-colors ${sub.autoEmail ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`} title="Auto-Email Invoices">
                                                            <Mail size={14} />
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAction(sub, 'preview_pdf'); }}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all"
                                                            title="Preview Recurring Invoice"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAction(sub, 'download_pdf'); }}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all"
                                                            title="Download Recurring Invoice"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    </div>
                                                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${sub.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        <div className={`w-2 h-2 rounded-full ${sub.status === 'Active' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-300'}`}></div>
                                                        {sub.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-full print:border-slate-300 font-normal">
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <div key={day} className="bg-slate-100 p-3 text-center text-[10px] font-normal text-slate-500 uppercase tracking-widest print:bg-white border-b border-slate-200">
                                    {day}
                                </div>
                            ))}
                            {(calendarDays || []).map((cell, idx) => (
                                <div key={idx} className={`bg-white p-3 min-h-[120px] flex flex-col ${!cell ? 'bg-slate-50/50 print:bg-white' : ''}`}>
                                    {cell && (
                                        <>
                                            <span className={`text-xs font-semibold mb-3 ${cell.triggers.length > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{cell.day}</span>
                                            <div className="space-y-1.5 flex-1 overflow-y-auto custom-scrollbar font-normal">
                                                {(cell.triggers || []).map(sub => (
                                                    <div
                                                        key={sub.id}
                                                        onClick={(e) => { e.stopPropagation(); onEdit(sub); }}
                                                        onContextMenu={(e) => handleContextMenu(e, sub.id)}
                                                        onMouseEnter={(e) => onMouseEnter(sub.id, e)}
                                                        onMouseMove={onMouseMove}
                                                        onMouseLeave={onMouseLeave}
                                                        className={`text-[9px] p-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 font-semibold truncate cursor-pointer hover:bg-blue-100 transition-colors flex flex-col gap-1 print:border-slate-200 ${openMenuId === sub.id ? 'ring-2 ring-blue-400' : ''}`}
                                                    >
                                                        <div className="flex justify-between">
                                                            <span className="truncate">{sub.customerName}</span>
                                                            <span className="font-bold">{currency}{sub.total.toFixed(0)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default SubscriptionView;
