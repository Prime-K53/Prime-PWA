import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, RefreshCw, FileText
} from 'lucide-react';
import { useSalesStore } from '../../stores/salesStore';
import { SalesExchange } from '../../types';
import { ExchangeRequestModal } from './components/ExchangeRequestModal';
import { ExchangeDetailsModal } from './components/ExchangeDetailsModal';
import { SalesExchangeList } from './components/SalesLists';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { useData } from '../../context/DataContext';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog';

const SalesExchanges: React.FC = () => {
  const { 
    salesExchanges, reprintJobs, fetchExchanges, isLoading, 
    deleteSalesExchange, approveSalesExchange, cancelSalesExchange,
    bulkCancelSalesExchanges 
  } = useSalesStore();
  const { notify } = useData();
  const { handlePreview } = useDocumentPreview();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<SalesExchange | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    intent: 'danger' | 'primary';
    onConfirm: null | (() => Promise<void>);
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    intent: 'primary',
    onConfirm: null
  });

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  const filteredExchanges = salesExchanges.filter(ex => {
    const matchesSearch = 
      ex.exchange_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.invoice_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || ex.status.toLowerCase() === statusFilter.toLowerCase();
    
    return matchesSearch && matchesStatus;
  });

  const handleBulkCancel = async () => {
    setConfirmState({
      open: true,
      title: 'Cancel Selected Exchange Requests',
      message: `Cancel ${selectedIds.length} selected exchange request(s)?`,
      confirmLabel: 'Cancel Requests',
      intent: 'danger',
      onConfirm: async () => {
        await bulkCancelSalesExchanges(selectedIds);
        setSelectedIds([]);
      }
    });
  };

  const handleAction = async (item: SalesExchange, action: string) => {
    if (action === 'print_note' || action === 'download_pdf') {
      handlePreview('SALES_EXCHANGE', item);
    } else if (action === 'email_note') {
      // Logic to open email modal if integrated here, 
      // otherwise handled by the shared component pattern
      notify("Email feature for exchanges is managed via the main Sales Dashboard", "info");
    } else if (action === 'approve_exchange') {
      setConfirmState({
        open: true,
        title: 'Approve Exchange Request',
        message: 'Approve this exchange request and authorize replacement/reprint?',
        confirmLabel: 'Approve',
        intent: 'primary',
        onConfirm: async () => {
          await approveSalesExchange(item.id as any, "Approved from exchanges view");
        }
      });
    } else if (action === 'cancel_exchange') {
      setConfirmState({
        open: true,
        title: 'Cancel Exchange Request',
        message: 'Cancel this exchange request and void it?',
        confirmLabel: 'Cancel Request',
        intent: 'danger',
        onConfirm: async () => {
          await cancelSalesExchange(item.id as any);
        }
      });
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sales Exchanges</h1>
          <p className="text-sm text-gray-500">Manage print job replacements and reprints</p>
        </div>
        <button
          onClick={() => setIsRequestModalOpen(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-bold text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Exchange Request
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Exchanges</div>
          <div className="text-2xl font-black text-gray-900">{salesExchanges.length}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold text-yellow-600 uppercase tracking-wider mb-1">Pending Approval</div>
          <div className="text-2xl font-black text-yellow-700">
            {salesExchanges.filter(e => e.status.toLowerCase() === 'pending').length}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Active Reprints</div>
          <div className="text-2xl font-black text-blue-700">
            {reprintJobs.filter(j => j.status !== 'completed').length}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Completed</div>
          <div className="text-2xl font-black text-green-700">
            {salesExchanges.filter(e => e.status.toLowerCase() === 'completed').length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
        {selectedIds.length > 0 ? (
          <div className="p-4 bg-indigo-600 text-white flex justify-between items-center animate-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-4">
              <span className="font-bold text-sm">{selectedIds.length} items selected</span>
              <button 
                onClick={() => setSelectedIds([])}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors font-bold uppercase tracking-wider"
              >
                Clear Selection
              </button>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={handleBulkCancel}
                className="px-4 py-1.5 bg-rose-500 hover:bg-rose-600 rounded-lg text-xs font-bold transition-colors shadow-sm uppercase tracking-wider"
              >
                Cancel Selected
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4 bg-gray-50/50">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by SE#, Customer or Invoice..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="text-gray-400 w-4 h-4" />
              <select
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-500/5"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <button 
              onClick={() => fetchExchanges()}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <SalesExchangeList 
            data={filteredExchanges}
            viewMode="List"
            onView={(ex) => setSelectedExchange(ex)}
            onEdit={() => {}} // No edit for exchanges per policy
            onDelete={(id) => {
              setConfirmState({
                open: true,
                title: 'Mark Exchange as Deleted',
                message: 'Mark this exchange record as deleted? Physical deletion remains restricted for audit compliance.',
                confirmLabel: 'Mark Deleted',
                intent: 'danger',
                onConfirm: async () => {
                  await deleteSalesExchange(id);
                }
              });
            }}
            onAction={handleAction}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <Dialog open={confirmState.open} onOpenChange={(open) => setConfirmState(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{confirmState.title}</DialogTitle>
          </DialogHeader>
          <div className="px-8 py-6 text-sm text-slate-600">{confirmState.message}</div>
          <DialogFooter>
            <button
              onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}
              className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  await confirmState.onConfirm?.();
                  setConfirmState(prev => ({ ...prev, open: false }));
                } catch (error: any) {
                  notify(error?.message || 'Operation failed', 'error');
                }
              }}
              className={`px-4 py-2 text-white rounded-lg font-semibold transition-colors ${confirmState.intent === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {confirmState.confirmLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isRequestModalOpen && (
        <ExchangeRequestModal 
          onClose={() => setIsRequestModalOpen(false)} 
        />
      )}

      {selectedExchange && (
        <ExchangeDetailsModal
          exchange={selectedExchange}
          onClose={() => setSelectedExchange(null)}
        />
      )}
    </div>
  );
};

export default SalesExchanges;
