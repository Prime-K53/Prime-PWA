import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Filter, Download, MoreHorizontal, Phone, 
  MapPin, ChevronRight, Truck, Trash2, Edit, ExternalLink,
  DollarSign, Clock, CheckCircle, AlertCircle, Building2, AlertTriangle
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProcurement } from '../../context/ProcurementContext';
import { useData } from '../../context/DataContext';
import { Supplier, Purchase } from '../../types';
import { SupplierModal } from './components/SupplierModal';
import { SupplierWorkspace } from './components/SupplierWorkspace';
import { isAfter, parseISO, subDays, format } from 'date-fns';
import { exportToCSV } from '../../utils/helpers';
import { useFinance } from '../../context/FinanceContext';

const Suppliers: React.FC = () => {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, isLoading, purchases } = useProcurement();
  const { supplierPayments = [] } = useFinance();
  const { companyConfig } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || '$';

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | undefined>();
  const [selectedWorkspaceSupplier, setSelectedWorkspaceSupplier] = useState<Supplier | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [selectedMetric, setSelectedMetric] = useState<'All' | 'Overdue' | 'Open' | 'Paid'>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
      const handleClickOutside = () => setActiveMenuId(null);
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
      if (location.state?.action === 'create') {
        handleAddNew();
        // Clear state to prevent reopening on refresh
        window.history.replaceState({}, document.title);
      }
    }, [location.state]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const name = s.name || '';
      const email = s.email || '';
      const phone = s.phone || '';
      
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          phone.includes(searchQuery);
      const matchesStatus = filterStatus === 'All' || s.status === filterStatus;
      
      let matchesMetric = true;
      if (selectedMetric === 'Overdue') {
        const hasOverdue = (purchases || []).some(p => 
          p.supplierName === s.name && 
          p.paymentStatus !== 'Paid' && 
          p.paymentStatus !== 'Cancelled' && 
          p.dueDate && isAfter(new Date(), parseISO(p.dueDate))
        );
        matchesMetric = hasOverdue;
      } else if (selectedMetric === 'Open') {
        const hasOpen = (purchases || []).some(p => 
          p.supplierName === s.name && 
          (p.paymentStatus === 'Unpaid' || p.paymentStatus === 'Partial')
        );
        matchesMetric = hasOpen;
      } else if (selectedMetric === 'Paid') {
        const hasPaid = supplierPayments.some(p => p.supplierId === s.id);
        matchesMetric = hasPaid;
      }

      return matchesSearch && matchesStatus && matchesMetric;
    });
  }, [suppliers, searchQuery, filterStatus, selectedMetric, purchases, supplierPayments]);

  const stats = useMemo(() => {
    const getNumber = (value: any, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    const totalBalance = suppliers.reduce((sum, s) => sum + getNumber(s.balance), 0);
    
    // Calculate Overdue Purchases
    const overduePayables = (purchases || [])
      .filter(p => p.paymentStatus !== 'Paid' && p.paymentStatus !== 'Cancelled' && p.dueDate && isAfter(today, parseISO(p.dueDate)))
      .reduce((sum, p) => sum + (getNumber(p.total) - getNumber(p.paidAmount)), 0);

    // Calculate Open Bills
    const openBillsTotal = (purchases || [])
      .filter(p => p.paymentStatus === 'Unpaid' || p.paymentStatus === 'Partial')
      .reduce((sum, p) => sum + (getNumber(p.total) - getNumber(p.paidAmount)), 0);

    // Calculate Paid in Last 30 Days
    const paidLast30Days = supplierPayments
      .filter(p => isAfter(parseISO(p.date), thirtyDaysAgo))
      .reduce((sum, p) => sum + getNumber(p.amount), 0);

    const activeCount = suppliers.filter(s => s.status === 'Active').length;

    return { 
      totalBalance, 
      overduePayables, 
      openBillsTotal, 
      paidLast30Days,
      activeCount 
    };
  }, [suppliers, purchases, supplierPayments]);

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setSelectedSupplier(undefined);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this supplier?')) {
      await deleteSupplier(id);
    }
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} suppliers?`)) {
      for (const id of selectedIds) {
        await deleteSupplier(id);
      }
      setSelectedIds([]);
    }
  };

  const handleBatchStatusUpdate = async (status: 'Active' | 'Inactive') => {
    for (const id of selectedIds) {
      const supplier = suppliers.find(s => s.id === id);
      if (supplier) {
        await updateSupplier({ ...supplier, status });
      }
    }
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSuppliers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSuppliers.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getLastTransaction = (supplierId: string) => {
    const supplierPurchases = (purchases || []).filter(p => p.supplierName === suppliers.find(s => s.id === supplierId)?.name);
    if (supplierPurchases.length === 0) return 'No transactions';
    
    const latest = supplierPurchases.reduce((prev, current) => 
      isAfter(parseISO(current.date), parseISO(prev.date)) ? current : prev
    );
    
    return `${format(parseISO(latest.date), 'MMM dd, yyyy')} (${latest.id})`;
  };

  if (selectedWorkspaceSupplier) {
    return (
      <SupplierWorkspace 
        supplier={selectedWorkspaceSupplier} 
        onBack={() => setSelectedWorkspaceSupplier(null)}
        onEdit={(supplier) => {
          setSelectedSupplier(supplier);
          setIsModalOpen(true);
        }}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-50/50 min-h-screen font-sans text-[13px] leading-[1.45]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Suppliers</h1>
          <p className="text-slate-500 text-[13px] font-medium">Manage your vendors and procurement relationships</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => exportToCSV('Suppliers', suppliers)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-all shadow-sm text-[13px]"
          >
            <Download size={16} />
            Export
          </button>
          <button 
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-[13px]"
          >
            <Plus size={18} />
            New Supplier
          </button>
        </div>
      </div>

      {/* Money Bar (QBO Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => setSelectedMetric(selectedMetric === 'Overdue' ? 'All' : 'Overdue')}
          className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-rose-500 ${selectedMetric === 'Overdue' ? 'ring-2 ring-rose-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
        >
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Overdue</p>
            <p className="text-[24px] font-bold text-slate-900 finance-nums">{currency}{(stats.overduePayables || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div 
          onClick={() => setSelectedMetric(selectedMetric === 'Open' ? 'All' : 'Open')}
          className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-amber-500 ${selectedMetric === 'Open' ? 'ring-2 ring-amber-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
        >
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Open Bills</p>
            <p className="text-[24px] font-bold text-slate-900 finance-nums">{currency}{(stats.openBillsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div 
          onClick={() => setSelectedMetric(selectedMetric === 'Paid' ? 'All' : 'Paid')}
          className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-emerald-500 ${selectedMetric === 'Paid' ? 'ring-2 ring-emerald-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
        >
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Paid (30 Days)</p>
            <p className="text-[24px] font-bold text-slate-900 finance-nums">{currency}{(stats.paidLast30Days || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Filters & Search */}
        <div className="p-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search by supplier name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-[13px] placeholder:text-slate-400"
              />
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <span className="text-[13px] font-semibold text-indigo-600 px-2.5 py-1 bg-indigo-50 rounded-lg border border-indigo-100">
                  {selectedIds.length} Selected
                </span>
                <div className="h-5 w-px bg-slate-200 mx-1" />
                <select
                  onChange={(e) => {
                    if (e.target.value === 'delete') handleBatchDelete();
                    else if (e.target.value === 'active') handleBatchStatusUpdate('Active');
                    else if (e.target.value === 'inactive') handleBatchStatusUpdate('Inactive');
                    e.target.value = '';
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 outline-none hover:border-indigo-400 transition-all cursor-pointer"
                >
                  <option value="">Batch Actions</option>
                  <option value="active">Make Active</option>
                  <option value="inactive">Make Inactive</option>
                  <option value="delete">Delete Selected</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
              <Filter size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="table-header px-4 py-2.5 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.length === filteredSuppliers.length && filteredSuppliers.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="table-header px-4 py-2.5">Supplier Name</th>
                <th className="table-header px-4 py-2.5">Contact Details</th>
                <th className="table-header px-4 py-2.5">Last Transaction</th>
                <th className="table-header px-4 py-2.5 text-right">Balance Due</th>
                <th className="table-header px-4 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="table-body-cell px-4 py-10 text-center text-slate-400 italic">Loading suppliers...</td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-body-cell px-4 py-10 text-center text-slate-400 italic">No suppliers found matching your criteria.</td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr 
                    key={supplier.id} 
                    onClick={() => setSelectedWorkspaceSupplier(supplier)}
                    className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${selectedIds.includes(supplier.id) ? 'bg-indigo-50/30' : ''}`}
                  >
                    <td className="table-body-cell px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(supplier.id)}
                        onChange={() => toggleSelect(supplier.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="table-body-cell px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-semibold text-xs border border-indigo-100">
                          {supplier.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 text-[13px]">{supplier.name}</p>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-tight ${
                              supplier.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {supplier.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-bold tracking-tight uppercase">ID: {supplier.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-body-cell px-4 py-2.5">
                      <div className="flex items-center gap-2 text-slate-700 text-[13px] font-bold">
                        <Phone size={13} className="text-slate-400" />
                        {supplier.phone || 'No phone'}
                      </div>
                    </td>
                    <td className="table-body-cell px-4 py-2.5">
                      <p className="text-[13px] text-slate-700 font-bold finance-nums">{getLastTransaction(supplier.id)}</p>
                    </td>
                    <td className="table-body-cell px-4 py-2.5 text-right whitespace-nowrap">
                      <p className={`font-bold text-[13px] finance-nums ${(supplier.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {currency}{(supplier.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </td>
                    <td className="table-body-cell px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleEdit(supplier)}
                          className="px-2.5 py-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded font-semibold text-[12.5px] transition-all"
                        >
                          Edit
                        </button>
                        <div className="relative">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === supplier.id ? null : supplier.id);
                            }}
                            className={`p-1.5 rounded-lg transition-all ${
                              activeMenuId === supplier.id 
                                ? 'text-indigo-600 bg-indigo-50' 
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {activeMenuId === supplier.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-100 py-1.5 z-10 animate-in fade-in zoom-in-95 origin-top-right">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate('/procurement/bills', { state: { action: 'create', supplierId: supplier.id } });
                                }}
                                className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <ExternalLink size={14} className="text-slate-400" />
                                Create Bill
                              </button>
                              <div className="h-px bg-slate-100 my-1" />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(supplier.id);
                                }}
                                className="w-full text-left px-3 py-1.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                              >
                                <Trash2 size={14} />
                                Delete Supplier
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={selectedSupplier ? updateSupplier : addSupplier}
        supplier={selectedSupplier}
      />
    </div>
  );
};

export default Suppliers;
