import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/Dialog';
import { ArrowLeft, Save, Plus, Search, Building2, ChevronDown, X, Users } from 'lucide-react';
import { Customer } from '../../types';
import { dbService } from '../../services/db';
import { toast } from '../../components/Toast';
import { getPlaceholder } from '../../constants/placeholders';
import { format, addDays } from 'date-fns';

const ExaminationBatchForm: React.FC = () => {
  const navigate = useNavigate();
  const { createBatch, loadAllData, customers, loading: contextLoading } = useExamination();
  const { companyConfig = { currencySymbol: 'MWK', pricingSettings: { defaultMethod: 'ALWAYS_UP_50', customStep: 50 } } as any, addAuditLog } = useAuth();
  const { accounts = [] } = useFinance() as any;
  const [loading, setLoading] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultValidUntil = format(addDays(new Date(), 30), 'yyyy-MM-dd');
  const [formData, setFormData] = useState({
    school_id: '',
    academic_year: new Date().getFullYear().toString(),
    term: '1',
    exam_type: 'Mid-Term',
    batch_date: today,
    valid_until: defaultValidUntil,
    sales_account_id: '',
    sub_account_name: ''
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: ''
  });
  const [addingCustomer, setAddingCustomer] = useState(false);
  useEffect(() => {
    if (companyConfig?.currencySymbol) {
      setFormData((prev) => ({ ...prev, currency: companyConfig.currencySymbol }));
    }
  }, [companyConfig?.currencySymbol]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const sortedCustomers = React.useMemo(() => {
    if (!customers || customers.length === 0) {
      return [];
    }
    return [...customers].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [customers]);

  const selectedCustomerFull = React.useMemo(() => {
    if (!formData.school_id) return null;
    return customers.find((customer) => String(customer.id) === String(formData.school_id));
  }, [customers, formData.school_id]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return sortedCustomers;
    const q = customerSearch.toLowerCase();
    return sortedCustomers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [sortedCustomers, customerSearch]);

  const handleAddNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;

    setAddingCustomer(true);
    try {
      const customerId = `CUS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const customer: Customer = {
        id: customerId,
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim() || '',
        phone: newCustomer.phone.trim() || '',
        address: newCustomer.address.trim() || '',
        city: newCustomer.city.trim() || '',
        balance: 0,
        walletBalance: 0,
        creditLimit: 0,
        status: 'Active',
        category: 'School',
        segment: 'School Account',
        paymentTerms: 'Net 365'
      };

      await dbService.put('customers', customer);

      if (addAuditLog) {
        addAuditLog({
          action: 'CREATE',
          entityType: 'Customer',
          entityId: customerId,
          details: `Created new customer: ${customer.name}`,
          newValue: customer
        });
      }

      await loadAllData();
      setFormData((prev) => ({ ...prev, school_id: customer.id, sub_account_name: '' }));
      setNewCustomer({ name: '', email: '', phone: '', address: '', city: '' });
      setShowAddCustomer(false);
    } catch (error) {
      console.error('Failed to add customer:', error);
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const schoolId = String(formData.school_id ?? '').trim();
    const academicYear = String(formData.academic_year ?? '').trim();

    if (!schoolId) {
      if (contextLoading && sortedCustomers.length === 0) {
        toast.info('Customers are still loading. Please wait a moment and try again.');
        return;
      }
      toast.error('Please select a school from the dropdown');
      return;
    }
    if (!academicYear) {
      toast.error('Please enter an academic year');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        school_id: schoolId,
        academic_year: academicYear,
        sub_account_name: formData.sub_account_name.trim(),
        rounding_method: companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50',
        rounding_value: Number(companyConfig?.pricingSettings?.customStep || 50)
      };

      const newBatch = await createBatch(payload);
      toast.success('Examination batch created successfully');
      const batchRef = String(newBatch.batch_number || newBatch.batchNumber || newBatch.id || '').trim();
      navigate(`/examination/batches/${newBatch.id}`, { state: { name: batchRef } });
    } catch (error: any) {
      console.error('Failed to create batch:', error);
      const errorMessage = error?.message || 'Failed to create examination batch. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto w-full font-normal overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Create Examination Batch</h1>
          <p className="text-xs text-slate-500 mt-0.5">Set school, term, exam type, and billing profile</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/examination/batches')}
          className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-medium hover:bg-slate-100 text-sm shadow-sm transition-all border border-slate-200"
        >
          <ArrowLeft size={16} />
          Back to Batches
        </button>
      </div>

      <div className="bg-white/70 backdrop-blur-xl p-5 md:p-6 rounded-2xl border border-white/60 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">Batch Details</h2>
          <p className="text-xs text-slate-500 mt-1">Create a new examination batch and assign it to a school account.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <div className="flex items-center justify-between mb-1.5">
                 <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">School / Client</label>
                 <button
                   type="button"
                   onClick={() => setShowAddCustomer(true)}
                   className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                 >
                   <Plus size={12} />
                   Add New
                 </button>
               </div>
                <div className="relative" ref={customerRef}>
                  <div
                    className={`flex items-center gap-2 w-full rounded-xl border bg-white px-3 py-2 text-sm cursor-text outline-none transition-all ${
                      showCustomerDropdown ? 'ring-2 ring-blue-100 border-blue-300' : 'border-slate-200'
                    }`}
                    onClick={() => { customerInputRef.current?.focus(); setShowCustomerDropdown(true); }}
                  >
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                      ref={customerInputRef}
                      type="text"
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder={
                        contextLoading && sortedCustomers.length === 0
                          ? 'Loading customers...'
                          : formData.school_id && !showCustomerDropdown
                            ? selectedCustomerFull?.name || 'Search customers...'
                            : 'Search customers...'
                      }
                      className="flex-1 outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400"
                    />
                    {formData.school_id && !showCustomerDropdown ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleChange('school_id', ''); setCustomerSearch(''); }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <ChevronDown size={14} className="text-slate-400" />
                    )}
                  </div>

                  {showCustomerDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400 text-center">
                          {customerSearch.trim() ? 'No customers found' : 'No customers available'}
                        </div>
                      ) : (
                        filteredCustomers.map((customer) => {
                          const isSelected = String(customer.id) === String(formData.school_id);
                          const hasSubAccounts = customer.subAccounts && customer.subAccounts.length > 0;
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                              onClick={() => {
                                handleChange('school_id', customer.id);
                                handleChange('sub_account_name', '');
                                setCustomerSearch('');
                                setShowCustomerDropdown(false);
                              }}
                            >
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                <Building2 size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{customer.name}</span>
                                  {hasSubAccounts && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold shrink-0">
                                      <Users size={10} />
                                      {customer.subAccounts.length}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {customer.email || customer.phone || 'No contact info'}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
             </div>
 
             {selectedCustomerFull && selectedCustomerFull.subAccounts && selectedCustomerFull.subAccounts.length > 0 ? (
               <div>
                 <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                   Sub Account
                 </label>
                 <select
                   value={formData.sub_account_name}
                   onChange={(event) => handleChange('sub_account_name', event.target.value)}
                   className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                 >
                   <option value="">Select sub-account (or leave for main account)</option>
                   {selectedCustomerFull.subAccounts.map((sub: any) => (
                     <option key={sub.id} value={sub.name}>
                       {sub.name}
                     </option>
                   ))}
                 </select>
               </div>
             ) : (
               <div>
                 <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Creation Date</label>
                 <input
                   type="date"
                   value={formData.batch_date}
                   onChange={(event) => handleChange('batch_date', event.target.value)}
                   required
                   className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                 />
               </div>
             )}
 
             <div>
               <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Valid Until</label>
               <input
                 type="date"
                 value={formData.valid_until}
                 onChange={(event) => handleChange('valid_until', event.target.value)}
                 required
                 className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
               />
             </div>
 
             <div>
               <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Academic Year</label>
               <input
                 value={formData.academic_year}
                 onChange={(event) => handleChange('academic_year', event.target.value)}
                 placeholder="e.g. 2026"
                 required
                 className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
               />
             </div>
 
             <div>
               <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Term</label>
               <select
                 value={formData.term}
                 onChange={(event) => handleChange('term', event.target.value)}
                 required
                 className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
               >
                 <option value="1">Term 1</option>
                 <option value="2">Term 2</option>
                 <option value="3">Term 3</option>
               </select>
             </div>
 
             <div>
               <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Exam Type</label>
               <select
                 value={formData.exam_type}
                 onChange={(event) => handleChange('exam_type', event.target.value)}
                 required
                 className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
               >
                 <option value="Mid-Term">Mid-Term</option>
                 <option value="End-of-Term">End-of-Term</option>
                 <option value="Mock">Mock</option>
                 <option value="Assessment">Assessment</option>
               </select>
             </div>
 
             {/* Sales Account field - hidden but kept for functionality */}
             <div className="hidden">
               <input
                 type="hidden"
                 value={formData.sales_account_id}
                 onChange={(event) => handleChange('sales_account_id', event.target.value)}
               />
</div>
            </div>

            <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 text-sm shadow-sm transition-all disabled:opacity-60"
            >
              <Save size={16} />
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>

      <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                value={newCustomer.name}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Enter customer/school name"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
              <input
                type="email"
                value={newCustomer.email}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="customer@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
              <input
                value={newCustomer.phone}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder={getPlaceholder.phone()}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Address</label>
              <input
                value={newCustomer.address}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))}
                placeholder="Street address"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">City</label>
              <input
                value={newCustomer.city}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, city: event.target.value }))}
                placeholder="City"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowAddCustomer(false)}
              className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-medium hover:bg-slate-100 text-sm shadow-sm transition-all border border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNewCustomer}
              disabled={addingCustomer || !newCustomer.name.trim()}
              type="button"
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 text-sm shadow-sm transition-all disabled:opacity-60"
            >
              <Plus size={16} />
              {addingCustomer ? 'Adding...' : 'Add Customer'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExaminationBatchForm;
