import React, { useState, useEffect } from 'react';
import { X, Save, Phone, MapPin, FileText, Building, Landmark, Truck } from 'lucide-react';
import { Supplier } from '../../../types';
import { getPlaceholder } from '../../../constants/placeholders';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplier: Supplier) => Promise<void>;
  supplier?: Supplier;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, onSave, supplier }) => {
  const [activeTab, setActiveTab] = useState<'address' | 'payment' | 'additional'>('address');
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    phone: '',
    address: '',
    city: '',
    billingAddress: '',
    shippingAddress: '',
    balance: 0,
    category: '',
    notes: '',
    paymentTerms: 'Net 30',
    bankAccountDetails: ''
  });

  const [useBillingForShipping, setUseBillingForShipping] = useState(true);

  useEffect(() => {
    if (supplier) {
      setFormData(supplier);
      setUseBillingForShipping(supplier.billingAddress === supplier.shippingAddress);
    } else {
      setFormData({
        name: '',
        phone: '',
        address: '',
        city: '',
        billingAddress: '',
        shippingAddress: '',
        balance: 0,
        category: '',
        notes: '',
        paymentTerms: 'Net 30',
        bankAccountDetails: ''
      });
      setUseBillingForShipping(true);
    }
  }, [supplier, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (useBillingForShipping) {
      dataToSave.shippingAddress = dataToSave.billingAddress;
    }
    await onSave(dataToSave as Supplier);
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
  };

  const SidebarItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all rounded-lg ${
        activeTab === id 
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
              <Building size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {supplier ? 'Edit Supplier' : 'New Supplier'}
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5">Manage supplier profile and payment settings</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-100 bg-slate-50/30 p-4 flex flex-col gap-1">
            <SidebarItem id="address" label="Address" icon={MapPin} />
            <SidebarItem id="payment" label="Payment & Banking" icon={Landmark} />
            <SidebarItem id="additional" label="Notes & Info" icon={Building} />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              {/* Common Header Info */}
              <div className="grid grid-cols-2 gap-6 pb-8 border-b border-slate-100">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">Supplier Display Name *</label>
                  <input
                    required
                    type="text"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm bg-slate-50/50"
                    placeholder="e.g. ABC Suppliers"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">Phone Number</label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone || ''}
                      onChange={handleChange}
                      className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm bg-slate-50/50"
                      placeholder={getPlaceholder.phone()}
                    />
                    <Phone className="absolute left-4 top-3 text-slate-400" size={18} />
                  </div>
                </div>
              </div>

              {/* Tab Specific Content */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {activeTab === 'address' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-600 mb-2">
                          <MapPin size={18} />
                          <h3 className="font-bold text-sm uppercase tracking-wider">Billing Address</h3>
                        </div>
                        <textarea
                          name="billingAddress"
                          value={formData.billingAddress || ''}
                          onChange={handleChange}
                          rows={4}
                          className="w-full p-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none text-sm bg-slate-50/50"
                          placeholder={getPlaceholder.address()}
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-indigo-600">
                            <Truck size={18} />
                            <h3 className="font-bold text-sm uppercase tracking-wider">Shipping Address</h3>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-slate-500 font-bold cursor-pointer hover:text-indigo-600 transition-colors">
                            <input 
                              type="checkbox" 
                              checked={useBillingForShipping} 
                              onChange={(e) => setUseBillingForShipping(e.target.checked)}
                              className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            />
                            SAME AS BILLING
                          </label>
                        </div>
                        <textarea
                          name="shippingAddress"
                          value={useBillingForShipping ? (formData.billingAddress || '') : (formData.shippingAddress || '')}
                          onChange={handleChange}
                          disabled={useBillingForShipping}
                          rows={4}
                          className={`w-full p-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none text-sm ${useBillingForShipping ? 'bg-slate-100 text-slate-400' : 'bg-slate-50/50'}`}
                          placeholder={`${getPlaceholder.addressLine2()}, ${getPlaceholder.city()}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">City / Region</label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city || ''}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm bg-slate-50/50"
                          placeholder={getPlaceholder.city()}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'payment' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">Payment Terms</label>
                        <div className="relative">
                          <select
                            name="paymentTerms"
                            value={formData.paymentTerms || 'Net 30'}
                            onChange={handleChange}
                            className="w-full pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none bg-slate-50/50 text-sm font-medium"
                          >
                            <option value="Due on Receipt">Due on Receipt</option>
                            <option value="Net 15">Net 15</option>
                            <option value="Net 30">Net 30</option>
                            <option value="Net 60">Net 60</option>
                          </select>
                          <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                            <Building size={16} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">Opening Balance</label>
                        <div className="relative">
                          <input
                            type="number"
                            name="balance"
                            value={formData.balance || 0}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm bg-slate-50/50 font-mono"
                            placeholder="0.00"
                          />
                          <span className="absolute left-4 top-2.5 text-slate-400 font-bold">$</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-600">
                        <Landmark size={18} />
                        <h3 className="font-bold text-sm uppercase tracking-wider">Bank Account Details</h3>
                      </div>
                      <textarea
                        name="bankAccountDetails"
                        value={formData.bankAccountDetails || ''}
                        onChange={handleChange}
                        rows={3}
                        className="w-full p-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none text-sm bg-slate-50/50"
                        placeholder="e.g. National Bank, 1234567890"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'additional' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-600 mb-2">
                        <FileText size={18} />
                        <h3 className="font-bold text-sm uppercase tracking-wider">Internal Notes</h3>
                      </div>
                      <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleChange}
                        rows={6}
                        className="w-full p-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none text-sm bg-slate-50/50"
                        placeholder="e.g. Lead time is usually 3 days"
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-100 flex items-center justify-end gap-4 bg-slate-50/30">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm"
          >
            <Save size={20} />
            {supplier ? 'Save Changes' : 'Create Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
};
