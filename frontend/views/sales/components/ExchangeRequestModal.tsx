import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Search, AlertTriangle, Plus, Minus, 
  ChevronRight, Info, CheckCircle2, ShoppingCart, FileText, RefreshCw 
} from 'lucide-react';
import { useSalesStore } from '../../../stores/salesStore';
import { useFinanceStore } from '../../../stores/financeStore';
import { useAuth } from '../../../context/AuthContext';
import { Sale, SalesExchange, SalesExchangeItem } from '../../../types';
import { format } from 'date-fns';

interface ExchangeRequestModalProps {
  onClose: () => void;
  initialInvoice?: any;
}

export const ExchangeRequestModal: React.FC<ExchangeRequestModalProps> = ({ onClose, initialInvoice }) => {
  const { createSalesExchange, customers } = useSalesStore();
  const { invoices } = useFinanceStore();
  const { user } = useAuth();
  
  const [step, setStep] = useState<1 | 2>(initialInvoice ? 2 : 1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(initialInvoice || null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [returnItems, setReturnItems] = useState<any[]>(
    initialInvoice?.items?.map((item: any) => ({
      ...item,
      qty_to_return: 0,
      qty_to_replace: 0,
      condition: 'damaged'
    })) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredResults = useMemo(() => {
    if (!searchTerm) return { invoices: [], customers: [] };
    
    const searchLower = searchTerm.toLowerCase();
    
    const matchedCustomers = customers.filter(c => 
      c.name.toLowerCase().includes(searchLower) ||
      c.email?.toLowerCase().includes(searchLower) ||
      c.phone?.toLowerCase().includes(searchLower)
    ).slice(0, 3);

    const matchedInvoices = invoices.filter(inv => {
      const matchesSearch = inv.id.toLowerCase().includes(searchLower) ||
        inv.customerName.toLowerCase().includes(searchLower);
      
      const matchesCustomer = selectedCustomer ? inv.customerId === selectedCustomer.id : true;
      
      return matchesSearch && matchesCustomer;
    }).slice(0, 5);

    return { invoices: matchedInvoices, customers: matchedCustomers };
  }, [invoices, customers, searchTerm, selectedCustomer]);

  const handleSelectInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    setShowDropdown(false);
    // Initialize return items from invoice items
    const items = inv.items?.map((item: any) => ({
      ...item,
      qty_to_return: 0,
      qty_to_replace: 0,
      condition: 'damaged'
    })) || [];
    setReturnItems(items);
    setStep(2);
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.name);
    setShowDropdown(false);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...returnItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setReturnItems(newItems);
  };

  const handleSubmit = async () => {
    if (!reason || returnItems.filter(i => i.qty_to_return > 0).length === 0) {
      alert('Please provide a reason and at least one item to return');
      return;
    }

    setIsSubmitting(true);
    try {
      const exchangeData = {
        invoice_id: selectedInvoice.id,
        customer_id: selectedInvoice.customerId || '',
        customer_name: selectedInvoice.customerName,
        reason,
        remarks,
        created_by: user?.id || user?.username || 'system',
        items: returnItems
          .filter(i => i.qty_to_return > 0)
          .map((i, idx) => {
            const unitPrice = i.rate || i.price || 0;
            const priceDiff = (i.qty_to_replace - i.qty_to_return) * unitPrice;
            return {
              id: `${Date.now()}-${idx}`,
              product_id: i.id || i.productId,
              product_name: i.description || i.name,
              qty_returned: i.qty_to_return,
              qty_replaced: i.qty_to_replace,
              unit_price: unitPrice,
              price_difference: priceDiff,
              condition: i.condition,
              reprint_required: i.qty_to_replace > 0,
              replaced_product_id: i.replaced_product_id || (i.qty_to_replace > 0 ? i.id || i.productId : undefined),
              replaced_product_name: i.replaced_product_name || (i.qty_to_replace > 0 ? i.description || i.name : undefined)
            };
          }),
        total_price_difference: returnItems
          .filter(i => i.qty_to_return > 0)
          .reduce((acc, i) => acc + ((i.qty_to_replace - i.qty_to_return) * (i.rate || i.price || 0)), 0)
      };

      await createSalesExchange(exchangeData);
      onClose();
    } catch (error: any) {
      console.error('Failed to create exchange', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to create exchange request: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Sales Exchange Request</h2>
            <p className="text-sm text-gray-500">Step {step} of 2: {step === 1 ? 'Select Invoice' : 'Exchange Details'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="relative" ref={dropdownRef}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by Invoice ID or Customer Name..."
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  autoFocus
                />
                {searchTerm && (
                  <button 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCustomer(null);
                      setShowDropdown(false);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}

                {/* Search Dropdown */}
                {showDropdown && (filteredResults.invoices.length > 0 || filteredResults.customers.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 z-[110] max-h-[400px] overflow-y-auto">
                    {filteredResults.customers.length > 0 && (
                      <div className="p-2 border-b border-gray-50">
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customers</div>
                        {filteredResults.customers.map(customer => (
                          <div 
                            key={customer.id}
                            onClick={() => handleSelectCustomer(customer)}
                            className="flex items-center space-x-3 p-3 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                              {customer.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-900 truncate">{customer.name}</div>
                              <div className="text-[11px] text-gray-500 truncate">{customer.email || customer.phone || 'No contact info'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredResults.invoices.length > 0 && (
                      <div className="p-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Invoices</div>
                        {filteredResults.invoices.map(inv => (
                          <div 
                            key={inv.id}
                            onClick={() => handleSelectInvoice(inv)}
                            className="flex items-center justify-between p-3 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900">Invoice #{inv.id}</div>
                                <div className="text-[11px] text-gray-500">{inv.customerName}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">${inv.totalAmount?.toLocaleString()}</div>
                              <div className="text-[10px] text-gray-400">{format(new Date(inv.date), 'MMM dd, yyyy')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Filtering by Customer</div>
                      <div className="font-bold text-indigo-900">{selectedCustomer.name}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSearchTerm('');
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline"
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              {/* Grid View for filtered results when no dropdown or as background */}
              {!showDropdown && filteredResults.invoices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredResults.invoices.map((inv) => (
                    <div 
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className="group flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">Invoice #{inv.id}</div>
                            <div className="text-xs text-gray-500">{format(new Date(inv.date), 'MMM dd, yyyy')}</div>
                          </div>
                        </div>
                        <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                          inv.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {inv.status}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                        <div>
                          <div className="text-xs text-gray-400">Customer</div>
                          <div className="text-sm font-semibold text-gray-700 truncate max-w-[150px]">{inv.customerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Amount</div>
                          <div className="text-lg font-black text-indigo-600">${inv.totalAmount?.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !searchTerm ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                  <ShoppingCart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Enter an invoice number or customer name to start</p>
                </div>
              ) : !showDropdown && filteredResults.invoices.length === 0 && (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No invoices found matching "{searchTerm}"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Invoice Summary */}
              <div className="bg-indigo-50 rounded-xl p-4 flex justify-between items-center border border-indigo-100">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-2 rounded-lg shadow-sm">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Original Invoice</div>
                    <div className="font-bold text-indigo-900">#{selectedInvoice.id} - {selectedInvoice.customerName}</div>
                  </div>
                </div>
                <button 
                  onClick={() => setStep(1)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline"
                >
                  Change Invoice
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for Exchange <span className="text-red-500">*</span></label>
                    <select 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                    >
                      <option value="">Select a reason...</option>
                      <option value="Color mismatch">Color mismatch</option>
                      <option value="Poor print quality">Poor print quality</option>
                      <option value="Incorrect size">Incorrect size</option>
                      <option value="Damaged before delivery">Damaged before delivery</option>
                      <option value="Wrong content printed">Wrong content printed</option>
                      <option value="Customer change request">Customer change request</option>
                      <option value="Other">Other (specify in remarks)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Remarks</label>
                    <textarea 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                      placeholder="Provide more details about the exchange..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-900 text-sm mb-1">Exchange Policy Note</h4>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Exchanges require supervisor approval. Returned items should be verified for quantity and condition. 
                        Reprints will be auto-queued once approved.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Product Item</th>
                      <th className="px-4 py-3 text-center">Original Qty</th>
                      <th className="px-4 py-3 text-center">Qty to Return</th>
                      <th className="px-4 py-3 text-center">Qty to Replace</th>
                      <th className="px-4 py-3">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {returnItems.map((item, idx) => (
                      <tr key={idx} className={item.qty_to_return > 0 ? 'bg-indigo-50/30' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.description || item.name}</div>
                          <div className="text-xs text-gray-500">Unit Price: ${item.rate?.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center space-x-2">
                            <button 
                              onClick={() => updateItem(idx, 'qty_to_return', Math.max(0, item.qty_to_return - 1))}
                              className="p-1 hover:bg-gray-200 rounded-md text-gray-500"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input 
                              type="number"
                              className="w-16 text-center border border-gray-300 rounded-md py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                              value={item.qty_to_return}
                              onChange={(e) => updateItem(idx, 'qty_to_return', Math.min(item.quantity, parseInt(e.target.value) || 0))}
                            />
                            <button 
                              onClick={() => updateItem(idx, 'qty_to_return', Math.min(item.quantity, item.qty_to_return + 1))}
                              className="p-1 hover:bg-gray-200 rounded-md text-gray-500"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center space-x-2">
                            <input 
                              type="number"
                              className="w-16 text-center border border-gray-300 rounded-md py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                              value={item.qty_to_replace}
                              onChange={(e) => updateItem(idx, 'qty_to_replace', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select 
                            className="w-full border border-gray-300 rounded-md py-1 px-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={item.condition}
                            onChange={(e) => updateItem(idx, 'condition', e.target.value)}
                          >
                            <option value="damaged">Damaged</option>
                            <option value="wrong_color">Wrong Color</option>
                            <option value="wrong_size">Wrong Size</option>
                            <option value="wrong_content">Wrong Content</option>
                            <option value="customer_request">Customer Req</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
          
          {step === 2 && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !reason || returnItems.filter(i => i.qty_to_return > 0).length === 0}
              className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all flex items-center"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Submit Exchange Request
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


