import React, { useState, useMemo, useRef } from 'react';
import { X, FileText, Package, Ship, Landmark, ChevronRight, History as LucideHistory, Printer, Building2, Eye, Loader2, Download } from 'lucide-react';
import { Purchase, LandingCostItem } from '../../../types';
import { useData } from '../../../context/DataContext';
import { useInventory } from '../../../context/InventoryContext';
import { OfflineImage } from '../../../components/OfflineImage';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import LandingCostAllocation from './LandingCostAllocation';

import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import { useLocation } from 'react-router-dom';
import DocLink from '../../../components/DocLink';

interface PurchaseOrderDetailProps {
    purchase: Purchase;
    suppliers: any[];
    onClose: () => void;
    onReceive: (id: string) => void;
    onConvert: (id: string) => void;
    onPayment?: (purchase: Purchase) => void;
}

const PurchaseOrderDetail: React.FC<PurchaseOrderDetailProps> = ({ purchase, suppliers, onClose, onReceive, onConvert, onPayment }) => {
    const { companyConfig, notify, expenses, inventory } = useData();
    const { updatePurchase, goodsReceipts } = useInventory();
    const { handlePreview } = useDocumentPreview();
    const location = useLocation();
    const currency = companyConfig.currencySymbol;
    const [activeTab, setActiveTab] = useState<'Overview' | 'Landing' | 'Related'>('Overview');
    const contentRef = useRef<HTMLDivElement>(null);

    const purchaseWithVendor = useMemo(() => {
        const supplier = (suppliers || []).find(s => s.id === purchase.supplierId) ||
            (suppliers || []).find(s => s.name === purchase.supplierId);
        return {
            ...purchase,
            supplierName: supplier?.name || purchase.supplierId,
            vendorName: supplier?.name || purchase.supplierId,
            vendorAddress: supplier?.address,
            vendorPhone: supplier?.phone,
            address: supplier?.address,
            phone: supplier?.phone,
            clientName: supplier?.name || purchase.supplierId
        };
    }, [purchase, suppliers]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Received': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Partially Received': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'Ordered': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Pending Approval': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Draft': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'Closed': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    const linkedDocs = useMemo(() => {
        const docs = [];
        const linkedBills = (expenses || []).filter(e =>
            e.referenceId === purchase.id ||
            (e.description && e.description.includes(purchase.id))
        );

        linkedBills.forEach(b => {
            docs.push({ type: 'Bill / Expense', id: b.id, date: b.date, status: 'Posted' });
        });

        // Find Goods Receipts
        const grns = (goodsReceipts || []).filter(g => g.purchaseOrderId === purchase.id);
        grns.forEach(g => {
            docs.push({ type: 'Goods Receipt', id: g.id, date: g.date, status: 'Received' });
        });

        return docs;
    }, [purchase, expenses, goodsReceipts]);

    const landingTotal = (purchase.landingCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
    const isPaid = purchase.paymentStatus === 'Paid';

    const handleUpdateLandingCosts = (costs: LandingCostItem[]) => {
        updatePurchase({ ...purchase, landingCosts: costs });
    };

    const handleEmail = () => {
        const subject = `Order Request: ${purchase.id}`;
        const body = `Please find our order ${purchase.id} attached.`;
        notify(`Email functionality for vendors is currently being updated.`, "info");
    };

    const handleCancel = () => {
        if (window.confirm("Are you sure you want to cancel this order?")) {
            updatePurchase({ ...purchase, status: 'Cancelled' });
            onClose();
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        try {
            notify("Preparing Purchase Order PDF...", "info");
            const pdfData = mapToInvoiceData(purchaseWithVendor, companyConfig, 'PO');
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="PO" data={securedPdfData as any} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `PURCHASE-ORDER-${purchase.id}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Purchase Order PDF downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    const handleConvertToBill = () => {
        if (confirm("Convert this Purchase Order into a Bill/Expense? This will verify the PO as closed and create a payable record.")) {
            onConvert(purchase.id);
            onClose();
        }
    };

    const printStyles = `
        @media print {
            body * {
                visibility: hidden;
            }
            #po-printable, #po-printable * {
                visibility: visible;
            }
            #po-printable {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
                background: white;
            }
            @page {
                margin: 0;
            }
        }
    `;

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <style>{printStyles}</style>

            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-8 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-[24px] font-bold text-slate-900 uppercase tracking-tight">Purchase Order #{purchase.id}</h1>
                            <span className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border ${getStatusColor(purchase.status)}`}>
                                {purchase.status}
                            </span>
                        </div>
                        <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tight flex items-center gap-4 mt-1">
                            <span className="text-slate-700">{purchase.supplierId || 'Unknown Vendor'}</span>
                            <span className="text-slate-300">•</span>
                            <span>{new Date(purchase.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handlePreview('PO', purchaseWithVendor)} className="p-3 hover:bg-blue-50 bg-blue-50/30 border border-blue-200/60 rounded-2xl text-blue-600 transition-all shadow-sm" title="Preview PDF">
                            <Eye size={20} />
                        </button>
                        <button onClick={handleDownloadPDF} className="p-3 hover:bg-slate-50 bg-slate-100/50 border border-slate-200/60 rounded-2xl text-slate-600 transition-all shadow-sm" title="Download PDF">
                            <Download size={20} />
                        </button>
                        <button onClick={onClose} className="p-3 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded-2xl transition-all">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 px-8 bg-white shrink-0 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'Overview', label: 'Order Overview', icon: FileText },
                        { id: 'Landing', label: 'Landing Costs', icon: Ship },
                        { id: 'Related', label: 'Audit Chain', icon: LucideHistory }
                    ].map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-6 py-4 text-[10px] font-bold uppercase tracking-tight border-b-2 transition-all flex items-center gap-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-800'}`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-slate-50/30 p-10 custom-scrollbar">
                    {activeTab === 'Overview' && (
                        <div id="po-printable" className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-300">
                            {/* Summary Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Supplier Info */}
                                <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm p-8 flex flex-col justify-between group hover:shadow-lg transition-all">
                                    <div className="flex items-start justify-between">
                                        <div className="p-4 bg-slate-50 text-slate-400 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                            <Building2 size={24} />
                                        </div>
                                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border ${getStatusColor(purchase.status)}`}>
                                            {purchase.status}
                                        </div>
                                    </div>
                                    <div className="mt-8">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Supplier Entity</p>
                                        <h3 className="text-xl font-bold text-slate-900 leading-tight">{(suppliers || []).find(s => s.id === purchase.supplierId)?.name || 'Unknown Entity'}</h3>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {purchase.paymentStatus !== 'Paid' && purchase.status !== 'Draft' && purchase.status !== 'Cancelled' && onPayment && (
                                                <button
                                                    onClick={() => onPayment(purchase)}
                                                    className="flex-1 bg-emerald-600 text-white rounded-3xl font-bold uppercase tracking-tight text-[10px] py-2 px-4 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                                                >
                                                    Record Payment
                                                </button>
                                            )}
                                            {(purchase.status === 'Ordered' || purchase.status === 'Partially Received') && (
                                                <button onClick={() => onReceive(purchase.id)} className="flex-1 bg-blue-600 text-white rounded-3xl font-bold uppercase tracking-tight text-[10px] py-2 px-4 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">
                                                    Receive Goods
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Factory Price</div>
                                    <div className="text-[24px] font-bold text-slate-900 finance-nums">{currency}{(purchase.total || 0).toLocaleString()}</div>
                                </div>

                                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
                                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tight mb-1">Landed Total</div>
                                    <div className="text-[24px] font-bold finance-nums">{currency}{((purchase.total || 0) + (landingTotal || 0)).toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Addresses */}
                            <div className="grid grid-cols-2 gap-12 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-4 flex items-center gap-2"><Landmark size={14} /> Vendor Origin</h3>
                                    <div className="text-[13px]">
                                        <div className="font-bold text-slate-900">{purchaseWithVendor.supplierName || purchase.supplierId}</div>
                                        <div className="whitespace-pre-wrap text-slate-500 mt-2 leading-relaxed">{purchaseWithVendor.vendorAddress || ''}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-4 flex items-center justify-end gap-2">Shipment Destination <Package size={14} /></h3>
                                    <div className="text-[13px]">
                                        <div className="font-bold text-slate-900">{companyConfig.companyName}</div>
                                        <div className="text-slate-500 mt-2 leading-relaxed">{companyConfig.addressLine1}, {companyConfig.city}</div>
                                        <div className="mt-4 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 inline-block uppercase tracking-tight">Expected: {purchase.expectedDate ? new Date(purchase.expectedDate).toLocaleDateString() : 'N/A'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Line Items */}
                            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden relative">
                                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                                    <FileText size={16} className="text-slate-400" />
                                    <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-tight">Order Specification</h3>
                                </div>
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50/50">
                                        <tr>
                                            <th className="table-header p-6">Item Identity</th>
                                            <th className="table-header p-6 text-center">Qty</th>
                                            <th className="table-header p-6 text-center">Status</th>
                                            <th className="table-header p-6 text-right">Factory</th>
                                            <th className="table-header p-6 text-right">Extended</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(purchase.items || []).map((item, idx) => {
                                            const product = (inventory || []).find(i => i.id === item.itemId);
                                            return (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="table-body-cell p-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 bg-slate-100 rounded-2xl overflow-hidden shrink-0 border border-slate-200 group-hover:border-blue-300 transition-colors">
                                                                <OfflineImage src={product?.image} alt={item.name} className="w-full h-full object-cover" fallback={<Package size={20} className="text-slate-300 m-auto" />} />
                                                            </div>
                                                            <div>
                                                                <div className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{item.name}</div>
                                                                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-tight">
                                                                    <DocLink
                                                                        docNumber={item.itemId}
                                                                        targetPage="/inventory"
                                                                        rowId={`item-${item.itemId}`}
                                                                        currentPage={location.pathname}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="table-body-cell p-6 text-center font-bold text-slate-700 finance-nums">{item.quantity || 0}</td>
                                                    <td className="table-body-cell p-6 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border ${item.receivedQty === item.quantity ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                            {item.receivedQty ? `Recvd: ${item.receivedQty}` : 'Pending'}
                                                        </span>
                                                    </td>
                                                    <td className="table-body-cell p-6 text-right font-bold text-slate-600 finance-nums">{currency}{(item.cost || 0).toFixed(2)}</td>
                                                    <td className="table-body-cell p-6 text-right font-bold text-slate-900 finance-nums">{currency}{((item.cost || 0) * (item.quantity || 0)).toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Burden Summary on Overview */}
                            {purchase.landingCosts && purchase.landingCosts.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden animate-in fade-in">
                                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                                        <Ship size={16} className="text-blue-500" />
                                        <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-tight">Surcharge Capitalization</h3>
                                    </div>
                                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {purchase.landingCosts.map(cost => (
                                            <div key={cost.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">{cost.category}</p>
                                                <p className="text-[13px] font-bold text-slate-900 finance-nums">{currency}{(cost.amount || 0).toLocaleString()}</p>
                                                <p className="text-[10px] text-slate-400 truncate mt-1">{cost.description || 'Estimated burden'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'Landing' && (
                        <div className="max-w-5xl mx-auto">
                            <LandingCostAllocation
                                purchase={purchase}
                                onUpdate={handleUpdateLandingCosts}
                            />
                        </div>
                    )}

                    {activeTab === 'Related' && (
                        <div className="max-w-3xl mx-auto space-y-4 animate-in fade-in duration-300">
                            {linkedDocs.length > 0 ? (
                                linkedDocs.map((doc, i) => (
                                    <div key={i} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-3xl hover:shadow-lg transition-all cursor-pointer group">
                                        <div className="flex items-center gap-5">
                                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <div className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">{doc.type} #{doc.id}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">{new Date(doc.date).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="px-4 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-tight rounded-full border border-slate-200">{doc.status}</span>
                                            <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[3rem] text-slate-300">
                                    <LucideHistory size={48} className="mx-auto mb-4 opacity-10" />
                                    <p className="font-bold text-[10px] uppercase tracking-tight">No linked operations detected</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrderDetail;
