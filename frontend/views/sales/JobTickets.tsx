import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, Search, Filter, Clock, CheckCircle, Truck, X, Edit2, Trash2, 
  AlertTriangle, Calendar, User, Printer, FileText, Phone, Mail,
  ChevronRight, Package, Zap, ArrowRight, MoreVertical, Play, Bell,
  Upload, Download, Send, MessageSquare, File as FileIcon, Eye, Share2, Image as ImageIcon,
  ChevronDown, Check, Ticket, Copy, SendHorizontal
} from 'lucide-react';
import { jobTicketService, JobTicketNotification } from '../../services/jobTicketService';
import { localFileStorage } from '../../services/localFileStorage';
import { JobTicket, JobTicketStatus, JobTicketPriority, JobTicketType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useDocumentStore } from '../../stores/documentStore';
import { isStoredFileIdentifier } from '../../utils/documentPreview';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

const statusConfig: Record<JobTicketStatus, { label: string; color: string; icon: React.ReactNode; cardBg: string }> = {
  Received: { label: 'Received', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Package size={14} />, cardBg: 'bg-blue-50' },
  Processing: { label: 'Processing', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Printer size={14} />, cardBg: 'bg-amber-50' },
  Ready: { label: 'Ready', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle size={14} />, cardBg: 'bg-emerald-50' },
  Delivered: { label: 'Delivered', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: <Truck size={14} />, cardBg: 'bg-slate-50' },
  Cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: <X size={14} />, cardBg: 'bg-red-50' },
};

const priorityConfig: Record<JobTicketPriority, { label: string; color: string }> = {
  Normal: { label: 'Normal', color: 'bg-slate-100 text-slate-600' },
  Rush: { label: 'Rush', color: 'bg-orange-100 text-orange-700' },
  Express: { label: 'Express', color: 'bg-red-100 text-red-700' },
  Urgent: { label: 'Urgent', color: 'bg-red-200 text-red-900 animate-pulse' },
};

const typeConfig: Record<JobTicketType, { label: string; icon: React.ReactNode }> = {
  Photocopy: { label: 'Photocopy', icon: <Printer size={16} /> },
  Printing: { label: 'Printing', icon: <FileText size={16} /> },
  Binding: { label: 'Binding', icon: <Package size={16} /> },
  Scan: { label: 'Scan', icon: <FileText size={16} /> },
  Lamination: { label: 'Lamination', icon: <Package size={16} /> },
  Other: { label: 'Other', icon: <FileText size={16} /> },
};

