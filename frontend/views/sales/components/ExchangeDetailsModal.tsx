import React, { useState } from 'react';
import {
  X, CheckCircle, XCircle, Printer, Clock,
  User, Calendar, MessageSquare, AlertCircle,
  FileText, ArrowRight, Package, TrendingDown, RefreshCw
} from 'lucide-react';
import { useSalesStore } from '../../../stores/salesStore';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { SalesExchange } from '../../../types';
import { format } from 'date-fns';

interface ExchangeDetailsModalProps {
  exchange: SalesExchange;
  onClose: () => void;
}

export const ExchangeDetailsModal: React.FC<ExchangeDetailsModalProps> = ({ exchange, onClose }) => {
  const { approveSalesExchange, cancelSalesExchange, updateReprintJob, isLoading } = useSalesStore();
  const { handlePreview } = useDocumentPreview();
  const [approvalComments, setApprovalComments] = useState('');
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  const toNum = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getItemName = (item: any) =>
    item?.product_name || item?.productName || item?.description || item?.name || item?.desc || 'Item';

  const getReplacementName = (item: any) =>
    item?.replaced_product_name || item?.replacedProductName || getItemName(item);

  const handleApproval = async (status: 'approved' | 'rejected') => {
    try {
      if (status === 'rejected' && !approvalComments) {
        alert("Please provide a reason for rejection in the comments field.");
        return;
      }
      if (status === 'approved') {
        await approveSalesExchange(exchange.id, approvalComments);
      } else {
        await cancelSalesExchange(exchange.id);
      }
      onClose();
    } catch (error) {
      alert(`Failed to process ${status}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">APPROVED</span>;
      case 'rejected': return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">REJECTED</span>;
      case 'completed': return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">COMPLETED</span>;
      default: return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">PENDING</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-200">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">EXCHANGE {exchange.exchange_number}</h2>
              {getStatusBadge(exchange.status)}
            </div>
            <p className="text-gray-500 flex items-center text-sm">
              <Calendar className="w-4 h-4 mr-1.5" />
              Requested on {format(new Date(exchange.exchange_date), 'MMMM dd, yyyy HH:mm')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Details & Items */}
            <div className="lg:col-span-2 space-y-8">
              {/* Info Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-widest">Customer</div>
                  <div className="font-bold text-gray-900 text-lg">{exchange.customer_name}</div>
                  <div className="text-sm text-gray-500 mt-1 flex items-center">
                    <User className="w-3 h-3 mr-1" />
                    ID: {exchange.customer_id || 'N/A'}
                  </div>
                </div>
                <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-widest">Original Document</div>
                  <div className="font-bold text-indigo-600 text-lg">Invoice #{exchange.invoice_id}</div>
                  <div className="text-sm text-gray-500 mt-1 flex items-center">
                    <FileText className="w-3 h-3 mr-1" />
                    View Original
                  </div>
                </div>
              </div>

              {/* Reason Section */}
              <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-2xl">
                <div className="flex items-start space-x-4">
                  <div className="bg-amber-100 p-3 rounded-xl">
                    <MessageSquare className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-amber-900 mb-1">Exchange Reason: {exchange.reason}</h3>
                    <p className="text-amber-800 text-sm leading-relaxed">
                      {exchange.remarks || 'No additional remarks provided.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-indigo-600" />
                  Exchange Items
                </h3>
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Returned Item</th>
                        <th className="px-6 py-4">Replacement Item</th>
                        <th className="px-6 py-4 text-center">Returned</th>
                        <th className="px-6 py-4 text-center">Replaced</th>
                        <th className="px-6 py-4">Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(exchange.items || []).map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900">{getItemName(item)}</td>
                          <td className="px-6 py-4 font-medium text-green-700">
                            {toNum(item.qty_replaced ?? item.qtyReplaced) > 0
                              ? getReplacementName(item)
                              : <span className="text-gray-400 italic">No replacement</span>
                            }
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-red-600">-{toNum(item.qty_returned ?? item.qtyReturned)}</td>
                          <td className="px-6 py-4 text-center font-bold text-green-600">+{toNum(item.qty_replaced ?? item.qtyReplaced)}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">
                              {item.condition?.replace('_', ' ') || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(exchange.items || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500 italic">
                            No exchange items were found for this record.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Workflow & Actions */}
            <div className="space-y-6">
              {/* Workflow Status */}
              <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                <h3 className="font-bold text-gray-900 mb-6 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-indigo-600" />
                  Workflow Status
                </h3>

                <div className="space-y-8 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="font-bold text-sm text-gray-900">Request Initiated</div>
                    <div className="text-xs text-gray-500">by Sales Clerk • {format(new Date(exchange.exchange_date), 'HH:mm')}</div>
                  </div>

                  <div className="relative pl-8">
                    <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm ${exchange.status === 'pending' ? 'bg-yellow-400 animate-pulse' :
                        exchange.status === 'rejected' ? 'bg-red-500' : 'bg-green-500'
                      }`}>
                      {exchange.status === 'pending' ? <Clock className="w-4 h-4 text-white" /> :
                        exchange.status === 'rejected' ? <XCircle className="w-4 h-4 text-white" /> :
                          <CheckCircle className="w-4 h-4 text-white" />}
                    </div>
                    <div className="font-bold text-sm text-gray-900">Supervisor Approval</div>
                    <div className="text-xs text-gray-500">
                      {exchange.status === 'pending' ? 'Awaiting review...' :
                        exchange.status === 'rejected' ? 'Rejected' : 'Approved'}
                    </div>
                  </div>

                  <div className="relative pl-8">
                    <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm ${exchange.status === 'approved' ? 'bg-indigo-500 animate-pulse' :
                        exchange.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                      }`}>
                      <Printer className="w-4 h-4 text-white" />
                    </div>
                    <div className="font-bold text-sm text-gray-900">Reprint Execution</div>
                    <div className="text-xs text-gray-500">
                      {exchange.status === 'approved' ? 'Job in queue' :
                        exchange.status === 'completed' ? 'Job completed' : 'Pending approval'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {exchange.status === 'pending' && !showApprovalForm && (
                  <button
                    onClick={() => setShowApprovalForm(true)}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center justify-center group"
                  >
                    REVIEW REQUEST
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}

                {showApprovalForm && (
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 space-y-4 animate-in slide-in-from-top-4 duration-200">
                    <h4 className="font-bold text-gray-900 text-sm">Review Comments</h4>
                    <textarea
                      className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none bg-white font-normal"
                      placeholder="Enter approval/rejection notes (required for rejection)..."
                      value={approvalComments}
                      onChange={(e) => setApprovalComments(e.target.value)}
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleApproval('approved')}
                        disabled={isLoading}
                        className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-xs hover:bg-green-700 shadow-lg shadow-green-100 transition-all uppercase tracking-wider"
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => handleApproval('rejected')}
                        disabled={isLoading}
                        className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs hover:bg-red-700 shadow-lg shadow-red-100 transition-all uppercase tracking-wider"
                      >
                        REJECT
                      </button>
                    </div>
                    <button
                      onClick={() => setShowApprovalForm(false)}
                      className="w-full text-xs text-gray-500 font-bold hover:text-gray-700 uppercase tracking-tight"
                    >
                      CANCEL REVIEW
                    </button>
                  </div>
                )}

                {(exchange.status === 'approved' || exchange.status === 'completed') && (
                  <button
                    onClick={() => handlePreview('SALES_EXCHANGE', exchange)}
                    className="w-full py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-2xl font-black text-sm tracking-widest hover:bg-indigo-50 transition-all flex items-center justify-center group"
                  >
                    PRINT EXCHANGE NOTE
                    <Printer className="w-5 h-5 ml-2" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

