import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, ArrowRight, Edit2, Printer, Activity, Package, DollarSign,
    TrendingUp, AlertTriangle, Factory, Truck, ShoppingCart,
    Calendar, FileText, Layers, BarChart3, ArrowRightLeft, X, Sparkles, Loader2, Recycle, ClipboardCheck, Calculator, ShieldCheck, Trash2, TrendingDown, Award, PieChart as PieChartIcon, RefreshCw
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Item, Sale, Purchase, ProductionBatch, WorkOrder } from '../../../types';
import { useData } from '../../../context/DataContext';
import { OfflineImage } from '../../../components/OfflineImage';
import { generateAIResponse } from '../../../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import { generateNextId } from '../../../utils/helpers';


interface ProductDetailsProps {
    item: Item;
    onBack: () => void;
    onEdit: (item: Item) => void;
    onAdjust: (item: Item) => void;
    onUpdate?: (item: Item) => void;
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ item, onBack, onEdit, onAdjust, onUpdate }) => {
    const { sales, purchases, boms, batches, workOrders, companyConfig, isOnline, inventory, addPurchase, notify, updateItem, recalculatePrice } = useData();
    const navigate = useNavigate();
    const currency = companyConfig.currencySymbol;
    const [activeTab, setActiveTab] = useState<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Stock Log' | 'Analytics' | 'Security'>('Overview');
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [selectedVariantFilter, setSelectedVariantFilter] = useState<string>('all');
    const [isRepricing, setIsRepricing] = useState(false);

    // Variant Detection
    const hasVariants = item.isVariantParent && item.variants && item.variants.length > 0;
    const variants = item.variants || [];
    const normalizedItemType = String(item.type || '');
    const supportsStockRecords = normalizedItemType === 'Stationery' || normalizedItemType === 'Raw Material' || normalizedItemType === 'Material';
    const visibleTabs = useMemo(() => {
        const baseTabs: Array<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Analytics' | 'Security'> = [
            'Overview',
            'Variants',
            'Logistics',
            'Sales History',
            'Purchase History',
            'Analytics',
            'Security'
        ];

        if (supportsStockRecords) {
            return [...baseTabs.slice(0, 5), 'Stock Log', ...baseTabs.slice(5)] as Array<'Overview' | 'Variants' | 'Logistics' | 'Sales History' | 'Purchase History' | 'Stock Log' | 'Analytics' | 'Security'>;
        }

        return baseTabs;
    }, [supportsStockRecords]);

    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab('Overview');
        }
    }, [activeTab, visibleTabs]);

    // Calculate aggregated stock from variants
    const variantTotalStock = useMemo(() => {
        if (!supportsStockRecords) return 0;
        if (!hasVariants) return item.stock;
        return variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    }, [hasVariants, item.stock, supportsStockRecords, variants]);

    // Variant Sales Analytics
    const variantSalesData = useMemo(() => {
        if (!hasVariants) return [];

        const variantStats: Record<string, { unitsSold: number; revenue: number; name: string; sku: string; stock: number; cost: number; price: number }> = {};

        // Initialize all variants
        variants.forEach(v => {
            variantStats[v.id] = {
                unitsSold: 0,
                revenue: 0,
                name: v.name,
                sku: v.sku,
                stock: supportsStockRecords ? (v.stock || 0) : 0,
                cost: v.cost || 0,
                price: v.price || 0
            };
        });

        // Aggregate sales by variant
        sales.forEach(sale => {
            sale.items.forEach(saleItem => {
                // Check if this sale item matches a variant (by variant ID or SKU match)
                const variant = variants.find(v => v.id === saleItem.id || v.sku === saleItem.sku || saleItem.id?.includes(v.id));
                if (variant && variantStats[variant.id]) {
                    variantStats[variant.id].unitsSold += saleItem.quantity || 0;
                    variantStats[variant.id].revenue += (saleItem.price || 0) * (saleItem.quantity || 0);
                }
            });
        });

        return Object.entries(variantStats).map(([id, data]) => ({
            id,
            ...data,
            profit: data.revenue - (data.unitsSold * data.cost),
            margin: data.revenue > 0 ? ((data.revenue - (data.unitsSold * data.cost)) / data.revenue) * 100 : 0
        })).sort((a, b) => b.unitsSold - a.unitsSold);
    }, [hasVariants, sales, supportsStockRecords, variants]);

    // Top performing variant
    const topVariant = variantSalesData.length > 0 ? variantSalesData[0] : null;

    // Variant Stock Distribution for Pie Chart
    const variantStockChartData = useMemo(() => {
        if (!hasVariants || !supportsStockRecords) return [];
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
        return variants.map((v, idx) => ({
            name: v.name,
            value: v.stock || 0,
            color: colors[idx % colors.length]
        }));
    }, [hasVariants, supportsStockRecords, variants]);

    // Variant Sales Chart Data
    const variantSalesChartData = useMemo(() => {
        return variantSalesData.slice(0, 10).map(v => ({
            name: v.name.length > 15 ? v.name.substring(0, 15) + '...' : v.name,
            'Units Sold': v.unitsSold,
            'Revenue': v.revenue
        }));
    }, [variantSalesData]);

    // AI State
    const [aiPriceSuggestion, setAiPriceSuggestion] = useState('');
    const [isAiPricingLoading, setIsAiPricingLoading] = useState(false);

    const handlePrintLabel = () => {
        const printContent = document.getElementById('product-label-printable');
        if (printContent) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
          <html>
            <head>
              <title>Print Label</title>
              <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .label { border: 2px solid black; padding: 20px; border-radius: 10px; width: 300px; }
                .title { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 40px; text-align: center; margin: 15px 0; }
                .footer { display: flex; justify-content: space-between; align-items: flex-end; }
                .sku { font-family: monospace; font-size: 14px; font-weight: bold; }
                .price { font-size: 24px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="label">
                <div class="title">${item.name}</div>
                <div class="barcode">||| |||| || |||||| |||</div>
                <div class="footer">
                  <div class="sku">${item.sku}</div>
                  <div class="price">${currency}${(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</div>
                </div>
              </div>
              <script>
                window.onload = () => {
                  window.print();
                  window.close();
                };
              </script>
            </body>
          </html>
        `);
                printWindow.document.close();
            }
        }
    };

    // --- Logic Updates ---

    const calculateWastePercent = () => {
        let totalUsed = 0;
        let totalWasted = 0;

        (workOrders as WorkOrder[]).forEach(wo => {
            wo.logs?.forEach(log => {
                if (log.materialId === item.id) {
                    if (log.action === 'Complete' || log.action === 'Log Waste') {
                        const qty = log.qtyProcessed || 0;
                        if (log.action === 'Log Waste') totalWasted += qty;
                        else totalUsed += qty;
                    }
                }
            });
        });

        if (totalUsed + totalWasted === 0) return 0;
        return (totalWasted / (totalUsed + totalWasted)) * 100;
    };

    const wastePct = useMemo(() => calculateWastePercent(), [workOrders, item.id]);

    // 1. Inventory Logic
    const stockOnOrder = purchases
        .filter(p => supportsStockRecords && (p.status === 'Ordered' || p.status === 'Partially Received'))
        .reduce((sum, p) => {
            const line = p.items.find(i => i.itemId === item.id);
            return sum + (line ? (line.quantity - (line.receivedQty || 0)) : 0);
        }, 0);

    const stockAllocated = workOrders
        .filter(wo => supportsStockRecords && ['Scheduled', 'In Progress'].includes(wo.status))
        .reduce((sum, wo) => {
            const bom = boms.find(b => b.id === wo.bomId);
            const comp = bom?.components.find(c => c.materialId === item.id);
            if (comp) {
                return sum + (comp.quantity * (wo.quantityPlanned - wo.quantityCompleted));
            }
            return sum;
        }, 0);

    const stockAvailable = supportsStockRecords ? item.stock - stockAllocated : 0;

    // Logistics & Supply Chain Info
    const logisticsData = [
        { label: 'Bin Location', value: item.binLocation || 'Not Assigned', icon: Package, color: 'text-slate-600' },
        { label: 'QC Status', value: item.qcStatus || 'Passed', icon: ClipboardCheck, color: item.qcStatus === 'Failed' ? 'text-red-600' : 'text-green-600' },
        { label: 'Lead Time', value: `${item.leadTimeDays || 0} Days`, icon: Calendar, color: 'text-blue-600' },
        { label: 'MOQ', value: `${item.minOrderQty || 0} ${item.unit}`, icon: ShoppingCart, color: 'text-purple-600' },
        { label: 'Reorder Point', value: `${item.reorderPoint || 0} ${item.unit}`, icon: AlertTriangle, color: 'text-orange-600' },
        { label: 'Manufacturer', value: item.manufacturer || 'N/A', icon: Factory, color: 'text-slate-600' },
    ];

    // 2. Financials
    const lastPurchase = purchases
        .filter(p => p.items.some(i => i.itemId === item.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const lastCost = lastPurchase?.items.find(i => i.itemId === item.id)?.cost || item.cost || 0;

    const netSellingPrice = item.type === 'Raw Material' ? item.cost : item.price;

    const margin = netSellingPrice > 0 ? ((netSellingPrice - lastCost) / netSellingPrice) * 100 : 0;

    const handleCreatePO = () => {
        const id = generateNextId('PO', purchases, companyConfig);
        addPurchase({
            id,
            date: new Date().toISOString(),
            supplierId: item.preferredSupplierId || 'SUP-0001',
            items: [{ itemId: item.id, name: item.name, quantity: item.minStockLevel || 100, cost: item.cost || 0, receivedQty: 0 }],
            total: (item.cost || 0) * (item.minStockLevel || 100),
            status: 'Draft'
        });
        notify(`Draft PO ${id} created for ${item.name}`, 'success');
        navigate('/purchases');
    };

    const handleRecalculatePrice = async () => {
        if (typeof recalculatePrice !== 'function') return;
        setIsRepricing(true);
        try {
            const updated = await recalculatePrice(item.id);
            if (updated && onUpdate) {
                onUpdate(updated);
            }
        } finally {
            setIsRepricing(false);
        }
    };

    // 3. Activity Timeline
    const stockLog = useMemo(() => {
        if (!supportsStockRecords) return [];
        const events: any[] = [];
        sales.forEach(s => {
            const line = s.items.find(i => i.id === item.id);
            if (line) {
                events.push({
                    date: s.date, type: 'Sale', ref: s.id, qty: -line.quantity,
                    price: line.price, entity: s.customerName, details: `Sold ${line.quantity} units`
                });
            }
        });
        purchases.forEach(p => {
            const line = p.items.find(i => i.itemId === item.id);
            if (line) {
                events.push({
                    date: p.date, type: 'Purchase', ref: p.id, qty: line.quantity,
                    price: line.cost, entity: p.supplierId, details: `Purchased ${line.quantity} units`
                });
            }
        });
        batches.forEach(b => {
            const bom = boms.find(bm => bm.id === b.bomId);
            if (bom?.productId === item.id) {
                events.push({
                    date: b.date, type: 'Production', ref: b.id, qty: b.quantityProduced,
                    price: b.unitCost, entity: 'Manufacturing', details: `Produced ${b.quantityProduced} units`
                });
            } else {
                const comp = bom?.components.find(c => c.materialId === item.id);
                if (comp) {
                    events.push({
                        date: b.date, type: 'Consumption', ref: b.id, qty: -(comp.quantity * b.quantityProduced),
                        price: item.cost, entity: 'Manufacturing', details: `Used in ${b.productName}`
                    });
                }
            }
        });
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [batches, boms, item.cost, item.id, purchases, sales, supportsStockRecords]);

    const salesHistory = useMemo(() => stockLog.filter(l => l.type === 'Sale'), [stockLog]);
    const purchaseHistory = useMemo(() => stockLog.filter(l => l.type === 'Purchase'), [stockLog]);

    // 4. Profitability
    const itemSales = sales.flatMap(s => s.items.filter(i => i.id === item.id));
    const totalGrossRevenue = itemSales.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const totalNetRevenue = totalGrossRevenue;
    const totalUnitsSold = itemSales.reduce((sum, i) => sum + i.quantity, 0);
    const estCOGS = totalUnitsSold * lastCost;
    const grossProfit = totalNetRevenue - estCOGS;
    const averageVariantPrice = variants.length > 0
        ? variants.reduce((sum, variant) => sum + (variant.price || 0), 0) / variants.length
        : 0;
    const variantPriceBands = [...variants]
        .sort((a, b) => (b.price || 0) - (a.price || 0))
        .slice(0, 6);

    const linkedBom = boms.find(b => b.productId === item.id);

    // --- AI Suggestion Logic Upgrade ---
    const handleAiPriceSuggestion = async () => {
        if (!isOnline) return;
        setIsAiPricingLoading(true);

        let actualBomCost = 0;
        let bomDetails = "N/A";

        if (linkedBom) {
            actualBomCost = linkedBom.components.reduce((sum, c) => {
                const mat = inventory.find(inv => inv.id === c.materialId);
                return sum + (c.quantity * (mat?.cost || mat?.price || 0));
            }, 0);
            bomDetails = linkedBom.components.map(c => {
                const mat = inventory.find(inv => inv.id === c.materialId);
                return `${c.quantity}x ${mat?.name} (@${mat?.cost})`;
            }).join(", ");
        } else {
            actualBomCost = lastCost;
        }

        const prompt = `
      Product: ${item.name}
      Current Selling Price: ${item.price}
      Raw Cost Calculation: ${linkedBom ? 'Calculated from BOM' : 'Based on Last Purchase Cost'}
      Components Involved: ${bomDetails}
      Total Calculated Material Cost: ${actualBomCost}
      Labor Component: ${linkedBom ? linkedBom.laborCost : 0}
      Actual Historical Waste/Scrap Rate for this item: ${(wastePct || 0).toFixed(1)}%
      
      Using these PRECISE figures, suggest an optimal selling price range. 
      Factor in the waste percentage as a direct overhead cost. 
      Ensure the suggested price maintains a minimum net profit margin of 25%.
      Provide a brief justification for the suggestion.
      `;

        const response = await generateAIResponse(prompt, "You are a Pricing Strategy Expert.");
        setAiPriceSuggestion(response);
        setIsAiPricingLoading(false);
    };

    const chartData = useMemo(() => {
        const data: Record<string, number> = {};
        salesHistory.forEach(t => {
            const d = new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            data[d] = (data[d] || 0) + Math.abs(t.qty);
        });
        return Object.entries(data).map(([name, value]) => ({ name, value })).reverse();
    }, [salesHistory]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50 animate-fadeIn relative font-normal">
            {/* Label Modal */}
            {showLabelModal && (
                <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95 border border-white/50">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">Print Label Preview</h3>
                            <button onClick={() => setShowLabelModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div id="product-label-printable" className="border-2 border-black p-6 rounded-xl mb-6 bg-white text-left shadow-sm">
                            <h4 className="font-bold text-xl text-black mb-2 line-clamp-2">{item.name}</h4>
                            <div className="my-3 font-barcode text-4xl tracking-widest text-center opacity-80">||| |||| || |||||| |||</div>
                            <div className="flex justify-between items-end mt-2">
                                <p className="font-mono text-sm font-bold">{item.sku}</p>
                                <p className="font-bold text-2xl">{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowLabelModal(false)} className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-bold hover:bg-slate-50 text-sm">Cancel</button>
                            <button
                                onClick={handlePrintLabel}
                                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-200"
                            >
                                <Printer size={16} />
                                Print
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Header Section */}
            <div className="bg-white/70 backdrop-blur-xl border-b border-slate-200/60 px-6 py-4">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">{item.name}</h1>
                                {item.isProtected && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white border border-slate-900 uppercase tracking-wider">
                                        <ShieldCheck size={10} /> Protected
                                    </span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${item.type === 'Product' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                    {item.type}
                                </span>
                            </div>
                            <div className="text-[12px] text-slate-500 flex items-center gap-3 mt-1">
                                <span className="font-mono bg-slate-100/50 px-1.5 rounded">{item.sku}</span>
                                <span>•</span>
                                <span>{item.category}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {supportsStockRecords && (
                            <button onClick={() => onAdjust(item)} className="zoho-button-secondary px-3 py-1.5 flex items-center gap-1.5">
                                <ArrowRightLeft size={14} /> Adjust
                            </button>
                        )}
                        <button onClick={() => onEdit(item)} className="zoho-button-secondary px-3 py-1.5 flex items-center gap-1.5">
                            <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => setShowLabelModal(true)} className="zoho-button-secondary p-1.5" title="Print Label">
                            <Printer size={16} />
                        </button>
                        {item.isProtected ? (
                            <div
                                className="p-1.5 text-slate-400 bg-slate-100 border border-slate-200 rounded cursor-not-allowed"
                                title="This core system item cannot be deleted"
                            >
                                <Trash2 size={16} className="opacity-50" />
                            </div>
                        ) : (
                            <button
                                className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-100 rounded shadow-sm transition-colors"
                                title="Delete Item"
                                onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
                                        // Handle delete logic - usually passed down or via context
                                        notify(`${item.name} deleted successfully`, 'success');
                                        onBack();
                                    }
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {supportsStockRecords ? (
                        <>
                            <div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                                <div className="text-label uppercase mb-1 tracking-wider">Available Stock</div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-[20px] font-black finance-nums ${stockAvailable <= (item.minStockLevel || 0) ? 'text-red-600' : 'text-slate-900'}`}>
                                        {stockAvailable}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium">{item.unit}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 finance-nums">Total On Hand: {item.stock}</div>
                            </div>

                            <div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                                <div className="text-label uppercase mb-1 tracking-wider">Allocated / On Order</div>
                                <div className="flex justify-between items-center mt-1">
                                    <div className="text-center">
                                        <div className="text-[13px] font-bold text-amber-600 finance-nums">{stockAllocated}</div>
                                        <div className="text-[9px] text-slate-400 font-medium">Reserved</div>
                                    </div>
                                    <div className="w-px h-6 bg-slate-200/50"></div>
                                    <div className="text-center">
                                        <div className="text-[13px] font-bold text-blue-600 finance-nums">{stockOnOrder}</div>
                                        <div className="text-[9px] text-slate-400 font-medium">Inbound</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                                <div className="text-label uppercase mb-1 tracking-wider">Stock Records</div>
                                <div className="text-[20px] font-black text-slate-900">Disabled</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">This {item.type.toLowerCase()} is price-tracked only.</div>
                            </div>

                            <div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                                <div className="text-label uppercase mb-1 tracking-wider">Inventory Policy</div>
                                <div className="text-[13px] font-bold text-slate-700">No stock log or quantity adjustments</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">Use variants and pricing only.</div>
                            </div>
                        </>
                    )}

<div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                        <div className="text-label uppercase mb-1 tracking-wider">Pricing</div>
                        <div className="flex justify-between text-[12px] mt-1">
                            <span className="text-slate-500 font-medium">Last Cost:</span>
                            <span className="font-bold text-slate-700 finance-nums">{currency}{(lastCost || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[12px] mt-0.5">
                            <span className="text-slate-500 font-medium">{item.type === 'Raw Material' ? 'Base Cost:' : 'Price (Inc):'}</span>
                            <span className={`font-black finance-nums ${(item.pricingConfig as any)?.manualOverride ? 'text-blue-600 underline decoration-dotted' : 'text-slate-900'}`}>{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</span>
                        </div>
                        {(item.pricingConfig as any)?.manualOverride && (
                            <div className="mt-2 text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-medium">
                                Manual Override Active
                            </div>
                        )}
                    </div>

                    <div className="glass-card p-4 rounded-2xl flex flex-col justify-center border border-white/60">
                        <div className="text-label uppercase mb-1 tracking-wider">Manufacturing Loss</div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`text-[20px] font-black finance-nums ${(wastePct || 0) > 10 ? 'text-red-600' : 'text-emerald-600'}`}>{(wastePct || 0).toFixed(1)}%</div>
                            <Recycle size={14} className={(wastePct || 0) > 10 ? 'text-red-500' : 'text-emerald-500'} />
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5 font-medium">Historical Scrap Rate</div>
                    </div>
                </div>
            </div>

            {/* 2. Alerts Section */}
            {(supportsStockRecords && (item.stock <= (item.minStockLevel || 0) || stockAvailable < 0) && !((item as any).printConsumptionEnabled)) && (
                <div className="px-6 py-3 bg-red-50/80 backdrop-blur border-b border-red-100 flex items-center gap-3 text-xs text-red-800">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="font-bold">Low Stock Warning:</span>
                    Available stock below min level ({item.minStockLevel} {item.unit}).
                    <button
                        onClick={handleCreatePO}
                        className="ml-auto text-[10px] bg-white/50 hover:bg-white px-3 py-1 rounded-lg font-bold text-red-900 transition-colors border border-red-100 shadow-sm"
                    >
                        Create PO
                    </button>
                </div>
            )}

            {/* Variant Badge in Header */}
            {hasVariants && (
                <div className="px-6 py-2 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3">
                    <Layers size={14} className="text-blue-600" />
                    <span className="text-[12px] font-bold text-blue-700">
                        This product has {variants.length} variant{variants.length > 1 ? 's' : ''}
                    </span>
                    {supportsStockRecords ? (
                        <span className="text-[11px] text-blue-500">
                            Total Stock: {variantTotalStock.toLocaleString()} {item.unit}
                        </span>
                    ) : (
                        <span className="text-[11px] text-blue-500">
                            Stock records are disabled for {item.type.toLowerCase()} items
                        </span>
                    )}
                    {topVariant && (
                        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                            <Award size={12} /> Top Seller: {topVariant.name} ({topVariant.unitsSold} units)
                        </span>
                    )}
                </div>
            )}

            {/* 3. Tabs Navigation */}
            <div className="flex gap-1 px-6 pt-4 bg-transparent overflow-x-auto no-scrollbar">
                {visibleTabs.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 text-[13px] font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === tab
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                            }`}
                    >
                        {tab}
                        {tab === 'Variants' && hasVariants && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px]">{variants.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* 4. Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {activeTab === 'Overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60 space-y-4">
                            <h3 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider"><Package size={16} className="text-blue-500" /> Item Identity</h3>
                            <div className="grid grid-cols-2 gap-4 text-[13px]">
                                <div><div className="text-slate-400 font-bold mb-1 uppercase text-[10px]">SKU / Code</div><div className="font-mono font-medium text-slate-700">{item.sku}</div></div>
                                <div><div className="text-slate-400 font-bold mb-1 uppercase text-[10px]">Unit of Measure</div><div className="font-medium text-slate-700">{item.unit}</div></div>
                                <div className="col-span-2"><div className="text-slate-400 font-bold mb-1 uppercase text-[10px]">Description</div><div className="text-slate-600 leading-relaxed">{item.description || 'No description provided.'}</div></div>
                            </div>
                        </div>
                        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60 space-y-4">
                            <h3 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider"><DollarSign size={16} className="text-emerald-500" /> Current Pricing</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-slate-100">
                                    <span className="text-[13px] font-bold text-slate-600">{item.type === 'Raw Material' ? 'Material Cost' : 'Retail Price (Inc)'}</span>
                                    <span className="font-bold text-slate-900 text-[13px] finance-nums">{currency}{(item.type === 'Raw Material' ? item.cost : item.price || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 border-b border-slate-100/50 last:border-0">
                                    <span className="text-[13px] text-slate-500 font-medium">Net Price (Excl)</span>
                                    <span className="font-medium text-slate-700 text-[13px] finance-nums">{currency}{(netSellingPrice || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Variant Quick Overview (shown in Overview tab if has variants) */}
                        {hasVariants && (
                            <div className="md:col-span-2 bg-gradient-to-br from-blue-50 to-indigo-50/50 p-6 rounded-2xl border border-blue-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-label font-bold text-blue-900 flex items-center gap-2 uppercase tracking-wider">
                                        <Layers size={16} /> Variant Summary
                                    </h3>
                                    <button
                                        onClick={() => setActiveTab('Variants')}
                                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                    >
                                        View All Variants <ArrowRightLeft size={12} className="rotate-180" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {variants.slice(0, 4).map((v, idx) => (
                                        <div key={v.id} className="bg-white/70 p-4 rounded-xl border border-blue-100">
                                            <div className="text-[11px] font-bold text-slate-500 truncate">{v.name}</div>
                                            {supportsStockRecords ? (
                                                <>
                                                    <div className="text-[18px] font-black text-slate-900 finance-nums mt-1">{v.stock || 0}</div>
                                                    <div className="text-[10px] text-slate-400">in stock</div>
                                                    <div className="text-[12px] font-bold text-blue-600 mt-2 finance-nums">{currency}{(v.price || 0).toFixed(2)}</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-[18px] font-black text-blue-600 finance-nums mt-1">{currency}{(v.price || 0).toFixed(2)}</div>
                                                    <div className="text-[10px] text-slate-400">selling price</div>
                                                    <div className="text-[11px] text-slate-500 mt-2 truncate">
                                                        {Object.values(v.attributes || {}).join(' / ') || 'No attribute'}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {variants.length > 4 && (
                                        <div className="bg-white/50 p-4 rounded-xl border border-blue-100 flex items-center justify-center">
                                            <span className="text-[12px] text-blue-600 font-bold">+{variants.length - 4} more</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* VARIANTS TAB - Full Variant Analytics */}
                {activeTab === 'Variants' && (
                    <div className="space-y-6">
                        {!hasVariants ? (
                            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 p-12 text-center">
                                <Layers size={48} className="mx-auto text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-700 mb-2">No Variants Configured</h3>
                                <p className="text-[13px] text-slate-500 mb-4">This product doesn't have any variants yet.</p>
                                <button
                                    onClick={() => onEdit(item)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                                >
                                    Add Variants
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Variant Performance Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Variants</div>
                                        <div className="text-[24px] font-black text-slate-900">{variants.length}</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{supportsStockRecords ? 'Combined Stock' : 'Average Price'}</div>
                                        <div className="text-[24px] font-black text-blue-600 finance-nums">
                                            {supportsStockRecords ? variantTotalStock.toLocaleString() : `${currency}${averageVariantPrice.toFixed(2)}`}
                                        </div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Units Sold</div>
                                        <div className="text-[24px] font-black text-emerald-600 finance-nums">{variantSalesData.reduce((sum, v) => sum + v.unitsSold, 0).toLocaleString()}</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Revenue</div>
                                        <div className="text-[24px] font-black text-blue-600 finance-nums">{currency}{variantSalesData.reduce((sum, v) => sum + v.revenue, 0).toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* Top Performer Badge */}
                                {topVariant && topVariant.unitsSold > 0 && (
                                    <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-4">
                                        <div className="p-3 bg-emerald-100 rounded-xl">
                                            <Award size={24} className="text-emerald-600" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Top Performing Variant</div>
                                            <div className="text-[16px] font-black text-slate-900">{topVariant.name}</div>
                                        </div>
                                        <div className="ml-auto text-right">
                                            <div className="text-[20px] font-black text-emerald-600 finance-nums">{topVariant.unitsSold.toLocaleString()}</div>
                                            <div className="text-[10px] text-slate-500">units sold</div>
                                        </div>
                                    </div>
                                )}

                                {/* Variant Charts Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {supportsStockRecords ? (
                                        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                                            <h4 className="text-label font-bold mb-4 flex items-center gap-2 uppercase tracking-wider">
                                                <PieChartIcon size={14} className="text-blue-500" /> Stock Distribution
                                            </h4>
                                            <div style={{ width: '100%', height: 200, minHeight: 150 }}>
                                                <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                                    <PieChart>
                                                        <Pie
                                                            data={variantStockChartData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={50}
                                                            outerRadius={80}
                                                            paddingAngle={2}
                                                            dataKey="value"
                                                        >
                                                            {variantStockChartData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-4">
                                                {variantStockChartData.slice(0, 6).map((entry, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                                        <span className="text-slate-600 truncate max-w-[80px]">{entry.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                                            <h4 className="text-label font-bold mb-4 flex items-center gap-2 uppercase tracking-wider">
                                                <DollarSign size={14} className="text-blue-500" /> Variant Pricing
                                            </h4>
                                            <div className="space-y-3">
                                                {variantPriceBands.length > 0 ? variantPriceBands.map((variant) => (
                                                    <div key={variant.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/60 px-4 py-3">
                                                        <div>
                                                            <div className="text-[12px] font-bold text-slate-800">{variant.name}</div>
                                                            <div className="text-[10px] text-slate-400">{Object.values(variant.attributes || {}).join(' / ') || 'No attribute'}</div>
                                                        </div>
                                                        <div className="text-[13px] font-black text-blue-600 finance-nums">{currency}{(variant.price || 0).toFixed(2)}</div>
                                                    </div>
                                                )) : (
                                                    <div className="text-[13px] text-slate-400 italic">No variant pricing data yet.</div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Sales by Variant Bar Chart */}
                                    <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                                        <h4 className="text-label font-bold mb-4 flex items-center gap-2 uppercase tracking-wider">
                                            <BarChart3 size={14} className="text-blue-500" /> Sales by Variant
                                        </h4>
                                        <div style={{ width: '100%', height: 200, minHeight: 150 }}>
                                            <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                                <BarChart data={variantSalesChartData} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={100} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                                    <Bar dataKey="Units Sold" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={16} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Variant Details Table */}
                                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
                                    <div className="p-4 border-b border-slate-100">
                                        <h4 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider">
                                            <Layers size={14} className="text-blue-500" /> Variant Performance Breakdown
                                        </h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/50">
                                                    <th className="table-header py-3 px-4">Variant</th>
                                                    {supportsStockRecords && <th className="table-header py-3 px-4 text-center">Stock</th>}
                                                    <th className="table-header py-3 px-4 text-right">Cost</th>
                                                    <th className="table-header py-3 px-4 text-right">Price</th>
                                                    <th className="table-header py-3 px-4 text-right">Units Sold</th>
                                                    <th className="table-header py-3 px-4 text-right">Revenue</th>
                                                    <th className="table-header py-3 px-4 text-right">Margin</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                 {variantSalesData.map((v, idx) => {
                                                     // If this product or variant uses print consumption, we don't show low-stock warnings
                                                     const variantObj = variants.find(x => x.id === v.id) || {} as any;
                                                     const suppressedLowStock = (item as any).printConsumptionEnabled || variantObj.printConsumptionEnabled;
                                                     const isLowStock = supportsStockRecords && !suppressedLowStock && v.stock <= (item.minStockLevel || 0);
                                                    const isTopSeller = topVariant?.id === v.id;
                                                    return (
                                                        <tr key={v.id} className={`hover:bg-slate-50/50 transition-colors ${isTopSeller ? 'bg-emerald-50/30' : ''}`}>
                                                            <td className="table-body-cell py-3 px-4">
                                                                <div className="flex items-center gap-2">
                                                                    {isTopSeller && <Award size={14} className="text-emerald-500" />}
                                                                    <div>
                                                                        <div className="font-bold text-slate-800 text-[12px]">{v.name}</div>
                                                                        <div className="text-[10px] text-slate-400 font-mono">{v.sku}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {supportsStockRecords && (
                                                                <td className="table-body-cell py-3 px-4 text-center">
                                                                    <span className={`font-bold finance-nums ${isLowStock ? 'text-red-600' : 'text-slate-700'}`}>
                                                                        {v.stock.toLocaleString()}
                                                                    </span>
                                                                    {isLowStock && <AlertTriangle size={12} className="inline ml-1 text-red-500" />}
                                                                </td>
                                                            )}
                                                            <td className="table-body-cell py-3 px-4 text-right finance-nums">{currency}{v.cost.toFixed(2)}</td>
                                                            <td className="table-body-cell py-3 px-4 text-right font-bold text-blue-600 finance-nums">{currency}{v.price.toFixed(2)}</td>
                                                            <td className="table-body-cell py-3 px-4 text-right font-bold finance-nums">{v.unitsSold.toLocaleString()}</td>
                                                            <td className="table-body-cell py-3 px-4 text-right font-bold text-emerald-600 finance-nums">{currency}{v.revenue.toFixed(2)}</td>
                                                            <td className="table-body-cell py-3 px-4 text-right">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.margin >= 25 ? 'bg-emerald-100 text-emerald-700' : v.margin >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {v.margin.toFixed(1)}%
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Logistics' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {logisticsData.map((item, idx) => (
                            <div key={idx} className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60 flex items-center gap-4">
                                <div className={`p-3 rounded-2xl bg-white shadow-sm ${item.color}`}>
                                    <item.icon size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</p>
                                    <p className="text-[14px] font-black text-slate-900 finance-nums">{item.value}</p>
                                </div>
                            </div>
                        ))}

                        {/* Manufacturing & Technical Section */}
                        <div className="md:col-span-2 lg:col-span-3 bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                            <h3 className="text-label font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-widest">
                                <Activity size={16} className="text-blue-500" /> Technical & Manufacturer Data
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-4">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Manufacturer</p>
                                        <p className="text-[13px] font-bold text-slate-700">{item.manufacturer || 'None Specified'}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Part Number (MPN)</p>
                                        <p className="font-mono text-[13px] font-bold text-slate-700">{item.manufacturerPartNumber || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Expiry / Shelf Life</p>
                                        <p className="text-[13px] font-bold text-slate-700">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'Non-perishable'}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border ${item.isHazardous ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Safety Class</p>
                                        <p className={`text-[13px] font-bold ${item.isHazardous ? 'text-red-700' : 'text-emerald-700'}`}>
                                            {item.isHazardous ? 'Hazardous Material (HAZMAT)' : 'Standard / Safe'}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                                    <h4 className="text-[12px] font-bold text-blue-700 uppercase mb-4 flex items-center gap-2">
                                        <Truck size={14} /> Supply Chain Health
                                    </h4>
                                    {supportsStockRecords ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-slate-500">Reorder Level:</span>
                                                <span className="font-bold text-slate-900 finance-nums">{item.reorderPoint || 0} {item.unit}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-slate-500">Min Stock Level:</span>
                                                <span className="font-bold text-slate-900 finance-nums">{item.minStockLevel || 0} {item.unit}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-slate-500">Typical Lead Time:</span>
                                                <span className="font-bold text-blue-600 finance-nums">{item.leadTimeDays || 0} Days</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-[13px] font-bold text-slate-800">Stock records are disabled for {item.type.toLowerCase()} items.</p>
                                            <p className="text-[12px] text-slate-500">This view keeps pricing and reference data, but it won’t track stock movements, reorder levels, or quantity adjustments.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Unit Conversion (For Materials) */}
                            {item.type === 'Raw Material' && item.purchaseUnit && item.usageUnit && (
                                <div className="mt-8 pt-8 border-t border-slate-100">
                                    <h4 className="text-[12px] font-bold text-slate-900 uppercase mb-4 flex items-center gap-2">
                                        <ArrowRightLeft size={16} className="text-blue-500" /> Material Unit Conversion
                                    </h4>
                                    <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100 inline-flex items-center gap-6">
                                        <div className="text-center">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Purchased In</p>
                                            <p className="text-[13px] font-black text-slate-700">{item.purchaseUnit}</p>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <div className="text-[10px] font-black text-blue-600 mb-1">x{item.conversionRate}</div>
                                            <ArrowRight size={14} className="text-blue-400" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Used In</p>
                                            <p className="text-[13px] font-black text-slate-700">{item.usageUnit}</p>
                                        </div>
                                        <div className="ml-6 pl-6 border-l border-blue-100">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Conversion Rule</p>
                                            <p className="text-[12px] font-medium text-blue-800 italic">
                                                1 {item.purchaseUnit} contains {item.conversionRate} {item.usageUnit}s
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'Sales History' && (
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider"><ShoppingCart size={16} className="text-blue-500" /> Sales History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="table-header py-3 px-6">Date</th>
                                        <th className="table-header py-3 px-6">Reference</th>
                                        <th className="table-header py-3 px-6">Customer</th>
                                        <th className="table-header py-3 px-6 text-right">Quantity</th>
                                        <th className="table-header py-3 px-6 text-right">Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {salesHistory.length > 0 ? salesHistory.map((s, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="table-body-cell py-3 px-6">{new Date(s.date).toLocaleDateString()}</td>
                                            <td className="table-body-cell py-3 px-6 font-mono text-[11px]">{s.ref}</td>
                                            <td className="table-body-cell py-3 px-6 font-bold text-slate-700">{s.entity}</td>
                                            <td className="table-body-cell py-3 px-6 text-right font-bold finance-nums">{Math.abs(s.qty)}</td>
                                            <td className="table-body-cell py-3 px-6 text-right font-black text-blue-600 finance-nums">{currency}{(s.price || 0).toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="py-12 text-center text-slate-400 italic text-[13px]">No sales history found for this item.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Purchase History' && (
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider"><Truck size={16} className="text-emerald-500" /> Purchase History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="table-header py-3 px-6">Date</th>
                                        <th className="table-header py-3 px-6">Reference</th>
                                        <th className="table-header py-3 px-6">Supplier</th>
                                        <th className="table-header py-3 px-6 text-right">Quantity</th>
                                        <th className="table-header py-3 px-6 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {purchaseHistory.length > 0 ? purchaseHistory.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="table-body-cell py-3 px-6">{new Date(p.date).toLocaleDateString()}</td>
                                            <td className="table-body-cell py-3 px-6 font-mono text-[11px]">{p.ref}</td>
                                            <td className="table-body-cell py-3 px-6 font-bold text-slate-700">{p.entity}</td>
                                            <td className="table-body-cell py-3 px-6 text-right font-bold finance-nums">{p.qty}</td>
                                            <td className="table-body-cell py-3 px-6 text-right font-black text-emerald-600 finance-nums">{currency}{(p.price || 0).toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="py-12 text-center text-slate-400 italic text-[13px]">No purchase history found for this item.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Stock Log' && (
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-label font-bold flex items-center gap-2 uppercase tracking-wider"><Activity size={16} className="text-purple-500" /> Complete Stock Log</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="table-header py-3 px-6">Date</th>
                                        <th className="table-header py-3 px-6">Type</th>
                                        <th className="table-header py-3 px-6">Reference</th>
                                        <th className="table-header py-3 px-6">Entity / Source</th>
                                        <th className="table-header py-3 px-6 text-right">Change</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stockLog.length > 0 ? stockLog.map((log, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="table-body-cell py-3 px-6">{new Date(log.date).toLocaleDateString()}</td>
                                            <td className="table-body-cell py-3 px-6">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${log.type === 'Sale' ? 'bg-blue-50 text-blue-600' :
                                                    log.type === 'Purchase' ? 'bg-emerald-50 text-emerald-600' :
                                                        log.type === 'Production' ? 'bg-purple-50 text-purple-600' :
                                                            'bg-slate-50 text-slate-600'
                                                    }`}>
                                                    {log.type}
                                                </span>
                                            </td>
                                            <td className="table-body-cell py-3 px-6 font-mono text-[11px]">{log.ref}</td>
                                            <td className="table-body-cell py-3 px-6 text-slate-600">{log.entity}</td>
                                            <td className={`table-body-cell py-3 px-6 text-right font-bold finance-nums ${log.qty >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {log.qty > 0 ? '+' : ''}{log.qty}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="py-12 text-center text-slate-400 italic text-[13px]">No activity logs found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Analytics' && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                                <h3 className="text-label font-bold mb-6 flex items-center gap-2 uppercase tracking-wider"><BarChart3 size={16} className="text-blue-500" /> Sales Trend (Units)</h3>
                                <div style={{ width: '100%', height: 300, minHeight: 150 }}>
                                    <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} cursor={{ fill: '#f1f5f9' }} />
                                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} name="Units Sold" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-white/60">
                                <h3 className="text-label font-bold mb-6 uppercase tracking-wider">Profitability Overview</h3>
                                <div className="space-y-6 text-[13px]">
                                    <div className="flex justify-between border-b pb-2"><span className="text-slate-500">Net Revenue</span><span className="font-bold finance-nums">{currency}{(totalNetRevenue || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between border-b pb-2"><span className="text-slate-500">COGS (at Last Cost)</span><span className="font-bold finance-nums">-{currency}{(estCOGS || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between text-[14px] font-black"><span className="text-slate-900 uppercase">Gross Profit</span><span className={`finance-nums ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{currency}{(grossProfit || 0).toFixed(2)}</span></div>
                                    <div className="p-4 bg-slate-50/50 rounded-xl text-center border border-slate-100">
                                        <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Average Margin</span>
                                        <span className="text-[24px] font-black text-blue-600 finance-nums">{totalNetRevenue > 0 ? ((grossProfit / totalNetRevenue) * 100).toFixed(1) : 0}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 p-6 rounded-2xl border border-purple-100 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-label font-bold text-purple-900 flex items-center gap-2 uppercase tracking-wider"><Sparkles size={16} /> AI Optimal Price Suggestions</h3>
                                {isOnline ? (
                                    <button onClick={handleAiPriceSuggestion} disabled={isAiPricingLoading} className="bg-white border border-purple-200 text-purple-600 px-4 py-2 rounded-lg text-[12px] font-bold hover:bg-purple-50 flex items-center gap-2 transition-all">
                                        {isAiPricingLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        {isAiPricingLoading ? 'Analyzing BOM Data...' : 'Generate New Pricing'}
                                    </button>
                                ) : <span className="text-[12px] text-slate-400">Online only</span>}
                            </div>
                            {aiPriceSuggestion ? (
                                <div className="bg-white p-5 rounded-xl border border-purple-100 text-slate-700 text-[13px] prose prose-sm max-w-none leading-relaxed">
                                    <ReactMarkdown>{aiPriceSuggestion}</ReactMarkdown>
                                </div>
                            ) : <div className="text-center py-6 text-slate-400 text-[12px] italic">Uses real-time scrap rates and BOM component costs for accuracy.</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'Security' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden flex flex-col h-[600px]">
                        <AuditTimeline 
                            logs={(useData().auditLogs || []).filter((log: any) => 
                                log.entityId === item.id || 
                                (log.entityType === 'Stock' && log.entityId === item.id)
                            )} 
                            title={`Security Audit: ${item.name}`}
                            subtitle="Immutable trail of all modifications to this inventory item."
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductDetails;