export const JobTickets: React.FC = () => {
  const { companyConfig, notify } = useAuth(); const { customers } = useSales();
  const currency = companyConfig.currencySymbol;
  
  const [tickets, setTickets] = useState<JobTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobTicketStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<JobTicketPriority | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<JobTicket | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<JobTicket | null>(null);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const data = await jobTicketService.getAll();
      setTickets(data);
    } catch (error) {
      console.error('Failed to load tickets:', error);
      notify('Failed to load job tickets', 'error');
    }
    setIsLoading(false);
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const matchesSearch = !searchTerm || 
        ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'All' || ticket.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { Urgent: 0, Express: 1, Rush: 2, Normal: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    total: tickets.length,
    received: tickets.filter(t => t.status === 'Received').length,
    processing: tickets.filter(t => t.status === 'Processing').length,
    ready: tickets.filter(t => t.status === 'Ready').length,
    overdue: tickets.filter(t => {
      if (t.status === 'Delivered' || t.status === 'Cancelled') return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date();
    }).length,
    today: tickets.filter(t => {
      const today = new Date().toISOString().split('T')[0];
      return t.dateReceived.split('T')[0] === today;
    }).length,
  }), [tickets]);

  const handleCreateTicket = async (data: Partial<JobTicket>) => {
    try {
      await jobTicketService.create(data);
      notify('Job ticket created successfully', 'success');
      loadTickets();
      setShowForm(false);
    } catch (error) {
      notify('Failed to create job ticket', 'error');
    }
  };

  const handleUpdateTicket = async (data: Partial<JobTicket>) => {
    if (!editingTicket) return;
    try {
      await jobTicketService.update(editingTicket.id, data);
      notify('Job ticket updated successfully', 'success');
      loadTickets();
      setEditingTicket(null);
    } catch (error) {
      notify('Failed to update job ticket', 'error');
    }
  };

  const handleDeleteTicket = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this job ticket?')) return;
    try {
      await jobTicketService.delete(id);
      notify('Job ticket deleted', 'success');
      loadTickets();
      setSelectedTicket(null);
    } catch (error) {
      notify('Failed to delete job ticket', 'error');
    }
  };

  const handleStatusChange = async (id: string, status: JobTicketStatus) => {
    try {
      await jobTicketService.updateStatus(id, status);
      notify(`Status updated to ${statusConfig[status].label}`, 'success');
      loadTickets();
    } catch (error) {
      notify('Failed to update status', 'error');
    }
  };

  const handleProgressChange = async (id: string, progress: number) => {
    try {
      await jobTicketService.updateProgress(id, progress);
      loadTickets();
    } catch (error) {
      notify('Failed to update progress', 'error');
    }
  };

  const getTimeRemaining = (dueDate?: string) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due.getTime() - now.getTime();
    if (diff < 0) return { text: 'Overdue', className: 'text-red-600 font-bold' };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return { text: `${days}d ${hours % 24}h`, className: 'text-slate-600' };
    if (hours > 0) return { text: `${hours}h`, className: 'text-amber-600 font-bold' };
    return { text: '< 1h', className: 'text-red-600 font-bold' };
  };

  // Export job card as image
  const handleExportCard = async (ticket: JobTicket) => {
    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }

    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const link = document.createElement('a');
      link.download = `job-ticket-${ticket.ticketNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      notify('Card exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      notify('Failed to export card', 'error');
    }
  };

  // Share job card
  const handleShareCard = async (ticket: JobTicket) => {
    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }

    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          notify('Failed to generate image', 'error');
          return;
        }

        // Try native share API first
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `job-ticket-${ticket.ticketNumber}.png`, { type: 'image/png' });
          const shareData = {
            title: `Job Ticket ${ticket.ticketNumber}`,
            text: `Job ticket for ${ticket.customerName} - ${currency}${ticket.total.toLocaleString()}`,
            files: [file],
          };
          
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData);
              notify('Card shared successfully', 'success');
              return;
            } catch (shareError) {
              // User cancelled or share failed, fall through to copy
            }
          }
        }

        // Fallback: download the image (clipboard not supported for images in Electron)
        const link = document.createElement('a');
        link.download = `job-ticket-${ticket.ticketNumber}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        notify('Card downloaded', 'success');
      }, 'image/png');
    } catch (error) {
      console.error('Share failed:', error);
      notify('Failed to share card', 'error');
    }
  };

  const handleSendCardToCustomer = async (ticket: JobTicket) => {
    if (!ticket.customerPhone) {
      notify('No customer phone number', 'error');
      return;
    }

    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }

    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          notify('Failed to generate image', 'error');
          return;
        }

        const file = new File([blob], `job-ticket-${ticket.ticketNumber}.png`, { type: 'image/png' });
        
        const message = `Job Ticket #${ticket.ticketNumber}\nCustomer: ${ticket.customerName}\nAmount: ${currency}${ticket.total.toLocaleString()}\nStatus: ${ticket.status}`;
        
        const waUrl = `https://wa.me/${ticket.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message + '\n\nImage attached')}`;
        window.open(waUrl, '_blank');
        
        notify('Opening WhatsApp...', 'success');
      }, 'image/png');
    } catch (error) {
      console.error('Send to customer failed:', error);
      notify('Failed to send card to customer', 'error');
    }
  };

  const companyName = companyConfig?.companyName || 'Prime ERP';
  
  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto w-full font-normal overflow-y-auto custom-scrollbar">
      {/* Header Section */}
      <div className="mb-6 px-4 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
              <Printer className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight leading-tight">Job Tickets</h1>
              <p className="text-[13.5px] text-slate-500 font-medium leading-relaxed">Manage print jobs and service orders</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-[13.5px] flex items-center gap-2 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all active:scale-95"
          >
            <Plus size={18} />
            New Job Ticket
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-500"></div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
          </div>
          <p className="text-[22px] font-bold text-slate-800 tabular-nums leading-none">{stats.total}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <p className="text-[12px] font-bold text-blue-600 uppercase tracking-wider">Received</p>
          </div>
          <p className="text-[22px] font-bold text-blue-700 tabular-nums leading-none">{stats.received}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-amber-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <p className="text-[12px] font-bold text-amber-600 uppercase tracking-wider">Processing</p>
          </div>
          <p className="text-[22px] font-bold text-amber-700 tabular-nums leading-none">{stats.processing}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <p className="text-[12px] font-bold text-emerald-600 uppercase tracking-wider">Ready</p>
          </div>
          <p className="text-[22px] font-bold text-emerald-700 tabular-nums leading-none">{stats.ready}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-red-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <p className="text-[12px] font-bold text-red-600 uppercase tracking-wider">Overdue</p>
          </div>
          <p className="text-[22px] font-bold text-red-700 tabular-nums leading-none">{stats.overdue}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-violet-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
            <p className="text-[12px] font-bold text-violet-600 uppercase tracking-wider">Today</p>
          </div>
          <p className="text-[22px] font-bold text-violet-700 tabular-nums leading-none">{stats.today}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13.5px] font-medium text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobTicketStatus | 'All')}
          className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-[13.5px] font-medium text-slate-700 focus:border-blue-500 outline-none transition-all cursor-pointer"
        >
          <option value="All">All Status</option>
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as JobTicketPriority | 'All')}
          className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-[13.5px] font-medium text-slate-700 focus:border-blue-500 outline-none transition-all cursor-pointer"
        >
          <option value="All">All Priority</option>
          {Object.entries(priorityConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package size={48} className="mb-3 opacity-50" />
          <p className="text-sm">No job tickets found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTickets.map((ticket) => {
            const timeRemaining = getTimeRemaining(ticket.dueDate);
            return (
              <JobTicketCard
                key={ticket.id}
                ticket={ticket}
                currency={currency}
                timeRemaining={timeRemaining}
                onClick={() => setSelectedTicket(ticket)}
                onExport={() => handleExportCard(ticket)}
                onShare={() => handleShareCard(ticket)}
                onSendToCustomer={() => handleSendCardToCustomer(ticket)}
              />
            );
          })}
        </div>
      )}

      {(showForm || editingTicket) && (
        <JobTicketForm
          ticket={editingTicket}
          customers={customers}
          onSave={editingTicket ? handleUpdateTicket : handleCreateTicket}
          onClose={() => { setShowForm(false); setEditingTicket(null); }}
        />
      )}

      {selectedTicket && (
        <JobTicketDetail
          ticket={selectedTicket}
          currency={currency}
          onEdit={() => { setEditingTicket(selectedTicket); setSelectedTicket(null); }}
          onDelete={() => handleDeleteTicket(selectedTicket.id)}
          onStatusChange={handleStatusChange}
          onProgressChange={handleProgressChange}
          onClose={() => setSelectedTicket(null)}
          allTickets={tickets}
          onReorder={(ticket) => { setEditingTicket(ticket); setSelectedTicket(null); }}
        />
      )}
    </div>
  );
};

