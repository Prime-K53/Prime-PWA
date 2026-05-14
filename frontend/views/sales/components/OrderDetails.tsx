
import React, { useState, useMemo } from 'react';
import {
    X, CheckCircle, Clock, FileText, DollarSign, Printer, Edit2, Download,
    ArrowRight, History, Trash2, CreditCard,
    AlertTriangle, Plus, Eye, Package, User, MapPin, Calendar, ShoppingBag
} from 'lucide-react';
import { Order, OrderPayment, OrderItem } from '../../../types';
import { useData } from '../../../context/DataContext';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useLocation } from 'react-router-dom';
import DocLink from '../../../components/DocLink';
import TransactionPricingInsights from './TransactionPricingInsights';

interface OrderDetailsProps {
    order: Order;
    onClose: () => void;
    onEdit: (order: Order) => void;
    onAction: (order: Order, action: string) => void;
}

export const OrderDetails: React.FC<OrderDetailsProps> = ({ order: initialOrder, onClose, onEdit, onAction }) => {
    const {
        companyConfig, orders = [], notify
    } = useData();
    const { handlePreview } = useDocumentPreview();
    const location = useLocation();
    const currency = companyConfig?.currencySymbol || '$';

    const order = useMemo(() =>
        orders.find(o => o.id === initialOrder.id) || initialOrder
        , [orders, initialOrder]);

    const [activeTab, setActiveTab] = useState<'Overview' | 'Payments' | 'Activity'>('Overview');

    const isCancelled = order.status === 'Cancelled';
    const isCompleted = order.status === 'Completed';

    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200/60 font-sans text-[13px] leading-relaxed text-slate-800">
                <div className="px-[16px] py-[12px] border-b border-slate-100 bg-slate-50/50 flex justify-between items-start shrink-0">
                    <div className="flex gap-6 items-center">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <Package size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-[22px] font-semibold text-slate-800 tracking-tight">Order #{order.orderNumber}</h1>
                                <span className={`px-2.5 py-0.5 rounded-lg text-[12.5px] font-semibold tracking-wide ${order.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                    order.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' :
                                        order.status === 'Processing' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-[12.5px] font-medium text-slate-500 tracking-wide">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">{order.customerName}</span>
                                <span className="flex items-center gap-1.5"><Clock size={14} /> Placed {new Date(order.orderDate).toLocaleDateString()}</span>
                                <span className="flex items-center gap-1.5"><User size={14} /> Created by {order.createdBy}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => onEdit(order)}
                            className="p-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 font-bold text-xs uppercase tracking-tight"
                        >
                            <Edit2 size={16} /> Edit
                        </button>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white">
                        {/* Tabs */}
                        <div className="flex px-8 border-b border-slate-100 gap-8">
                            {(['Overview', 'Payments', 'Activity'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`py-4 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                >
                                    {tab}
                                    {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {activeTab === 'Overview' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {/* Items Table */}
                                    <div className="bg-slate-50 rounded-[2rem] border border-slate-100 overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100/50">
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Qty</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Price</th>
                                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200/50">
                                                {order.items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-white transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="font-bold text-slate-900">{item.productName}</div>
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                <DocLink
                                                                    docNumber={item.productId}
                                                                    targetPage="/inventory"
                                                                    rowId={`item-${item.productId}`}
                                                                    currentPage={location.pathname}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-bold text-slate-700">{item.quantity}</td>
                                                        <td className="px-6 py-4 text-right font-medium text-slate-600">{currency}{item.unitPrice.toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-right font-black text-slate-900">{currency}{item.subtotal.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Summary & Addresses */}
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <MapPin size={14} /> Shipping Address
                                                </h3>
                                                <p className="text-slate-700 font-medium leading-relaxed">
                                                    {order.shippingAddress || 'No shipping address provided.'}
                                                </p>
                                            </div>
                                            {order.notes && (
                                                <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100">
                                                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Internal Notes</h3>
                                                    <p className="text-indigo-900 text-sm italic">"{order.notes}"</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl space-y-4">
                                            <div className="flex justify-between items-center text-slate-400 text-sm font-medium">
                                                <span>Subtotal</span>
                                                <span>{currency}{((order.totalAmount || 0) - (order.tax || 0)).toLocaleString()}</span>
                                            </div>
                                            {order.tax && order.tax > 0 && (
                                                <div className="flex justify-between items-center text-slate-400 text-sm font-medium">
                                                    <span>Tax ({order.taxRate}%)</span>
                                                    <span>{currency}{order.tax.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="h-px bg-white/10 my-2" />
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold uppercase tracking-widest text-indigo-400">Total Amount</span>
                                                <span className="text-3xl font-black">{currency}{order.totalAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-4">
                                                <span className="text-xs font-medium text-emerald-400">Paid Amount</span>
                                                <span className="text-xl font-bold text-emerald-400">{currency}{order.paidAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-rose-400">Balance Due</span>
                                                <span className="text-xl font-bold text-rose-400">{currency}{order.remainingBalance.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <TransactionPricingInsights transaction={order} currencySymbol={currency} />
                                </div>
                            )}

                            {activeTab === 'Payments' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {order.payments.length > 0 ? (
                                        <div className="space-y-4">
                                            {order.payments.map((payment, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 p-6 rounded-3xl flex justify-between items-center hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                                                            <DollarSign size={24} />
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-900">{currency}{payment.amountPaid.toLocaleString()}</div>
                                                            <div className="text-xs text-slate-500 font-medium">
                                                                via {payment.paymentMethod} • {new Date(payment.paymentDate).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recorded by</div>
                                                        <div className="text-sm font-bold text-slate-700">{payment.recordedBy}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-64 flex flex-col items-center justify-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                                            <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-4">
                                                <CreditCard size={32} />
                                            </div>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No payments recorded yet</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar Actions */}
                    <div className="w-80 border-l border-slate-200 p-8 space-y-8 bg-slate-50/50 shrink-0">
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quick Actions</h3>
                            <button
                                onClick={() => onAction(order, 'preview_pdf')}
                                className="w-full px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-2xl text-[13px] font-bold tracking-tight hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Eye size={18} /> Preview Order
                            </button>
                            <button
                                onClick={() => onAction(order, 'download_pdf')}
                                className="w-full px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-2xl text-[13px] font-bold tracking-tight hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Download size={18} /> Download PDF
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="w-full px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-2xl text-[13px] font-bold tracking-tight hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Printer size={18} /> Print Order
                            </button>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Workflow</h3>
                            <button
                                onClick={() => onAction(order, 'record_payment')}
                                disabled={isCompleted || isCancelled}
                                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-2xl text-[13px] font-bold tracking-tight hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                            >
                                <DollarSign size={18} /> Record Payment
                            </button>
                            <button
                                onClick={() => onAction(order, 'convert_to_invoice')}
                                disabled={isCompleted || isCancelled}
                                className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-[13px] font-bold tracking-tight hover:bg-emerald-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={18} /> Convert to Invoice
                            </button>
                        </div>

                        <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 space-y-3">
                            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Danger Zone</h3>
                            <button
                                onClick={() => onAction(order, 'cancel_order')}
                                disabled={isCancelled}
                                className="w-full px-4 py-3 bg-white text-rose-600 border border-rose-100 rounded-2xl text-[13px] font-bold tracking-tight hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                            >
                                <X size={18} /> Cancel Order
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
