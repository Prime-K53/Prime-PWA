import React, { useState, useEffect } from 'react';
import { X, Save, User, MapPin, CreditCard, FileText, Building, Truck, Plus, Trash2, Wallet, Users, AlertTriangle, CheckCircle2, Factory } from 'lucide-react';
import { Customer } from '../../../types';
import { getDefaultPaymentTermsForSegment } from '../../../utils/helpers';
import { useData } from '../../../context/DataContext';
import { getPlaceholder } from '../../../constants/placeholders';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => Promise<void>;
  customer?: Customer;
}

export const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, onSave, customer }) => {
  const [formData, setFormData] = useState<any>({
    name: '',
    phone: '',
    address: '',
    city: '',
    billingAddress: '',
    shippingAddress: '',
    balance: 0,
    walletBalance: 0,
    creditLimit: 0,
    notes: '',
    subAccounts: [],
    segment: 'Individual',
    paymentTerms: getDefaultPaymentTermsForSegment('Individual'),
    assignedSalesperson: '',
    creditHold: false,
    tags: [],
    avgPaymentDays: 0,
    leadSource: '',
    pipelineStage: 'New',
    leadScore: 0,
    nextFollowUpDate: '',
    estimatedDealValue: 0
  });

  const [useBillingForShipping, setUseBillingForShipping] = useState(true);
  const [activeTab, setActiveTab] = useState<'Address' | 'Payment' | 'Additional' | 'Branches'>('Address');

  useEffect(() => {
    if (customer) {
      setFormData({
        ...customer,
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        billingAddress: customer.billingAddress || '',
        shippingAddress: customer.shippingAddress || '',
        balance: customer.balance ?? 0,
        walletBalance: customer.walletBalance ?? 0,
        creditLimit: customer.creditLimit ?? 0,
        notes: customer.notes || '',
        subAccounts: customer.subAccounts || [],
        segment: (customer.segment as any) || 'Individual',
        paymentTerms: customer.paymentTerms || getDefaultPaymentTermsForSegment(customer.segment || 'Individual'),
        assignedSalesperson: customer.assignedSalesperson || '',
        creditHold: Boolean(customer.creditHold),
        tags: customer.tags || [],
        avgPaymentDays: customer.avgPaymentDays ?? 0,
        leadSource: (customer as any).leadSource || '',
        pipelineStage: (customer as any).pipelineStage || 'New',
        leadScore: (customer as any).leadScore ?? 0,
        nextFollowUpDate: (customer as any).nextFollowUpDate || '',
        estimatedDealValue: (customer as any).estimatedDealValue ?? 0
      });
      setUseBillingForShipping(customer.billingAddress === customer.shippingAddress);
    } else {
      setFormData({
        name: '', phone: '', address: '', city: '', billingAddress: '', shippingAddress: '',
        balance: 0, walletBalance: 0, creditLimit: 0, notes: '',
        paymentTerms: getDefaultPaymentTermsForSegment('Individual'), subAccounts: [], segment: 'Individual', assignedSalesperson: '',
        creditHold: false, tags: [], avgPaymentDays: 0, leadSource: '', pipelineStage: 'New', leadScore: 0, nextFollowUpDate: '', estimatedDealValue: 0
      });
      setUseBillingForShipping(true);
    }
  }, [customer, isOpen]);

  const { invoices, companyConfig } = useData();

  const calcOutstanding = (custName: string | undefined) => {
    if (!custName) return 0;
    const invs = (invoices || []).filter((inv: any) => inv.customerName === custName && inv.status !== 'Paid' && inv.status !== 'Cancelled');
    const outstanding = invs.reduce((sum: number, inv: any) => sum + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
    return outstanding;
  };

  const outstandingBalance = calcOutstanding(formData.name || customer?.name);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (useBillingForShipping) dataToSave.shippingAddress = dataToSave.billingAddress;
    
    // Ensure customers always get a policy-aligned default when terms are empty.
    if (!dataToSave.paymentTerms) {
      dataToSave.paymentTerms = getDefaultPaymentTermsForSegment(dataToSave.segment || 'Individual');
    }
    
    await onSave(dataToSave as Customer);
    onClose();
  };

  const handleAddSubAccount = () => {
    setFormData(prev => ({
      ...prev,
      subAccounts: [...(prev.subAccounts || []), { id: `SUB-${Date.now()}`, name: '', balance: 0, walletBalance: 0, status: 'Active' }]
    }));
  };

  const handleRemoveSubAccount = (id: string) => {
    setFormData(prev => ({ ...prev, subAccounts: (prev.subAccounts || []).filter(s => s.id !== id) }));
  };

  const handleSubAccountChange = (id: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      subAccounts: (prev.subAccounts || []).map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      if (name === 'segment') {
        // When segment changes, update payment terms based on the new segment
        const newSegment = value as 'Individual' | 'School Account' | 'Institution' | 'Government';
        const newPaymentTerms = getDefaultPaymentTermsForSegment(newSegment);

        setFormData(prev => ({
          ...prev,
          [name]: newSegment,
          paymentTerms: newPaymentTerms
        }));
      } else {
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
      }
    }
  };

  const SidebarItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
        activeTab === id 
          ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-600' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
      {/* Modal Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header - Mimicking ItemModal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                {customer ? `Edit Customer: ${customer.name}` : 'Add New Customer'}
              </h2>
              <p className="text-xs text-slate-500">
                {customer ? `ID: ${customer.id || 'N/A'}` : 'Create a new customer profile'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm shadow-md"
            >
              <Save className="w-4 h-4" />
              {customer ? 'Update Customer' : 'Save Customer'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Mimicking ItemModal */}
          <div className="w-48 bg-slate-50 border-r border-slate-200 py-4 space-y-1 shrink-0 overflow-y-auto">
            <SidebarItem id="Address" label="Address Info" icon={MapPin} />
            <SidebarItem id="Payment" label="Payment & Billing" icon={CreditCard} />
            <SidebarItem id="Additional" label="Additional Info" icon={FileText} />
            <SidebarItem id="Branches" label="Branches" icon={Building} />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <form id="client-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {/* Top Section */}
              <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-slate-100">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Customer Name / Company</label>
                  <input required type="text" name="name" value={formData.name} onChange={handleChange}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder={getPlaceholder.company()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone Number</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder={getPlaceholder.phone()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Segment</label>
                  <select name="segment" value={formData.segment} onChange={handleChange}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer">
                    <option value="Individual">Individual</option>
                    <option value="School Account">School Account</option>
                    <option value="Institution">Institution</option>
                    <option value="Government">Government</option>
                  </select>
                </div>
              </div>

              {activeTab === 'Address' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Billing Address</label>
                      <textarea name="billingAddress" value={formData.billingAddress} onChange={handleChange} rows={3}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                        placeholder={getPlaceholder.address()} />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-slate-700">Shipping Address</label>
                        <label className="flex items-center gap-2 text-xs font-bold text-indigo-600 cursor-pointer">
                          <input type="checkbox" checked={useBillingForShipping} onChange={(e) => setUseBillingForShipping(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                          Same as Billing
                        </label>
                      </div>
                      {!useBillingForShipping && (
                        <textarea name="shippingAddress" value={formData.shippingAddress} onChange={handleChange} rows={3}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                          placeholder={`${getPlaceholder.addressLine2()}, ${getPlaceholder.city()}`} />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">City / Region</label>
                        <input type="text" name="city" value={formData.city} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder={getPlaceholder.city()} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Payment' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Opening Balance</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                        <input type="number" name="balance" value={formData.balance} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder={getPlaceholder.price()} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Wallet Balance</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-sm">$</span>
                        <input type="number" name="walletBalance" value={formData.walletBalance} onChange={handleChange}
                          className="w-full bg-emerald-50/30 border border-emerald-100 rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          placeholder={getPlaceholder.price()} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Payment Terms</label>
                      <select name="paymentTerms" value={formData.paymentTerms} onChange={handleChange}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer">
                        <option value="Net 7">Net 7 Days</option>
                        <option value="Net 30">Net 30 Days</option>
                        <option value="Net 365">Net 365 Days</option>
                        <option value="Due on Receipt">Due on Receipt</option>
                        <option value="Net 15">Net 15 Days</option>
                        <option value="Net 60">Net 60 Days</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Credit Limit</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                        <input type="number" name="creditLimit" value={formData.creditLimit} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="0.00" />
                      </div>
                    </div>

                    <div className="col-span-2 p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${formData.creditHold ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500'}`}>
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-700">Credit Hold</div>
                          <div className="text-[10px] text-slate-500 font-medium tracking-tight">Temporarily suspend all credit transactions for this client</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="creditHold" checked={formData.creditHold} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                        </label>

                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Outstanding</div>
                          <div className="text-sm font-bold">{(companyConfig?.currencySymbol || '$')}{outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>

                        <button type="button" onClick={async () => {
                          const dataToSave = { ...formData, creditHold: !formData.creditHold };
                          try {
                            await onSave(dataToSave as Customer);
                            onClose();
                          } catch (err: any) {
                            alert('Failed to apply hold: ' + (err?.message || err));
                          }
                        }} className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${formData.creditHold ? 'bg-rose-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                          {formData.creditHold ? 'Release Hold' : 'Place Hold'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Additional' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Lead Source</label>
                        <select name="leadSource" value={formData.leadSource || ''} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer">
                          <option value="">Not Set</option>
                          <option value="Referral">Referral</option>
                          <option value="Website">Website</option>
                          <option value="Walk-in">Walk-in</option>
                          <option value="Social Media">Social Media</option>
                          <option value="Field Sales">Field Sales</option>
                          <option value="Email Campaign">Email Campaign</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Pipeline Stage</label>
                        <select name="pipelineStage" value={formData.pipelineStage || 'New'} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer">
                          <option value="New">New</option>
                          <option value="Qualified">Qualified</option>
                          <option value="Proposal">Proposal</option>
                          <option value="Negotiation">Negotiation</option>
                          <option value="Won">Won</option>
                          <option value="Lost">Lost</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Lead Score</label>
                        <input type="number" min={0} max={100} name="leadScore" value={formData.leadScore ?? 0} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. 85" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Next Follow-Up</label>
                        <input type="date" name="nextFollowUpDate" value={formData.nextFollowUpDate || ''} onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Estimated Deal Value</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                          <input type="number" min={0} name="estimatedDealValue" value={formData.estimatedDealValue ?? 0} onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
                      <input type="text" name="tags" value={(formData.tags || []).join(', ')}
                        onChange={(e) => setFormData(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="e.g. VIP, Retail" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Internal Notes</label>
                      <textarea name="notes" value={formData.notes} onChange={handleChange} rows={4}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                        placeholder="e.g. Prefers morning deliveries" />
                    </div>
                  </div>
                </div>
              )}


              {activeTab === 'Branches' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-700">Branch Accounts</h3>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5 tracking-tight">Manage multiple locations or sub-entities</p>
                    </div>
                    <button type="button" onClick={handleAddSubAccount}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-bold border border-indigo-100">
                      <Plus size={16} />
                      Add Branch
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {(formData.subAccounts || []).length === 0 ? (
                      <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                        <Building size={32} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-sm font-bold text-slate-400">No branch accounts added yet</p>
                      </div>
                    ) : (
                      (formData.subAccounts || []).map((sub) => (
                        <div key={sub.id} className="p-4 bg-white border border-slate-200 rounded-xl group hover:border-indigo-200 transition-all relative shadow-sm">
                          <button type="button" onClick={() => handleRemoveSubAccount(sub.id)}
                            className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 size={16} />
                          </button>
                          <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-12">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Branch Name</label>
                              <input type="text" value={sub.name} onChange={(e) => handleSubAccountChange(sub.id, 'name', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                                placeholder="e.g. Blantyre Branch" />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