interface JobTicketCardProps {
  ticket: JobTicket;
  currency: string;
  timeRemaining: { text: string; className?: string } | null;
  onClick: () => void;
  onExport: () => void;
  onShare?: () => void;
  onSendToCustomer?: () => void;
}

const JobTicketCard: React.FC<JobTicketCardProps> = ({ ticket, currency, timeRemaining, onClick, onExport, onShare, onSendToCustomer }) => {
  const { companyConfig, notify } = useAuth();
  const [qrSrc, setQrSrc] = useState<string>('');
  
  const cardBgColor = statusConfig[ticket.status]?.cardBg || 'bg-gray-50';
  const colorMap: Record<JobTicketStatus, string> = {
    Received: 'blue',
    Processing: 'amber',
    Ready: 'emerald',
    Delivered: 'slate',
    Cancelled: 'red'
  };
  const color = colorMap[ticket.status] || 'slate';
  
  const getColorStyle = (shade: number) => {
    const colors: Record<string, string> = {
      'blue': '#3b82f6',
      'amber': '#f59e0b',
      'emerald': '#10b981',
      'slate': '#64748b',
      'red': '#ef4444'
    };
    return colors[color] || colors['slate'];
  };
  
  const getBgStyle = (opacity = 0.1) => {
    const colors: Record<string, string> = {
      'blue': `rgba(59, 130, 246, ${opacity})`,
      'amber': `rgba(245, 158, 11, ${opacity})`,
      'emerald': `rgba(16, 185, 129, ${opacity})`,
      'slate': `rgba(100, 116, 139, ${opacity})`,
      'red': `rgba(239, 68, 68, ${opacity})`
    };
    return colors[color] || colors['slate'];
  };

  useEffect(() => {
    const qrData = JSON.stringify({
      id: ticket.id,
      number: ticket.ticketNumber,
      customer: ticket.customerName,
      total: ticket.total
    });
    QRCode.toDataURL(qrData, {
      width: 200,
      margin: 1,
      color: {
        dark: '#1e293b', // High contrast but not pure black
        light: '#ffffff'
      }
    }).then(setQrSrc).catch(console.error);
  }, [ticket, companyConfig]);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ticket.id);
    notify('Ticket ID copied to clipboard', 'success');
  };

  const isActive = ['Received', 'Processing', 'Ready'].includes(ticket.status);

  return (
    <div
      id={`ticket-card-${ticket.id}`}
      onClick={onClick}
      style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontFeatureSettings: '"tnum"', maxWidth: '100%' }}
      className={`${cardBgColor} rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden flex flex-col antialiased`}
    >
      {/* ── Header — 12px vertical, 16px horizontal padding ── */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
            <Ticket size={16} style={{ color: getColorStyle(600) }} />
          </div>
{/* Title: 22px, weight 700, tight tracking */}
          <h2
            style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2, color: getColorStyle(700) }}
            className="uppercase"
          >
            Job Ticket
          </h2>
      </div>
      {/* Status badge: 12px, weight 500, compact padding */}
      <div
        style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }}
        className={`flex items-center gap-1 px-2 py-1 rounded-full ${isActive ? 'bg-white' : 'bg-slate-50'}`}
      >
        <div className={`w-1 h-1 rounded-full shrink-0 ${isActive ? '' : 'bg-slate-400'}`} style={isActive ? { backgroundColor: getColorStyle(500) } : {}} />
        {ticket.status}
      </div>
      </div>

      {/* ── Main Body ── */}
      <div className="flex flex-1 text-slate-700 text-xs">
        {/* Left Column */}
        <div className="flex-1">

          {/* Row 1: Ticket # | Quantity */}
          <div className="grid grid-cols-2">
            {/* Ticket # */}
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
                <Ticket size={12} style={{ color: getColorStyle(600) }} />
              </div>
              <div className="min-w-0">
                {/* Label: 10px, weight 500, slate-400 */}
                <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Ticket #</p>
                {/* Value: 11px, weight 600, slate-800, tabular */}
                <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }} className="text-slate-800 truncate">
                  {ticket.ticketNumber}
                </p>
              </div>
            </div>
            {/* Quantity — left-aligned */}
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
                <Package size={12} style={{ color: getColorStyle(600) }} />
              </div>
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Qty</p>
                <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }} className="text-slate-800 truncate">
                  {ticket.quantity.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Row 2: Customer */}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
              <User size={12} style={{ color: getColorStyle(600) }} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Customer</p>
              {/* Customer name: 12px, weight 600 — slightly larger for prominence */}
              <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4 }} className="text-slate-800 truncate">
                {ticket.customerName}
              </p>
            </div>
          </div>

          {/* Row 3: Amount | Due Date */}
          <div className="grid grid-cols-2">
            {/* Amount — left-aligned */}
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: getColorStyle(600) }}>{currency}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Amount</p>
                <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }} className="text-slate-800 truncate">
                  {currency}{ticket.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            {/* Due Date */}
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
                <Calendar size={12} style={{ color: getColorStyle(600) }} />
              </div>
              <div className="min-w-0">
                <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Due</p>
                <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }} className="text-slate-800 truncate">
                  {ticket.dueDate
                    ? new Date(ticket.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Row 4: Description */}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: getBgStyle(0.1) }}>
              <FileText size={12} style={{ color: getColorStyle(600) }} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.4 }} className="text-slate-400">Description</p>
              {/* Description: 10px body weight, weight 400 */}
              <p style={{ fontSize: '10px', fontWeight: 400, lineHeight: 1.5 }} className="text-slate-700 line-clamp-1">
                {ticket.description || 'No description provided'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Right Column — QR Code ── */}
        <div className="w-[140px] px-3 py-3 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: getBgStyle(0.1) }}>
          <div className="p-2 border-2 border-dashed rounded-xl bg-white">
            {qrSrc ? (
              <img src={qrSrc} alt="QR Code" className="w-[80px] h-[80px] mix-blend-multiply" />
            ) : (
              <div className="w-[80px] h-[80px] animate-pulse rounded-lg" style={{ backgroundColor: getBgStyle(0.1) }} />
            )}
          </div>
          <div className="text-center">
            <p style={{ fontSize: '10px', fontWeight: 400, lineHeight: 1.4 }} className="text-slate-400">Scan to view</p>
            <p style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.4 }} className="text-slate-700">QR</p>
          </div>
        </div>
      </div>

      {/* ── Footer — 10px vertical, 16px horizontal ── */}
      <div className="px-2 py-1 flex items-center justify-between" style={{ backgroundColor: getBgStyle(0.1) }}>
        <div className="flex items-center gap-1">
          <Clock size={10} className="text-slate-400 shrink-0" />
          {/* Footer text: 10px, weight 400, tabular */}
          <span
            style={{ fontSize: '9px', fontWeight: 400, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}
            className="text-slate-400"
          >
            {new Date(ticket.dateReceived).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: '9px', fontWeight: 400, lineHeight: 1.4 }} className="text-slate-400">
            ID:{' '}
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '8px', fontWeight: 500 }} className="text-slate-500">
              {ticket.id}
            </span>
          </span>
          <button
            onClick={handleCopyId}
            style={{ padding: '2px' }}
            className="border border-transparent rounded transition-all active:scale-95"
            title="Copy Ticket ID"
          >
            <Copy size={10} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {onShare && (
            <button
              onClick={(e) => { e.stopPropagation(); onShare(); }}
              style={{ padding: '2px' }}
              className="border border-transparent rounded transition-all active:scale-95"
              title="Share Card"
            >
              <Share2 size={10} />
            </button>
          )}
          {onSendToCustomer && ticket.customerPhone && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendToCustomer(); }}
            style={{ padding: '2px' }}
            className="border border-transparent rounded transition-all active:scale-95"
            title="Send to Customer via WhatsApp"
          >
            <SendHorizontal size={10} />
          </button>
        )}
      </div>
    </div>
  </div>
  );
};


