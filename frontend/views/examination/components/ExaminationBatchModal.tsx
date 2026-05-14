import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Plus, Search, ChevronDown, Building2, UserPlus, Coins, Calendar, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExamination } from '../../../context/ExaminationContext';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Select } from '../../../components/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';
import { toast } from '../../../components/Toast';
import { Customer } from '../../../types';
import { getPlaceholder } from '../../../constants/placeholders';
import { dbService } from '../../../services/db';

interface ExaminationBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (batch: any) => void;
}

const ExaminationBatchModal: React.FC<ExaminationBatchModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { createBatch, loadAllData, schools, customers, loading: contextLoading } = useExamination();
  const { companyConfig, addAuditLog } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    school_id: '',
    name: '',
    academic_year: new Date().getFullYear().toString(),
    term: '1',
    exam_type: 'Mid-Term',
    sub_account_name: '',
  });

  // Search and dropdown state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Add new customer modal state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
  });
  const [addingCustomer, setAddingCustomer] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAllData();
    }
  }, [isOpen, loadAllData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    // Use setTimeout to prevent immediate closing when clicking input
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter schools based on search query
  const filteredSchools = React.useMemo(() => {
    // If no schools, return empty array
    if (!schools || schools.length === 0) {
      return [];
    }
    if (!searchQuery.trim()) {
      return schools.slice(0, 20); // Show first 20 by default
    }
    const query = searchQuery.toLowerCase();
    return schools.filter(school =>
      school.name?.toLowerCase().includes(query) ||
      school.email?.toLowerCase().includes(query) ||
      school.phone?.toLowerCase().includes(query)
    );
  }, [schools, searchQuery]);

  // Handle school selection
  const handleSelectSchool = (school: any) => {
    setSelectedSchool(school);
    setFormData(prev => ({ ...prev, school_id: school.id, sub_account_name: '' }));
    setSearchQuery(school.name);
    setShowDropdown(false);
  };

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (!showDropdown) {
      setShowDropdown(true);
    }
    // Clear selection if search doesn't match selected school name
    if (selectedSchool && value !== selectedSchool.name) {
      setSelectedSchool(null);
      setFormData(prev => ({ ...prev, school_id: '', sub_account_name: '' }));
    }
  };

  const selectedCustomerFull = React.useMemo(() => {
    if (!formData.school_id) return null;
    return customers.find(c => String(c.id) === String(formData.school_id));
  }, [customers, formData.school_id]);

  const selectedCustomerSubAccounts = React.useMemo(
    () => selectedCustomerFull?.subAccounts || [],
    [selectedCustomerFull]
  );

  const hasSubAccounts = selectedCustomerSubAccounts.length > 0;

  // Handle adding new customer
  const handleAddNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;

    setAddingCustomer(true);
    try {
      const customerId = `CUS-${Date.now()}`;
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

      // Add audit log
      if (addAuditLog) {
        addAuditLog({
          action: 'CREATE',
          entityType: 'Customer',
          entityId: customerId,
          details: `Created new customer: ${customer.name}`,
          newValue: customer
        });
      }

      // Reload data and select the new customer
      await loadAllData();
      handleSelectSchool(customer);

      // Reset form and close modal
      setNewCustomer({ name: '', email: '', phone: '', address: '', city: '' });
      setShowAddCustomer(false);
    } catch (error) {
      console.error('Failed to add customer:', error);
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.school_id) {
      toast.error('Please select a school or customer from the list');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Please enter a batch name');
      return;
    }
    if (hasSubAccounts && !formData.sub_account_name.trim()) {
      toast.error('Please select a billed sub-account');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        school_id: String(formData.school_id || '').trim(),
        name: formData.name.trim(),
        academic_year: formData.academic_year.trim(),
        currency: companyConfig?.currencySymbol || 'MWK',
        sub_account_name: hasSubAccounts ? formData.sub_account_name.trim() : '',
        rounding_method: companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50',
        rounding_value: Number(companyConfig?.pricingSettings?.customStep || 50)
      };

      const newBatch = await createBatch(payload as any);
      toast.success('Examination batch created successfully');

      try {
        onSuccess?.(newBatch);
      } catch (callbackError) {
        console.error('Batch success callback failed:', callbackError);
      }

      onClose();
    } catch (error: any) {
      console.error('Failed to create batch:', error);
      const errorMessage = error?.message || 'Failed to create examination batch. Please try again.';
      
      if (errorMessage.includes('School ID') || errorMessage.includes('required')) {
        toast.error('Please select a school and enter a batch name');
      } else if (errorMessage.includes('NOT NULL constraint failed')) {
        toast.error('Please select a valid school from the list');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const billedAccountLabel = React.useMemo(() => {
    if (!selectedSchool) return 'Not selected';
    if (hasSubAccounts) return formData.sub_account_name || 'Select sub-account';
    return 'Main account';
  }, [selectedSchool, hasSubAccounts, formData.sub_account_name]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl h-[90vh] p-0">
        <div className="bg-white rounded-xl shadow-2xl w-full h-full flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-normal text-slate-900">Create New Examination Batch - {formData.name || 'Untitled'}</h2>
              <p className="text-[11px] font-normal text-slate-400 mt-0.5">Secure Document Terminal</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="w-2/3 p-6 overflow-y-auto border-r border-slate-200 space-y-8 custom-scrollbar bg-[#F8FAFC]">
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                {/* Row 1: Batch Name & Academic Year */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Batch Name</label>
                  <input
                    type="text"
                    className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm"
                    placeholder="e.g. Term 1 Examinations 2026"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Academic Year</label>
                  <input
                    type="text"
                    className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm"
                    placeholder="e.g. 2026"
                    value={formData.academic_year}
                    onChange={(e) => handleChange('academic_year', e.target.value)}
                    required
                  />
                </div>

                {/* Row 2: School / Client & Billed Account */}
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-32">
                      <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap">School / Client</label>
                    </div>
                    <div className="relative w-64">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() => setShowDropdown(true)}
                        onClick={() => setShowDropdown(true)}
                        placeholder="Search schools or customers..."
                        className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required={!selectedSchool}
                      />
                      {selectedSchool && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSchool(null);
                            setSearchQuery('');
                            setFormData(prev => ({ ...prev, school_id: '', sub_account_name: '' }));
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                          <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                        </button>
                      )}
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />

                      {showDropdown && (
                        <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-premium max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                          {/* Add New Customer Option */}
                          <button
                            type="button"
                            onClick={() => {
                              setShowDropdown(false);
                              setShowAddCustomer(true);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center text-blue-600 border-b border-gray-200"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add New Customer / School
                          </button>

                          {/* School List */}
                          {contextLoading ? (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                              Loading...
                            </div>
                          ) : filteredSchools.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                              No matches found. Click "Add New Customer" to create one.
                            </div>
                          ) : (
                            filteredSchools.map((school) => (
                              <button
                                key={school.id}
                                type="button"
                                onClick={() => handleSelectSchool(school)}
                                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center ${selectedSchool?.id === school.id ? 'bg-blue-50' : ''
                                  }`}
                              >
                                <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                                <div>
                                  <div className="font-medium">{school.name}</div>
                                  {school.email && (
                                    <div className="text-xs text-gray-500">{school.email}</div>
                                  )}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Billed Account</label>
                  <div className="relative w-64">
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none disabled:bg-slate-100 disabled:text-slate-500"
                      value={formData.sub_account_name}
                      onChange={(e) => handleChange('sub_account_name', e.target.value)}
                      disabled={!selectedSchool || !hasSubAccounts}
                      required={hasSubAccounts}
                    >
                      {!selectedSchool && <option value="">Select customer first</option>}
                      {selectedSchool && !hasSubAccounts && <option value="">Main account billing (no sub-accounts)</option>}
                      {hasSubAccounts && <option value="">Select billed sub-account</option>}
                      {selectedCustomerSubAccounts.map((sub: any) => (
                        <option key={sub.id || sub.name} value={sub.name}>{sub.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Row 3: Term & Exam Type */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Term</label>
                  <div className="relative w-64">
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                      value={formData.term}
                      onChange={(e) => handleChange('term', e.target.value)}
                      required
                    >
                      <option value="1">Term 1</option>
                      <option value="2">Term 2</option>
                      <option value="3">Term 3</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Exam Type</label>
                  <div className="relative w-64">
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                      value={formData.exam_type}
                      onChange={(e) => handleChange('exam_type', e.target.value)}
                      required
                    >
                      <option value="Mid-Term">Mid-Term</option>
                      <option value="End-of-Term">End-of-Term</option>
                      <option value="Mock">Mock</option>
                      <option value="National">National</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

              </div>
            </div>

            <div className="w-1/3 bg-slate-50 p-8 flex flex-col border-l border-slate-200 overflow-y-auto custom-scrollbar">
              <div className="mb-auto space-y-6 pb-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-slate-900 text-white rounded-lg shadow-xl">
                    <Calendar size={24} />
                  </div>
                  <h3 className="font-normal text-slate-800 text-xl leading-none">Batch Configuration</h3>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-500">Batch Name</span>
                      <span className="text-slate-700 font-mono text-[13px]">{formData.name || 'Untitled'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-500">Academic Year</span>
                      <span className="text-slate-700 font-mono text-[13px]">{formData.academic_year}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-500">Term</span>
                      <span className="text-slate-700 font-mono text-[13px]">{formData.term}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-500">Exam Type</span>
                      <span className="text-slate-700 font-mono text-[13px]">{formData.exam_type}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-slate-500">Billed Account</span>
                      <span className="text-slate-700 font-mono text-[13px]">{billedAccountLabel}</span>
                    </div>
                  </div>

                  {selectedSchool && (
                    <div className="pt-4 mt-4 border-t border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Building2 size={16} className="text-blue-600" />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-slate-700">{selectedSchool.name}</div>
                          <div className="text-[11px] text-slate-400">{selectedSchool.email}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 mt-4 border-t-2 border-slate-900 flex justify-between items-center">
                    <span className="font-semibold text-[13px] text-slate-900">Status</span>
                    <span className="text-sm font-semibold text-blue-600">Draft</span>
                  </div>
                </div>

                <div className="bg-blue-100/50 p-6 rounded-xl text-blue-900 border border-blue-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform"><Calendar size={80} /></div>
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="p-2 bg-blue-600 text-white rounded-lg">
                      <Eye size={16} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-blue-700 font-normal uppercase tracking-wider">Batch Preview</p>
                      <p className="text-xs text-blue-800/80 leading-relaxed font-normal">
                        After creating this batch, you can add classes and subjects to configure the examination details.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 shrink-0">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-normal text-[12px] shadow-xl shadow-blue-900/20 hover:bg-blue-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2 active:scale-95"
                >
                  <Save size={16} />
                  {loading ? 'Creating...' : 'Create Batch'}
                </button>
                <button onClick={onClose} className="w-full py-2 text-slate-400 font-normal text-[10px] hover:text-rose-500 transition-colors text-center">Cancel</button>
              </div>
            </div>
          </div>
        </div>

        {/* Add New Customer Modal */}
        <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter customer/school name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <Input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder={getPlaceholder.phone()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <Input
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Street address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <Input
                  value={newCustomer.city}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddCustomer(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddNewCustomer}
                disabled={addingCustomer || !newCustomer.name.trim()}
                type="button"
                className="bg-blue-600 text-white"
              >
                {addingCustomer ? 'Adding...' : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Customer
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default ExaminationBatchModal;
