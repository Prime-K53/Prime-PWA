import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Filter, Download, Phone,
  MapPin, ChevronRight, User, Trash2, Edit, ExternalLink,
  DollarSign, Clock, CheckCircle, AlertCircle, TrendingUp, AlertTriangle, FileText, Target
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSales } from '../../context/SalesContext';
import { useData } from '../../context/DataContext';
import { useFinance } from '../../context/FinanceContext';
import { Customer, Invoice, CustomerPayment } from '../../types';
import { ClientModal } from './components/ClientModal';
import { CustomerWorkspace } from './components/CustomerWorkspace';
import { isAfter, parseISO, subDays, format } from 'date-fns';
import { exportToCSV } from '../../utils/helpers';

export const Clients: React.FC = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer, isLoading, customerPayments } = useSales();
  const { invoices } = useFinance();
  const { companyConfig } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || '$';

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>();
  const [selectedWorkspaceCustomer, setSelectedWorkspaceCustomer] = useState<Customer | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive' | 'Lead'>('All');
  const [selectedMetric, setSelectedMetric] = useState<'All' | 'Overdue' | 'Open' | 'Paid'>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Advanced Filters State
  const [balanceRange, setBalanceRange] = useState<string>('Any Balance');
  const [customerSegment, setCustomerSegment] = useState<string>('All Segments');
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>('All Stages');

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
    } else if (location.state?.customerId) {
      const customer = customers.find(c => c.id === location.state.customerId);
      if (customer) {
        setSelectedWorkspaceCustomer(customer);
      }
      // Clear state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, customers]);

  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery));
      const matchesStatus = filterStatus === 'All' || c.status === filterStatus;

      const matchesSegment = customerSegment === 'All Segments' || c.segment === customerSegment;
      const matchesPipelineStage = pipelineStageFilter === 'All Stages' || (c as any).pipelineStage === pipelineStageFilter;

      let matchesBalance = true;
      const balance = c.balance || 0;
      if (balanceRange === 'Over $1,000') matchesBalance = balance > 1000;
      else if (balanceRange === 'Over $5,000') matchesBalance = balance > 5000;
      else if (balanceRange === 'Over $10,000') matchesBalance = balance > 10000;
      else if (balanceRange === 'Negative (Credit)') matchesBalance = balance < 0;

      let matchesMetric = true;
      if (selectedMetric === 'Overdue') {
        const hasOverdue = invoices.some(inv =>
          inv.customerId === c.id &&
          inv.status !== 'Paid' &&
          inv.status !== 'Cancelled' &&
          isAfter(new Date(), parseISO(inv.dueDate))
        );
        matchesMetric = hasOverdue;
      } else if (selectedMetric === 'Open') {
        const hasOpen = invoices.some(inv =>
          inv.customerId === c.id &&
          (inv.status === 'Unpaid' || inv.status === 'Partial')
        );
        matchesMetric = hasOpen;
      } else if (selectedMetric === 'Paid') {
        const hasRecentPayment = customerPayments.some(r =>
          r.customerId === c.id &&
          r.status === 'Cleared' &&
          isAfter(parseISO(r.date), subDays(new Date(), 30))
        );
        matchesMetric = hasRecentPayment;
      }

      return matchesSearch && matchesStatus && matchesMetric && matchesSegment && matchesBalance && matchesPipelineStage;
    });
  }, [customers, searchQuery, filterStatus, selectedMetric, invoices, customerPayments, balanceRange, customerSegment, pipelineStageFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    const totalBalance = customers.reduce((sum, c) => sum + (c.balance || 0), 0);

    // Calculate Overdue
    const overdueBalance = invoices
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled' && isAfter(today, parseISO(inv.dueDate)))
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    // Calculate Open Invoices
    const openInvoicesTotal = invoices
      .filter(inv => inv.status === 'Unpaid' || inv.status === 'Partial')
      .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);

    // Calculate Paid in last 30 days
    const paidLast30Days = customerPayments
      .filter(r => r.status === 'Cleared' && isAfter(parseISO(r.date), thirtyDaysAgo))
      .reduce((sum, r) => sum + r.amount, 0);

    const activeCount = customers.filter(c => c.status === 'Active').length;

    return {
      totalBalance,
      overdueBalance,
      openInvoicesTotal,
      paidLast30Days,
      activeCount
    };
  }, [customers, invoices, customerPayments]);

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setSelectedCustomer(undefined);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      await deleteCustomer(id);
    }
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} clients?`)) {
      for (const id of selectedIds) {
        await deleteCustomer(id);
      }
      setSelectedIds([]);
    }
  };

  const handleBatchStatusUpdate = async (status: 'Active' | 'Inactive') => {
    for (const id of selectedIds) {
      const customer = customers.find(c => c.id === id);
      if (customer) {
        await updateCustomer({ ...customer, status });
      }
    }
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCustomers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCustomers.map(c => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRowMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveMenuId(prev => (prev === id ? null : id));
  };

  if (selectedWorkspaceCustomer) {
    return (
      <>
        <CustomerWorkspace
          customer={selectedWorkspaceCustomer}
          onBack={() => setSelectedWorkspaceCustomer(null)}
          onEdit={(customer) => {
            setSelectedCustomer(customer);
            setIsModalOpen(true);
          }}
        />

        <ClientModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={selectedCustomer ? updateCustomer : addCustomer}
          customer={selectedCustomer}
        />
      </>
    );
  }

  const getLastTransaction = (customerId: string) => {
    const customerInvoices = invoices.filter(inv => inv.customerName === customers.find(c => c.id === customerId)?.name);
    if (customerInvoices.length === 0) return 'No transactions';

    const latest = customerInvoices.reduce((prev, current) =>
      isAfter(parseISO(current.date), parseISO(prev.date)) ? current : prev
    );

    return `${format(parseISO(latest.date), 'MMM dd, yyyy')} (${latest.id})`;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-50/50 min-h-screen font-sans text-[13px] leading-[1.45]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Clients</h1>
          <p className="text-slate-500 text-[13px] font-medium">Manage your client relationships and balances</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/sales-flow/leads')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-cyan-200 rounded-lg text-cyan-700 font-semibold hover:bg-cyan-50 transition-all shadow-sm text-[13px]"
          >
            <Target size={16} />
            Lead Board
          </button>
          <button
            onClick={() => exportToCSV('Clients', customers)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-all shadow-sm text-[13px]"
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 text-[13px]"
          >
            <Plus size={18} />
            New Client
          </button>
        </div>
      </div>

      {/* Money Bar (QBO Style) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          onClick={() => setSelectedMetric(selectedMetric === 'Overdue' ? 'All' : 'Overdue')}
          className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-rose-500 ${selectedMetric === 'Overdue' ? 'ring-2 ring-rose-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
        >
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Overdue</p>
            <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{(stats.overdueBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Open Invoices</p>
            <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{(stats.openInvoicesTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Paid (30d)</p>
            <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{(stats.paidLast30Days || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div
          onClick={() => setSelectedMetric('All')}
          className={`cursor-pointer transition-all duration-200 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-blue-500 ${selectedMetric === 'All' ? 'ring-2 ring-blue-500 shadow-md scale-[1.01]' : 'hover:bg-slate-50'}`}
        >
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <User size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Total Balance</p>
            <p className="text-lg md:text-xl font-semibold text-slate-900 finance-nums">{currency}{(stats.totalBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
                placeholder="Search by name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-[13px] placeholder:text-slate-400"
              />
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <span className="text-[13px] font-semibold text-blue-600 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-100">
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
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[12.5px] font-semibold text-slate-700 outline-none hover:border-blue-400 transition-all cursor-pointer"
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
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Lead">Lead</option>
              <option value="Suspended">Suspended</option>
              <option value="VIP">VIP</option>
              <option value="Prospect">Prospect</option>
              <option value="Credit Hold">Credit Hold</option>
            </select>
            <select
              value={pipelineStageFilter}
              onChange={(e) => setPipelineStageFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value="All Stages">All Stages</option>
              <option value="New">New</option>
              <option value="Qualified">Qualified</option>
              <option value="Proposal">Proposal</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
            <div className="relative group">
              <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                <Filter size={18} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-3 px-4 z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-top-right">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Advanced Filters</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Balance Range</label>
                    <select
                      value={balanceRange}
                      onChange={(e) => setBalanceRange(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-[12px] outline-none"
                    >
                      <option value="Any Balance">Any Balance</option>
                      <option value="Over $1,000">Over $1,000</option>
                      <option value="Over $5,000">Over $5,000</option>
                      <option value="Over $10,000">Over $10,000</option>
                      <option value="Negative (Credit)">Negative (Credit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Customer Segment</label>
                    <select
                      value={customerSegment}
                      onChange={(e) => setCustomerSegment(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-[12px] outline-none"
                    >
                      <option value="All Segments">All Segments</option>
                      <option value="Individual">Individual</option>
                      <option value="School Account">School Account</option>
                      <option value="Institution">Institution</option>
                      <option value="Government">Government</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      // Filters are applied automatically due to useMemo
                      // We can add a "Clear Filters" button instead or just let it be
                      setBalanceRange('Any Balance');
                      setCustomerSegment('All Segments');
                    }}
                    className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-[11px] mt-2 hover:bg-slate-200 transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50/80 backdrop-blur text-slate-500 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="table-header w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="table-header">Client / Company</th>
                  <th className="table-header">Contact Info</th>
                  <th className="table-header">Last Transaction</th>
                  <th className="table-header text-right">Wallet</th>
                  <th className="table-header text-right">Open Balance</th>
                  <th className="table-header text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 italic text-[13px]">Loading clients...</td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 italic text-[13px]">No clients found matching your criteria.</td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <React.Fragment key={customer.id}>
                      <tr
                        onClick={(e) => handleRowMenuClick(e, customer.id)}
                        className={`hover:bg-blue-50/50 transition-colors group cursor-pointer ${selectedIds.includes(customer.id) ? 'bg-blue-50/30' : ''} ${expandedClientId === customer.id ? 'bg-slate-50' : ''}`}
                      >
                      <td className="table-body-cell">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="table-body-cell">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedClientId(expandedClientId === customer.id ? null : customer.id);
                            }}
                            className={`p-1 rounded-md transition-colors ${expandedClientId === customer.id ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
                          >
                            <ChevronRight size={14} className={`transition-transform duration-200 ${expandedClientId === customer.id ? 'rotate-90' : ''}`} />
                          </button>
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-semibold text-[10px] border border-blue-100 shrink-0">
                            {customer.name.charAt(0)}
                          </div>
                          <div
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWorkspaceCustomer(customer);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 text-[13px]">{customer.name}</p>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${customer.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  customer.status === 'Lead' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                    customer.status === 'Suspended' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                      customer.status === 'VIP' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                        customer.status === 'Prospect' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                          customer.status === 'Credit Hold' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                            'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                {customer.status}
                              </span>
                              {customer.creditHold && (
                                <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-slate-500 font-bold tracking-tight uppercase hover:text-blue-600 transition-colors">ID: {customer.id}</p>
                              {(customer as any).pipelineStage && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight border border-blue-100">
                                  {(customer as any).pipelineStage}
                                </span>
                              )}
                              {(customer as any).leadSource && (
                                <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold tracking-tight border border-amber-100">
                                  {(customer as any).leadSource}
                                </span>
                              )}
                              {customer.subAccounts && customer.subAccounts.length > 0 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                                  {customer.subAccounts.length} Sub-accounts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="table-body-cell">
                        <div className="flex items-center gap-2 text-slate-700 text-[13px] font-medium">
                          <Phone size={13} className="text-slate-400" />
                          {customer.phone || 'No phone'}
                        </div>
                      </td>
                      <td className="table-body-cell">
                        <p className="text-[13px] text-slate-700 font-medium finance-nums">{getLastTransaction(customer.id)}</p>
                      </td>
                      <td className="table-body-cell text-right whitespace-nowrap">
                        <p className={`font-semibold text-[13px] text-emerald-700 finance-nums`}>
                          {currency}{(customer.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </td>
                      <td className="table-body-cell text-right whitespace-nowrap">
                        <p className={`font-semibold text-[13px] finance-nums ${(customer.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {currency}{(customer.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </td>
                      <td className="table-body-cell">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(customer);
                            }}
                            className="px-2.5 py-1 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded font-bold text-[10px] uppercase tracking-tight transition-all"
                          >
                            Edit
                          </button>
                          <div className="relative">
                            {activeMenuId === customer.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-100 py-1.5 z-10 animate-in fade-in zoom-in-95 origin-top-right"
                              >
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    navigate('/sales-flow/invoices', { state: { action: 'create', customer: customer.name } });
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <ExternalLink size={14} className="text-slate-400" />
                                  Create Invoice
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    navigate('/sales-flow/payments', { state: { action: 'create', customer: customer.name, isTopUp: true } });
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <DollarSign size={14} className="text-slate-400" />
                                  Add Prepayment
                                </button>
                                <button
                                  onClick={() => {
                                    // Generate account statement report
                                    setActiveMenuId(null);
                                    navigate('/revenue/contacts', { state: { customerId: customer.id } });
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <FileText size={14} className="text-slate-400" />
                                  Account Statement
                                </button>
                                <div className="h-px bg-slate-100 my-1" />
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    handleDelete(customer.id);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                >
                                  <Trash2 size={14} />
                                  Delete Client
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      </tr>
                      {expandedClientId === customer.id && customer.subAccounts && customer.subAccounts.length > 0 && (
                        <tr className="bg-slate-50/50 border-b border-slate-100 animate-in slide-in-from-top-2 duration-200">
                          <td className="px-6 py-2"></td>
                          <td colSpan={6} className="px-6 py-4">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Sub Accounts</h4>
                            </div>
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/30">
                                  <th className="table-header">Name</th>
                                  <th className="table-header text-right">Wallet</th>
                                  <th className="table-header text-right">Balance</th>
                                  <th className="table-header text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {customer.subAccounts.map((sub) => (
                                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="table-body-cell font-semibold text-slate-900">{sub.name}</td>
                                    <td className="table-body-cell text-right text-emerald-700 font-semibold finance-nums">
                                      {currency}{(sub.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="table-body-cell text-right text-rose-600 font-semibold finance-nums">
                                      {currency}{(sub.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="table-body-cell text-center">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${sub.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}>
                                        {sub.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={selectedCustomer ? updateCustomer : addCustomer}
        customer={selectedCustomer}
      />
    </div>
  );
};

export default Clients;