interface JobTicketFormProps {
  ticket?: JobTicket | null;
  customers: any[];
  onSave: (data: Partial<JobTicket>) => void;
  onClose: () => void;
}

const JobTicketForm: React.FC<JobTicketFormProps> = ({ ticket, customers, onSave, onClose }) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const companyName = companyConfig?.companyName || 'Prime ERP';
  
  const [formData, setFormData] = useState({
    type: ticket?.type || 'Printing' as JobTicketType,
    customerId: ticket?.customerId || '',
    customerName: ticket?.customerName || 'Walk-in',
    customerPhone: ticket?.customerPhone || '',
    description: ticket?.description || '',
    quantity: ticket?.quantity || 1,
    priority: ticket?.priority || 'Normal' as JobTicketPriority,
    paperSize: ticket?.paperSize || 'A4',
    paperType: ticket?.paperType || 'A4 80g',
    colorMode: ticket?.colorMode || 'BlackWhite',
    sides: ticket?.sides || 'Single',
    unitPrice: ticket?.unitPrice || 2.00,
    totalOverride: ticket?.total || 0,
    dueDate: ticket?.dueDate?.split('T')[0] || '',
    dueTime: ticket?.dueTime || '',
    notes: ticket?.notes || '',
    operatorName: ticket?.operatorName || '',
    machineName: ticket?.machineName || '',
  });

  // Customer search state
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Filter customers based on search term
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return customers.slice(0, 10);
    const search = customerSearchTerm.toLowerCase();
    return customers.filter(c => 
      c.name?.toLowerCase().includes(search) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [customers, customerSearchTerm]);

  // Handle customer selection
  const handleCustomerSelect = (customer: any) => {
    setFormData({
      ...formData,
      customerId: customer.id?.toString() || '',
      customerName: customer.name || 'Walk-in',
      customerPhone: customer.phone || '',
    });
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalPreview = useMemo(() => {
    const subtotal = formData.quantity * formData.unitPrice;
    let rushFee = 0;
    if (formData.priority === 'Rush') rushFee = subtotal * 0.25;
    else if (formData.priority === 'Express') rushFee = subtotal * 0.50;
    else if (formData.priority === 'Urgent') rushFee = subtotal * 1.00;
    
    const afterRush = subtotal + rushFee;
    const hasCustomTotal = formData.totalOverride > 0;
    const finalTotal = hasCustomTotal ? formData.totalOverride : afterRush;
    
    return { subtotal, rushFee, total: finalTotal };
  }, [formData.quantity, formData.unitPrice, formData.priority, formData.totalOverride]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Printer className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold text-white leading-tight">{ticket ? 'Edit Job Ticket' : 'New Job Ticket'}</h2>
              <p className="text-[12px] text-blue-100 font-medium">{companyName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <X size={20} className="text-white" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(92vh-80px)]">
          {/* Customer Section */}
          <div className="bg-slate-50 rounded-2xl p-5 mb-5 border border-slate-200">
            <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2">
              <User size={16} className="text-blue-600" />
              Customer Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div ref={customerDropdownRef} className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Customer Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={showCustomerDropdown ? customerSearchTerm : formData.customerName}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      setShowCustomerDropdown(true);
                      if (!e.target.value) {
                        setFormData({ ...formData, customerName: 'Walk-in', customerId: '', customerPhone: '' });
                      }
                    }}
                    onFocus={() => {
                      setShowCustomerDropdown(true);
                      setCustomerSearchTerm(formData.customerName === 'Walk-in' ? '' : formData.customerName);
                    }}
                    className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                    placeholder="Search customer or type name..."
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
                
                {showCustomerDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    <div
                      onClick={() => handleCustomerSelect({ id: '', name: 'Walk-in', phone: '' })}
                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-slate-100"
                    >
                      <span className="font-medium text-slate-700">Walk-in Customer</span>
                      {formData.customerName === 'Walk-in' && <Check size={16} className="text-blue-600" />}
                    </div>
                    {filteredCustomers.map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => handleCustomerSelect(customer)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{customer.name}</p>
                          {customer.phone && (
                            <p className="text-xs text-slate-500">{customer.phone}</p>
                          )}
                        </div>
                        {formData.customerId === customer.id?.toString() && <Check size={16} className="text-blue-600" />}
                      </div>
                    ))}
                    {filteredCustomers.length === 0 && customerSearchTerm && (
                      <div className="px-3 py-4 text-center text-slate-500 text-sm">
                        No customers found. Type to add new.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-600 uppercase">Job Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as JobTicketType })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                >
                  <option value="Photocopy">Photocopy</option>
                  <option value="Printing">Printing</option>
                  <option value="Binding">Binding</option>
                  <option value="Scan">Scan</option>
                  <option value="Lamination">Lamination</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                rows={2}
                placeholder="Job description..."
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-600 uppercase">Specifications</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paper Size</label>
                <select
                  value={formData.paperSize}
                  onChange={(e) => setFormData({ ...formData, paperSize: e.target.value as any })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="A5">A5</option>
                  <option value="Legal">Legal</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label>
                <select
                  value={formData.colorMode}
                  onChange={(e) => setFormData({ ...formData, colorMode: e.target.value as any })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                >
                  <option value="BlackWhite">Black & White</option>
                  <option value="Color">Color</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sides</label>
                <select
                  value={formData.sides}
                  onChange={(e) => setFormData({ ...formData, sides: e.target.value as any })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                >
                  <option value="Single">Single Sided</option>
                  <option value="Double">Double Sided</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit Price ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-600 uppercase">Priority</h3>
            <div className="grid grid-cols-4 gap-2">
              {(['Normal', 'Rush', 'Express', 'Urgent'] as JobTicketPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: p })}
                  className={`p-2 rounded-lg text-sm font-bold transition-all ${
                    formData.priority === p ? priorityConfig[p].color + ' ring-2 ring-offset-2' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-600 uppercase">Due Date</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Time</label>
                <input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{currency}{totalPreview.subtotal.toFixed(2)}</span></div>
            {totalPreview.rushFee > 0 && <div className="flex justify-between text-sm text-orange-600"><span>Rush Fee</span><span>+{currency}{totalPreview.rushFee.toFixed(2)}</span></div>}
            <div className="pt-2 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Override Total</label>
              <input
                type="number"
                value={formData.totalOverride || ''}
                onChange={(e) => setFormData({ ...formData, totalOverride: parseFloat(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none text-right font-bold"
                placeholder="Auto-calculated"
              />
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="text-blue-600">{currency}{totalPreview.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 transition-all transform hover:scale-[1.02]">{ticket ? 'Update Ticket' : 'Create Ticket'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface JobTicketDetailProps {
  ticket: JobTicket;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (id: string, status: JobTicketStatus) => void;
  onProgressChange: (id: string, progress: number) => void;
  onClose: () => void;
  allTickets?: JobTicket[];
  onReorder?: (ticket: JobTicket) => void;
}

const JobTicketDetail: React.FC<JobTicketDetailProps> = ({ ticket, currency, onEdit, onDelete, onStatusChange, onProgressChange, onClose, allTickets = [], onReorder }) => {
  const { openFilePreview } = useDocumentStore();
  const [activeTab, setActiveTab] = useState<'details' | 'progress' | 'files' | 'notify' | 'history'>('details');
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nextStatus: Record<JobTicketStatus, JobTicketStatus | null> = {
    Received: 'Processing',
    Processing: 'Ready',
    Ready: 'Delivered',
    Delivered: null,
    Cancelled: null,
  };

  // Get customer job history
  const customerHistory = useMemo(() => {
    if (!ticket.customerId && !ticket.customerName) return [];
    return allTickets
      .filter(t => t.customerId === ticket.customerId || t.customerName === ticket.customerName)
      .filter(t => t.id !== ticket.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [allTickets, ticket.customerId, ticket.customerName, ticket.id]);

  // Get notification log
  const notificationLog = useMemo(() => {
    return jobTicketService.getNotificationLog(ticket.id);
  }, [ticket.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
          alert(`Invalid file type: ${file.name}. Allowed: PDF, JPG, PNG, DOC`);
          continue;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert(`File too large: ${file.name}. Max size: 10MB`);
          continue;
        }

        await jobTicketService.uploadFile(ticket.id, file);
      }
      // Refresh will happen through parent
      alert('Files uploaded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload files');
    }
    setIsUploading(false);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await jobTicketService.deleteFile(ticket.id, fileId);
      alert('File deleted');
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSendNotification = async (method: 'sms' | 'whatsapp' | 'email') => {
    if (!ticket.customerPhone && !ticket.customerEmail) {
      alert('No customer phone or email on file');
      return;
    }

    setIsSendingNotify(true);
    try {
      await jobTicketService.sendNotification(
        ticket.id,
        ticket.status === 'Ready' ? 'ready' : 'status_changed',
        method,
        ticket.customerPhone,
        ticket.customerEmail
      );
      alert(`Notification sent via ${method}!`);
    } catch (error: any) {
      console.error('Notification failed:', error);
      alert(error.message || 'Failed to send notification');
    }
    setIsSendingNotify(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const resolveAttachmentSource = (file: NonNullable<JobTicket['attachments']>[number]) => {
    const fileId = file.fileId || (isStoredFileIdentifier(file.url) ? file.url : undefined);
    const sourceUrl = fileId ? undefined : file.url;
    return { fileId, sourceUrl };
  };

  const handlePreviewFile = (file: NonNullable<JobTicket['attachments']>[number]) => {
    const { fileId, sourceUrl } = resolveAttachmentSource(file);

    openFilePreview({
      downloadUrl: sourceUrl,
      fileId,
      fileName: file.name,
      mimeType: file.type,
      publicUrl: sourceUrl,
      sourceUrl,
      title: file.name,
    });
  };

  const handleDownloadFile = async (file: NonNullable<JobTicket['attachments']>[number]) => {
    const { fileId, sourceUrl } = resolveAttachmentSource(file);
    let downloadUrl = sourceUrl || '';

    if (fileId) {
      const localUrl = await localFileStorage.getUrl(fileId);
      if (!localUrl) {
        alert('The file could not be found.');
        return;
      }
      downloadUrl = localUrl;
    }

    if (!downloadUrl) {
      alert('The file could not be found.');
      return;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (fileId) {
      window.setTimeout(() => {
        localFileStorage.revoke(downloadUrl);
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-[12px] flex justify-between items-center">
          <div>
            <h2 className="text-[20px] font-semibold text-slate-900 leading-tight">{ticket.ticketNumber}</h2>
            <p className="text-[13px] text-slate-500 font-medium">{ticket.customerName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex border-b border-slate-200 overflow-x-auto">
          {(['details', 'progress', 'files', 'notify', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-bold uppercase whitespace-nowrap ${
                activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'notify' ? 'Notify' : tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusConfig[ticket.status].color} flex items-center gap-1`}>
                  {statusConfig[ticket.status].icon}
                  {statusConfig[ticket.status].label}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${priorityConfig[ticket.priority].color}`}>{ticket.priority}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs font-bold text-slate-400 uppercase">Type</p><p className="font-medium">{typeConfig[ticket.type].label}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Quantity</p><p className="font-medium">{ticket.quantity}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Paper Size</p><p className="font-medium">{ticket.paperSize}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Color Mode</p><p className="font-medium">{ticket.colorMode === 'Color' ? 'Color' : 'Black & White'}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Date Received</p><p className="font-medium">{new Date(ticket.dateReceived).toLocaleDateString()}</p></div>
                {ticket.dueDate && <div><p className="text-xs font-bold text-slate-400 uppercase">Due Date</p><p className="font-medium">{new Date(ticket.dueDate).toLocaleDateString()} {ticket.dueTime && `at ${ticket.dueTime}`}</p></div>}
              </div>

              {ticket.description && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Description</p><p className="text-slate-700">{ticket.description}</p></div>}

              {Object.values(ticket.finishing).some(v => v) && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Finishing</p>
                  <div className="flex flex-wrap gap-2">
                    {ticket.finishing.staple && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Staple</span>}
                    {ticket.finishing.fold && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Fold</span>}
                    {ticket.finishing.collate && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Collate</span>}
                    {ticket.finishing.trim && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Trim</span>}
                    {ticket.finishing.punch && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Punch</span>}
                    {ticket.finishing.lamination && <span className="px-2 py-1 bg-slate-100 rounded text-xs">Lamination</span>}
                    {ticket.finishing.bindingType && ticket.finishing.bindingType !== 'None' && <span className="px-2 py-1 bg-slate-100 rounded text-xs">{ticket.finishing.bindingType}</span>}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between text-[13px] font-medium text-slate-600"><span>Unit Price</span><span className="tabular-nums">{currency}{ticket.unitPrice.toFixed(2)}</span></div>
                {ticket.rushFee > 0 && <div className="flex justify-between text-[13px] font-medium text-amber-600"><span>Rush Fee</span><span className="tabular-nums">+{currency}{ticket.rushFee.toFixed(2)}</span></div>}
                {ticket.finishingCost > 0 && <div className="flex justify-between text-[13px] font-medium text-slate-600"><span>Finishing</span><span className="tabular-nums">+{currency}{ticket.finishingCost.toFixed(2)}</span></div>}
                {ticket.discount > 0 && <div className="flex justify-between text-[13px] font-medium text-emerald-600"><span>Discount</span><span className="tabular-nums">-{currency}{ticket.discount.toFixed(2)}</span></div>}
                <div className="flex justify-between text-[13px] font-medium text-slate-600"><span>Tax</span><span className="tabular-nums">{currency}{ticket.tax.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-[18px] pt-3 border-t border-slate-200 text-slate-900"><span>Total</span><span className="tabular-nums text-blue-600">{currency}{ticket.total.toFixed(2)}</span></div>
              </div>

              {ticket.notes && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Notes</p><p className="text-slate-700">{ticket.notes}</p></div>}
            </div>
          )}

          {activeTab === 'progress' && (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2"><span className="font-bold">Job Progress</span><span className="font-bold">{ticket.progressPercent}%</span></div>
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${ticket.progressPercent}%` }} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase">Update Progress</p>
                <div className="flex gap-2">
                  {[0, 25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => onProgressChange(ticket.id, p)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${
                        ticket.progressPercent === p ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase">Update Status</p>
                {nextStatus[ticket.status] && (
                  <button
                    onClick={() => onStatusChange(ticket.id, nextStatus[ticket.status]!)}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <ArrowRight size={18} />
                    Mark as {statusConfig[nextStatus[ticket.status]!].label}
                  </button>
                )}
                {ticket.status !== 'Cancelled' && ticket.status !== 'Delivered' && (
                  <button onClick={() => onStatusChange(ticket.id, 'Cancelled')} className="w-full py-3 border border-red-200 text-red-600 rounded-lg font-bold hover:bg-red-50">Cancel Job</button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* Upload Area */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <Upload className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-600">Click to upload files</p>
                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, DOC (max 10MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {isUploading && (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-slate-500 mt-2">Uploading...</p>
                </div>
              )}

              {/* File List */}
              {ticket.attachments && ticket.attachments.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">Attached Files ({ticket.attachments.length})</p>
                  {ticket.attachments.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <FileIcon className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{file.name}</p>
                          <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePreviewFile(file)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded"
                          type="button"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownloadFile(file)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          type="button"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-4">No files attached</p>
              )}
            </div>
          )}

          {activeTab === 'notify' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-sm font-bold text-blue-800">Send Update to Customer</p>
                <p className="text-xs text-blue-600 mt-1">Notify the customer when job status changes</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase">Send via</p>

                <button
                  onClick={() => handleSendNotification('whatsapp')}
                  disabled={isSendingNotify || !ticket.customerPhone}
                  className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <MessageSquare size={18} />
                  WhatsApp {ticket.customerPhone ? '' : '(No Phone)'}
                </button>

                <button
                  onClick={() => handleSendNotification('sms')}
                  disabled={isSendingNotify || !ticket.customerPhone}
                  className="w-full py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Phone size={18} />
                  SMS {ticket.customerPhone ? '' : '(No Phone)'}
                </button>

                <button
                  onClick={() => handleSendNotification('email')}
                  disabled={isSendingNotify || !ticket.customerEmail}
                  className="w-full py-3 bg-slate-600 text-white rounded-lg font-bold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Mail size={18} />
                  Email {ticket.customerEmail ? '' : '(No Email)'}
                </button>
              </div>

              {isSendingNotify && (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-slate-500 mt-2">Sending...</p>
                </div>
              )}

              {/* Notification Log */}
              {notificationLog.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">Notification History</p>
                  {notificationLog.slice().reverse().map((notif) => (
                    <div key={notif.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-sm">
                      {notif.method === 'whatsapp' ? <MessageSquare size={14} className="text-emerald-500" /> :
                        notif.method === 'sms' ? <Phone size={14} className="text-blue-500" /> :
                        <Mail size={14} className="text-slate-500" />}
                      <span className="text-slate-600 flex-1">{notif.message}</span>
                      <span className="text-xs text-slate-400">{new Date(notif.sentAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Current Job Timeline */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase">This Job</p>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                  <div><p className="font-medium">Job Created</p><p className="text-xs text-slate-400">{new Date(ticket.createdAt).toLocaleString()}</p></div>
                </div>
                {ticket.completedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-emerald-500" />
                    <div><p className="font-medium">Completed</p><p className="text-xs text-slate-400">{new Date(ticket.completedAt).toLocaleString()}</p></div>
                  </div>
                )}
                {ticket.deliveredAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-slate-500" />
                    <div><p className="font-medium">Delivered</p><p className="text-xs text-slate-400">{new Date(ticket.deliveredAt).toLocaleString()}</p></div>
                  </div>
                )}
              </div>

              {/* Customer Job History */}
              {customerHistory.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase">Previous Jobs from {ticket.customerName}</p>
                  {customerHistory.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold">{job.ticketNumber}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusConfig[job.status].color}`}>
                            {job.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{typeConfig[job.type].label} - {job.quantity} copies</p>
                        <p className="text-xs text-slate-400">{new Date(job.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-700">{currency}{job.total.toFixed(2)}</p>
                        {onReorder && (
                          <button
                            onClick={() => onReorder(job)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Reorder
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customerHistory.length === 0 && (
                <p className="text-center text-slate-400 py-4">No previous jobs from this customer</p>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-3">
          <button onClick={onEdit} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 flex items-center justify-center gap-2"><Edit2 size={16} />Edit</button>
          <button onClick={onDelete} className="flex-1 py-2 border border-red-200 text-red-600 rounded-lg font-bold hover:bg-red-50 flex items-center justify-center gap-2"><Trash2 size={16} />Delete</button>
        </div>
      </div>
    </div>
  );
};

export default JobTickets;
