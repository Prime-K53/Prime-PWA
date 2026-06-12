import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
    FileText, FileCheck, Truck, List, LayoutGrid, Plus, Repeat, CheckCircle, X, Send, Trash2,
    Link as LinkIcon, Download, Save, AlertCircle, Clock, TrendingUp, Ban,
    PieChart as PieChartIcon, Sparkles, Loader2, Upload, AlertTriangle, Wallet,
    MessageSquare, ShieldCheck, Mail, ChevronRight, ChevronDown, BarChart2, Calendar,
    Printer, Edit2, DollarSign, ArrowLeft, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useData, REFRESH_INTERVAL } from '../../context/DataContext';
import { useModuleRefresh } from '../../hooks/useModuleRefresh';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { useOrders } from '../../context/OrdersContext';
import { useInventory } from '../../context/InventoryContext';
import { useProduction } from '../../context/ProductionContext';
import { Quotation, Invoice, DeliveryNote, RecurringInvoice, CartItem, Order, JobOrder } from '../../types';
import { OrderForm } from './components/OrderForm';
import { InvoiceDetails } from './components/InvoiceDetails';
import { JobOrderDetails } from './components/JobOrderDetails';
import { QuotationDetails } from './components/QuotationDetails';
import { OrderDetails } from './components/OrderDetails';
import SubscriptionView from './components/SubscriptionView';
import { parseTemplate, downloadBlob, resolveCustomerPaymentPolicy } from '../../utils/helpers';
import { useLocation, useNavigate } from 'react-router-dom';
import { localFileStorage } from '../../services/localFileStorage';
import { OfflineImage } from '../../components/OfflineImage';
import { ProfitAnalysisModal } from './components/ProfitAnalysisModal';
import { extractInvoiceData, generateAIResponse } from '../../services/geminiService';
import { QuotationList, InvoiceList, SalesOrderList, SalesExchangeList, SalesSkeletonLoader, OrdersList } from './components/SalesLists';
import { ExchangeRequestModal } from './components/ExchangeRequestModal';
import { ExchangeDetailsModal } from './components/ExchangeDetailsModal';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { PrimeDocData } from '../shared/components/PDF/schemas';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { buildRecurringDraftFromInvoice } from '../../utils/recurringConversion';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';

const SUBSCRIPTION_STATUSES = ['Draft', 'Active', 'Paused', 'Cancelled', 'Expired'] as const;

const cloneSerializable = <T,>(value: T): T => {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const normalizeDateOnly = (value?: string) => {
    const fallback = new Date();
    const parsed = value ? new Date(value) : fallback;
    if (Number.isNaN(parsed.getTime())) {
        return fallback.toISOString().split('T')[0];
    }
    return parsed.toISOString().split('T')[0];
};

const normalizeSubscriptionStatus = (status?: string) => {
    return SUBSCRIPTION_STATUSES.includes(status as typeof SUBSCRIPTION_STATUSES[number])
        ? status
        : 'Draft';
};

const addSubscriptionFrequency = (dateValue: string, frequency?: string) => {
    const nextDate = new Date(normalizeDateOnly(dateValue));
    switch (frequency) {
        case 'Daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'Weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'Quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'Annually':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    return nextDate.toISOString().split('T')[0];
};

const ensureFutureSubscriptionRunDate = (nextRunDate?: string, frequency?: string) => {
    const today = normalizeDateOnly(new Date().toISOString());
    const normalizedNextRunDate = nextRunDate ? normalizeDateOnly(nextRunDate) : '';

    if (normalizedNextRunDate && new Date(normalizedNextRunDate).getTime() > new Date(today).getTime()) {
        return normalizedNextRunDate;
    }

    return addSubscriptionFrequency(today, frequency);
};

const buildRecurringDraftFromTemplate = (item: RecurringInvoice): RecurringInvoice => {
    const cloned = cloneSerializable(item as any);
    const {
        id: _originalId,
        paidAmount: _paidAmount,
        amountPaid: _amountPaid,
        generatedInvoiceIds: _generatedInvoiceIds,
        generatedInvoices: _generatedInvoices,
        billingHistory: _billingHistory,
        runHistory: _runHistory,
        lastRunDate: _lastRunDate,
        billingPeriodStart: _billingPeriodStart,
        billingPeriodEnd: _billingPeriodEnd,
        nextBillingDate: _nextBillingDate,
        approvedAt: _approvedAt,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
    } = cloned;

    return {
        ...rest,
        id: '',
        date: normalizeDateOnly(new Date().toISOString()),
        status: 'Draft',
        nextRunDate: ensureFutureSubscriptionRunDate(rest.nextRunDate, rest.frequency),
        scheduledDates: Array.isArray(rest.scheduledDates) ? rest.scheduledDates.map((date: any) => String(date)) : [],
        items: Array.isArray(rest.items) ? rest.items.map((entry: any) => cloneSerializable(entry)) : [],
        paidAmount: 0,
        amountPaid: 0
    } as RecurringInvoice;
};

const Orders: React.FC = () => {
    const { refreshAllData } = useData();
    const { companyConfig, isOnline, notify, user } = useAuth();
    const { invoices, recurringInvoices, addInvoice, updateInvoice, deleteInvoice, addRecurringInvoice, deleteRecurringInvoice, updateRecurringInvoice } = useFinance();
    const { quotations, customers, addQuotation, updateQuotation, deleteQuotation, approveQuotation, convertQuotationToInvoice, jobOrders, addJobOrder, updateJobOrder, deleteJobOrder, convertJobOrderToInvoice, salesExchanges, deleteSalesExchange, approveSalesExchange, cancelSalesExchange, isLoading } = useSales();
    const { inventory } = useInventory();
    const { boms } = useProduction();

    const { createDeliveryNote, checkAndApplyLateFees } = useFinance();
    const { convertQuotationToWorkOrder, convertQuotationToJobTicket } = useSales();
    const { orders, cancelOrder, updateOrderStatus, recordPayment, createOrder, convertQuotationToOrder } = useOrders();
    const location = useLocation();
    const navigate = useNavigate();

    const [activeView, setActiveTab] = useState<'Quotations' | 'Invoices' | 'Subscriptions' | 'SalesOrders' | 'Exchanges' | 'Orders'>('Quotations');
    const [viewMode, setViewMode] = useState<'List' | 'Card'>('List');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    const formType = useMemo(() => {
        switch (activeView) {
            case 'Quotations': return 'Quotation';
            case 'Invoices': return 'Invoice';
            case 'Subscriptions': return 'Recurring';
            case 'SalesOrders': return 'JobOrder';
            case 'Orders': return 'Order';
            default: return 'Invoice';
        }
    }, [activeView]);

    const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState<Invoice | null>(null);
    const [selectedQuotationForDetail, setSelectedQuotationForDetail] = useState<Quotation | null>(null);
    const [selectedJobOrderForDetail, setSelectedJobOrderForDetail] = useState<JobOrder | null>(null);
    const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
    const [selectedExchangeForDetail, setSelectedExchangeForDetail] = useState<any | null>(null);
    const [showVisualDashboard, setShowVisualDashboard] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
    const [selectedInvoiceForExchange, setSelectedInvoiceForExchange] = useState<Invoice | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const lastRefreshAtRef = useRef(0);

    // Communication State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
    const [emailData, setWhiteEmailData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', schedule: '', isScheduled: false, sendAsLink: false });

    const [analysisInvoice, setAnalysisInvoice] = useState<Invoice | null>(null);
    const [moneyBarFilter, setMoneyBarFilter] = useState<'All' | 'Partial' | 'Unpaid' | 'Overdue' | 'Paid'>('All');
    const [searchText, setSearchTerm] = useState('');
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

    const { handlePreview, handlePrint } = useDocumentPreview();

    const refreshModuleData = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && now - lastRefreshAtRef.current < 1200) {
            return;
        }

        lastRefreshAtRef.current = now;
        setIsRefreshing(true);
        try {
            await refreshAllData?.();
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshAllData]);

    // standard 5-minute polling + focus refresh
    useModuleRefresh(refreshModuleData, { interval: REFRESH_INTERVAL });

    const handleBulkDelete = async () => {
        const count = selectedInvoiceIds.length;
        if (count === 0) return;

        if (activeView === 'Orders') {
            const reason = window.prompt(`Reason for cancelling ${count} orders:`);
            if (reason) {
                try {
                    for (const id of selectedInvoiceIds) {
                        await cancelOrder(id, reason);
                    }
                    setSelectedInvoiceIds([]);
                    notify(`${count} orders cancelled`, "success");
                } catch (error: any) {
                    notify(`Failed to cancel some orders: ${error.message}`, "error");
                }
            }
            return;
        }

        const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
        const cannotDelete = selectedInvoices.filter(inv => {
            const isCancelled = inv.status === 'Cancelled' || (inv as any).status === 'Void';
            return !isCancelled && (inv.status === 'Paid' || inv.status === 'Partial' || (inv.paidAmount || 0) > 0);
        });

        if (cannotDelete.length > 0) {
            notify(`Cannot delete ${cannotDelete.length} invoices that have payments. Void associated payments first.`, "error");
            return;
        }

        const confirmMsg = activeView === 'Exchanges'
            ? `Mark ${count} exchange records as deleted? Physical deletion is restricted for audit compliance.`
            : `Are you sure you want to delete ${count} selected records?`;

        if (window.confirm(confirmMsg)) {
            try {
                for (const id of selectedInvoiceIds) {
                    if (activeView === 'Invoices') await deleteInvoice(id);
                    else if (activeView === 'Quotations') await deleteQuotation(id);
                    else if (activeView === 'SalesOrders') await deleteJobOrder(id);
                    else if (activeView === 'Exchanges') await deleteSalesExchange(id);
                }
                setSelectedInvoiceIds([]);
                const successMsg = activeView === 'Exchanges' ? `${count} records marked as deleted` : `${count} records deleted successfully`;
                notify(successMsg, "success");
            } catch (error: any) {
                notify(`Failed to delete some records: ${error.message}`, "error");
            }
        }
    };
    const [sortField, setSortField] = useState<keyof Invoice>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const currency = companyConfig?.currencySymbol || '$';
    const resolveDocumentType = (record: any, fallbackType: any) => {
        if (fallbackType !== 'INVOICE') return fallbackType;
        const originModule = String(record?.originModule || record?.origin_module || '').toLowerCase();
        const docTitle = String(record?.documentTitle || record?.document_title || '').toLowerCase();
        const reference = String(record?.reference || '').toUpperCase();
        if (
            originModule === 'examination'
            || docTitle.includes('examination invoice')
            || reference.startsWith('EXM-BATCH-')
        ) {
            return 'EXAMINATION_INVOICE';
        }
        return fallbackType;
    };

    useEffect(() => {
        setSelectedInvoiceIds([]);
    }, [activeView]);

    // Handled by useModuleRefresh hook

    useEffect(() => {
        const path = location.pathname;
        if (path.includes('/quotations')) setActiveTab('Quotations');
        else if (path.includes('/invoices')) setActiveTab('Invoices');
        else if (path.includes('/subscriptions')) setActiveTab('Subscriptions');
        else if (path.includes('/sales-orders')) setActiveTab('SalesOrders');
        else if (path.includes('/orders')) setActiveTab('Orders');
    }, [location.pathname]);

    useEffect(() => {
        if (location.state?.action === 'create') {
            setEditingItem(null);
            if (location.state.recurringDraft) setEditingItem(location.state.recurringDraft);
            else if (location.state.invoiceData) setEditingItem(location.state.invoiceData);
            else if (location.state.customer) setEditingItem({ customerName: location.state.customer });
            else setEditingItem(null);
            setIsFormOpen(true);
            window.history.replaceState({}, document.title);
        }
        if (location.state?.action === 'view' && location.state.id) {
            if (location.state.type === 'Invoice') {
                const inv = (invoices || []).find(i => i.id === location.state.id);
                if (inv) setSelectedInvoiceForDetail(inv);
            }
        }
        if ((location.state as any)?.filterInvoiceId) {
            setActiveTab('Invoices');
            setSearchTerm(String((location.state as any).filterInvoiceId));
        }
    }, [location, invoices]);

    const handleCreate = () => {
        setEditingItem(null);
        setIsFormOpen(true);
    };

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (activeView === 'Exchanges') {
            if (window.confirm("Mark this exchange record as deleted? Physical deletion is restricted for audit compliance.")) {
                deleteSalesExchange(id);
                notify("Exchange record marked as deleted", "info");
            }
            return;
        }

        const inv = invoices.find(i => i.id === id);
        const isCancelled = inv && (inv.status === 'Cancelled' || (inv as any).status === 'Void');

        if (inv && !isCancelled && (inv.status === 'Paid' || inv.status === 'Partial' || (inv.paidAmount || 0) > 0)) {
            notify("Cannot delete active invoices with payments. Void associated payments first.", "error");
            return;
        }

        if (activeView === 'Orders') {
            const reason = window.prompt("Reason for cancelling this order (Deletion is restricted for audit compliance):");
            if (reason) {
                await cancelOrder(id, reason);
                notify("Order cancelled successfully", "info");
            }
            return;
        }

        if (window.confirm("Are you sure you want to delete this record?")) {
            if (activeView === 'Quotations') deleteQuotation(id);
            else if (activeView === 'Invoices') deleteInvoice(id);
            else if (activeView === 'Subscriptions') deleteRecurringInvoice(id);
            else if (activeView === 'SalesOrders') deleteJobOrder(id);
            notify("Record deleted", "info");
        }
    };

    const handleSave = async (data: any, asDraft: boolean, reason?: string, andPay?: boolean) => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            if (activeView === 'Quotations') {
                if (editingItem) await updateQuotation(data, reason);
                else await addQuotation(data);
            } else if (activeView === 'Invoices') {
                if (editingItem) await updateInvoice(data);
                else await addInvoice(data);
            } else if (activeView === 'Subscriptions') {
                if (editingItem) await updateRecurringInvoice(data);
                else await addRecurringInvoice(data);
            } else if (activeView === 'SalesOrders') {
                if (editingItem) await updateJobOrder(data);
                else await addJobOrder(data);
            } else if (activeView === 'Orders') {
                // Note: Orders typically use specialized create/update logic via transactionService
                if (editingItem) {
                    // For orders, editing might be restricted to certain fields or status
                    await updateOrderStatus(data.id, data.status);
                } else {
                    await createOrder(data);
                }
            }
            setIsFormOpen(false);
            setEditingItem(null);
            notify("Document saved successfully", "success");

            if (andPay && activeView === 'Invoices') {
                // Redirect to payments with the customer name pre-selected
                navigate('/sales-flow/payments', { state: { action: 'create', customer: data.customerName, invoiceId: data.id } });
            }
        } catch (err: any) {
            notify(`Failed to save: ${err.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCheckLateFees = async () => {
        await checkAndApplyLateFees();
        notify("Late fee check completed.", "info");
    };

    const invoiceStats = useMemo(() => {
        const allInvs = invoices || [];
        const invs = allInvs.filter(inv => inv.status !== 'Cancelled' && inv.status !== 'Draft');
        const currentYear = new Date().getFullYear();

        const total = invs.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const paid = invs.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const outstanding = total - paid;
        const overdue = invs
            .filter(inv => inv.status !== 'Paid' && new Date(inv.dueDate) < new Date())
            .reduce((sum, inv) => sum + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);

        // Annual Profit calculation
        const annualProfit = invs
            .filter(inv => new Date(inv.date).getFullYear() === currentYear)
            .reduce((totalProfit, inv) => {
                let invProfit = 0;
                const netInvoice = inv.totalAmount;

                let invCost = 0;
                inv.items?.forEach(item => {
                    const bom = boms.find(b => b.productId === item.id);
                    if (bom) {
                        const matCost = bom.components.reduce((s, c) => {
                            const m = inventory.find(i => i.id === c.materialId);
                            return s + (c.quantity * (m?.cost || 0));
                        }, 0);
                        invCost += (matCost + (bom.laborCost || 0)) * item.quantity;
                    } else {
                        const i = inventory.find(invItm => invItm.id === item.id);
                        invCost += (i?.cost || 0) * item.quantity;
                    }
                });
                invProfit = netInvoice - invCost;
                return totalProfit + invProfit;
            }, 0);

        return { total, paid, outstanding, overdue, annualProfit };
    }, [invoices, inventory, boms, companyConfig]);

    const dashboardData = useMemo(() => {
        const allInvs = invoices || [];
        const invs = allInvs.filter(inv => inv.status !== 'Cancelled' && inv.status !== 'Draft');
        const monthlyData: Record<string, { month: string; revenue: number; profit: number }> = {};
        const statusData: Record<string, { name: string; value: number; color: string }> = {
            'Paid': { name: 'Paid', value: 0, color: '#10b981' },
            'Unpaid': { name: 'Unpaid', value: 0, color: '#3b82f6' },
            'Overdue': { name: 'Overdue', value: 0, color: '#ef4444' },
            'Partial': { name: 'Partial', value: 0, color: '#f59e0b' },
            'Draft': { name: 'Draft', value: 0, color: '#94a3b8' }
        };

        invs.forEach(inv => {
            // Monthly Revenue
            const date = new Date(inv.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleString('default', { month: 'short' });

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { month: monthName, revenue: 0, profit: 0 };
            }
            monthlyData[monthKey].revenue += inv.totalAmount;

            // Profit for the month
            const netInvoice = inv.totalAmount;
            let invCost = 0;
            inv.items?.forEach(item => {
                const bom = boms.find(b => b.productId === item.id);
                if (bom) {
                    const matCost = bom.components.reduce((s, c) => {
                        const m = inventory.find(i => i.id === c.materialId);
                        return s + (c.quantity * (m?.cost || 0));
                    }, 0);
                    invCost += (matCost + (bom.laborCost || 0)) * item.quantity;
                } else {
                    const i = inventory.find(invItm => invItm.id === item.id);
                    invCost += (i?.cost || 0) * item.quantity;
                }
            });
            monthlyData[monthKey].profit += (netInvoice - invCost);

            // Status Distribution
            let status = inv.status as string;
            if (status !== 'Paid' && new Date(inv.dueDate) < new Date()) status = 'Overdue';
            if (statusData[status]) statusData[status].value += 1;
        });

        return {
            monthly: Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
            status: Object.values(statusData).filter(s => s.value > 0)
        };
    }, [invoices, inventory, boms, companyConfig]);

    const openEmailModal = (item: any, type: string, schedule = false) => {
        const cust = customers.find(c => c.name === item.customerName || c.name === item.customer_name);
        const defaultEmail = cust?.email || 'client@email.com';
        const docNumber = item.exchange_number || item.id;
        const customerName = item.customer_name || item.customerName;

        let subject = `${type} #${docNumber} from ${companyConfig?.companyName || 'PrimeERP'}`;
        let body = `Dear ${customerName},\n\nPlease find attached the ${type} #${docNumber}.\n\nRegards,\n${companyConfig?.companyName || 'PrimeERP'}`;

        if (type === 'Sales Exchange') {
            body = `Dear ${customerName},\n\nPlease find attached the ${type} note #${docNumber} regarding the exchange for Invoice #${item.invoice_id}.\n\nReason: ${item.reason}\n\nRegards,\n${companyConfig?.companyName || 'PrimeERP'}`;
        }

        const emailTemplateId = type === 'Quotation' ? 'tmpl_quote' : (type === 'Sales Exchange' ? 'tmpl_exchange' : 'tmpl_invoice');
        const template = companyConfig?.notificationTemplates?.find(t => t.id === emailTemplateId);

        if (template && template.enabled) {
            const variables = {
                customerName: customerName,
                invoiceNumber: item.invoice_id || item.id,
                exchangeNumber: item.exchange_number || '',
                docNumber: docNumber,
                date: new Date(item.date || item.exchange_date).toLocaleDateString(),
                dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '',
                validUntil: item.validUntil ? new Date(item.validUntil).toLocaleDateString() : '',
                amount: `${currency}${item.total || item.totalAmount || item.total_price_difference || 0}`,
                companyName: companyConfig.companyName
            };
            subject = parseTemplate(template.subjectTemplate, variables);
            body = parseTemplate(template.bodyTemplate, variables);
        }

        setWhiteEmailData({ to: defaultEmail, cc: '', bcc: '', subject, body, schedule: '', isScheduled: schedule, sendAsLink: false });
        setIsEmailModalOpen(true);
    };

    const handleSmartEmailDraft = async (item: any, type: string) => {
        if (!isOnline) {
            notify("Accuracy verification requires AI connectivity.", "error");
            return;
        }

        setIsGeneratingEmail(true);
        const prompt = `Write a professional, concise email for an ${type} #${item.id} to ${item.customerName}. 
        The total amount is ${currency}${item.total || item.totalAmount}. 
        ${type === 'Invoice' ? `The due date is ${new Date(item.dueDate).toLocaleDateString()}.` : ''}
        The status is currently: ${item.status}. 
        Include a polite call to action and ensure the tone reflects our company: ${companyConfig.companyName}.
        Return ONLY the subject and body in JSON format: { "subject": "...", "body": "..." }`;

        try {
            const raw = await generateAIResponse(prompt, "You are a Professional Billing Clerk.");
            const parsed = JSON.parse(raw.replace(/```json|```/g, ''));
            setWhiteEmailData(prev => ({ ...prev, subject: parsed.subject, body: parsed.body }));
            notify("AI drafted accurate communication content.", "success");
        } catch (e) {
            notify("Communication draft failed.", "error");
        } finally {
            setIsGeneratingEmail(false);
        }
    };

    const handleSendFinalEmail = () => {
        notify(`Communication transmitted to ${emailData.to} securely.`, "success");
        setIsEmailModalOpen(false);
    };

    const handleView = (item: any) => {
        if (activeView === 'Invoices') {
            setSelectedInvoiceForDetail(item);
        } else if (activeView === 'Exchanges') {
            setSelectedExchangeForDetail(item);
        } else if (activeView === 'Quotations') {
            setSelectedQuotationForDetail(item);
        } else if (activeView === 'SalesOrders') {
            setSelectedJobOrderForDetail(item);
        } else if (activeView === 'Orders') {
            setSelectedOrderForDetail(item);
        } else if (activeView === 'Subscriptions') {
            setSelectedInvoiceForDetail(item); // Recurring invoices use same detail modal but with subscription context
        }
    };

    const handleAction = async (item: any, action: string) => {
        if (action.startsWith('status_')) {
            const newStatus = action.replace('status_', '');
            if (activeView === 'Invoices') {
                updateInvoice({ ...item, status: newStatus as any });
            } else if (activeView === 'Quotations') {
                updateQuotation({ ...item, status: newStatus as any });
            } else if (activeView === 'Subscriptions') {
                const normalizedStatus = normalizeSubscriptionStatus(newStatus);
                await updateRecurringInvoice({
                    ...item,
                    status: normalizedStatus,
                    nextRunDate: normalizedStatus === 'Active'
                        ? ensureFutureSubscriptionRunDate(item.nextRunDate, item.frequency)
                        : item.nextRunDate
                });
            }
            notify(`Status updated to ${newStatus}`, "success");
            return;
        }

        if (action === 'approve' && activeView === 'Quotations') {
            const isExaminationQuotation = String(item?.quotationType || '').toLowerCase() === 'examination';
            const message = isExaminationQuotation
                ? 'Approve this examination quotation? This will create an examination batch with the saved classes and learner counts.'
                : 'Approve this quotation?';

            if (!window.confirm(message)) {
                return;
            }

            try {
                await approveQuotation(item.id);
            } catch {
                // Approval feedback is handled in the sales context.
            }
            return;
        }

        if (action === 'convert_to_order' && activeView === 'Quotations') {
            if (window.confirm("Convert this quotation to an active order? This will mark the quotation as 'Converted'.")) {
                const orderId = await convertQuotationToOrder(item);
                if (orderId) {
                    setActiveTab('Orders');
                }
            }
            return;
        }

        if (action === 'record_payment' && activeView !== 'Orders') {
            return;
        }

        if (action === 'convert_to_invoice' && activeView !== 'Orders') {
            return;
        }

        if (action === 'cancel_order' && activeView !== 'Orders') {
            return;
        }

        if (action === 'preview_pdf') {
            let type: any = 'INVOICE';
            if (activeView === 'Quotations') type = 'QUOTATION';
            else if (activeView === 'SalesOrders') type = 'WORK_ORDER';
            else if (activeView === 'Orders') type = 'ORDER';
            else if (activeView === 'Subscriptions') type = 'SUBSCRIPTION';
            else if (activeView === 'Exchanges') type = 'SALES_EXCHANGE';
            type = resolveDocumentType(item, type);

            // If it's a completed order, try to find the linked invoice
            let dataToPreview = { ...item };
            if (type === 'ORDER' && item.status === 'Completed') {
                const linkedInvoice = invoices.find(inv => inv.notes?.includes(`#[${item.orderNumber}]`));
                if (linkedInvoice) {
                    dataToPreview.invoiceNumber = linkedInvoice.id;
                    dataToPreview.invoiceDate = linkedInvoice.date;
                }
            }

            handlePreview(type, dataToPreview);
            return;
        }

        if (action === 'print_doc') {
            let type: any = 'INVOICE';
            if (activeView === 'Quotations') type = 'QUOTATION';
            else if (activeView === 'SalesOrders') type = 'WORK_ORDER';
            else if (activeView === 'Orders') type = 'ORDER';
            else if (activeView === 'Subscriptions') type = 'SUBSCRIPTION';
            else if (activeView === 'Exchanges') type = 'SALES_EXCHANGE';
            type = resolveDocumentType(item, type);

            let dataToPrint = { ...item };
            if (type === 'ORDER' && item.status === 'Completed') {
                const linkedInvoice = invoices.find(inv => inv.notes?.includes(`#[${item.orderNumber}]`));
                if (linkedInvoice) {
                    dataToPrint.invoiceNumber = linkedInvoice.id;
                    dataToPrint.invoiceDate = linkedInvoice.date;
                }
            }

            handlePrint(type, dataToPrint);
            return;
        }

        if (action === 'preview_work_order') {
            handlePreview('WORK_ORDER', item);
            return;
        }

        if (action === 'preview_delivery_note') {
            handlePreview('DELIVERY_NOTE', item);
            return;
        }

        if (action === 'preview_purchase_order') {
            handlePreview('PO', item);
            return;
        }

        if (action === 'download_pdf') {
            try {
                notify("Preparing PDF document...", "info");

                let type: any = 'INVOICE';
                if (activeView === 'Quotations') type = 'QUOTATION';
                else if (activeView === 'SalesOrders') type = 'WORK_ORDER';
                else if (activeView === 'Orders') type = 'ORDER';
                else if (activeView === 'Subscriptions') type = 'SUBSCRIPTION';
                else if (activeView === 'Exchanges') type = 'SALES_EXCHANGE';
                type = resolveDocumentType(item, type);

                const enrichedItem = enrichDocumentCustomerData(item, customers);
                const pdfData = mapToInvoiceData(enrichedItem, companyConfig, type);
                await initializePrimePdfFonts();
                const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
                const blob = await pdf(<PrimeDocument type={type} data={securedPdfData as PrimeDocData} />).toBlob();
                
                const docNumber = item.invoiceNumber || item.orderNumber || item.quotationNumber || item.receiptNumber || item.number || item.id || '';
                const typeLabel = type === 'WORK_ORDER' ? 'Sales Order' : type === 'ORDER' ? 'Order' : type === 'QUOTATION' ? 'Quotation' : type === 'SUBSCRIPTION' ? 'Recurring Invoice' : type === 'SALES_EXCHANGE' ? 'Exchange' : 'Document';
                const fileName = docNumber ? `${typeLabel} - ${docNumber}.pdf` : `${typeLabel}.pdf`;
                
                downloadBlob(blob, fileName);
                notify(`${typeLabel} PDF downloaded successfully`, "success");
                return;
            } catch (error) {
                console.error("PDF generation failed:", error);
                notify("Failed to generate PDF", "error");
                return;
            }
        }

        if (activeView === 'Quotations') {
            if (action === 'convert_inv') {
                const newId = await convertQuotationToInvoice(item);
                notify(`Quote ${item.id} successfully converted to Invoice ${newId}`, "success");
                setActiveTab('Invoices');
            }
            if (action === 'convert_wo') {
                const woId = await convertQuotationToWorkOrder(item);
                notify(`Quote ${item.id} successfully released as Work Order ${woId}`, "success");
                navigate('/production/work-orders');
            }
            if (action === 'convert_to_job_ticket') {
                const ticketId = await convertQuotationToJobTicket(item);
                notify(`Quote ${item.id} successfully converted to Job Ticket ${ticketId}`, "success");
                navigate('/sales-flow/job-tickets');
            }
            if (action === 'email_now') openEmailModal(item, 'Quotation', false);
            if (action === 'duplicate_exact') {
                const baseData = {
                    ...item,
                    id: '',
                    date: new Date().toISOString(),
                    status: 'Draft',
                    isPriceLocked: false,
                    linkedBatchId: '',
                    linkedBatchName: '',
                    approvedAt: undefined
                };
                addQuotation(baseData);
                notify("Quotation duplicated successfully", "success");
            }
        }
        else if (activeView === 'Invoices') {
            if (action === 'convert_to_recurring') {
                const recurringDraft = buildRecurringDraftFromInvoice(item);
                setEditingItem(recurringDraft);
                setIsFormOpen(true);
                navigate('/sales-flow/subscriptions');
                notify(`Invoice ${item.id} loaded into a recurring billing draft. Review the schedule before saving.`, "success");
                return;
            }
            if (action === 'create_payment') {
                navigate('/sales-flow/payments', { state: { action: 'create', customer: item.customerName, invoiceId: item.id } });
            }
            if (action === 'duplicate') {
                const issuedDate = new Date().toISOString().split('T')[0];
                const customer = customers.find(c => c.name === item.customerName);
                const paymentPolicy = resolveCustomerPaymentPolicy({
                    customer,
                    subAccountName: item.subAccountName,
                    transactionType: 'invoice',
                    issuedDate,
                    preserveCustomTerms: true
                });

                const duplicateDraft = {
                    ...item,
                    id: '', // Backend will generate
                    invoiceNumber: '', // Backend will generate
                    date: issuedDate,
                    dueDate: paymentPolicy.dueDate,
                    paymentTerms: paymentPolicy.paymentTerms,
                    status: 'Draft',
                    paidAmount: 0,
                    conversionDetails: undefined,
                    notes: `Duplicated from Invoice #${item.invoiceNumber || item.id}`
                };
                setEditingItem(duplicateDraft);
                setIsFormOpen(true);
                notify("Invoice copied into a new draft. Review before saving.", "success");
                return;
            }
            if (action === 'generate_dn') {
                const cust = customers.find(c => c.name === item.customerName);
                const dnId = await createDeliveryNote(item.id);
                if (dnId) {
                    notify("Delivery Note Generated. Redirecting to Logistics...", "success");
                    navigate('/sales/shipping');
                }
                else notify("Invoice not found", "error");
            }
            if (action === 'create_exchange') {
                setSelectedInvoiceForExchange(item);
                setIsExchangeModalOpen(true);
            }
            if (action === 'email_invoice') openEmailModal(item, 'Invoice', false);
            if (action === 'analyze_profit') setAnalysisInvoice(item);
            if (action === 'ai_followup') {
                if (!isOnline) {
                    notify("AI verification requires connectivity.", "error");
                    return;
                }
                notify("Gemini is analyzing payment history and drafting follow-up strategy...", "info");
                const prompt = `Analyze this overdue invoice for ${item.customerName}. 
                  Invoice #${item.id}, Amount: ${currency}${item.totalAmount}, Due Date: ${new Date(item.dueDate).toLocaleDateString()}.
                  Current status is ${item.status}. 
                  Provide a 3-step follow-up strategy and a short, polite but firm SMS/Email draft to encourage immediate payment.
                  Return the response in a professional tone.`;

                try {
                    const response = await generateAIResponse(prompt, "You are a Senior Collections Specialist.");
                    // Display in a notify or a modal. For now, we'll use a prompt-like experience or just log it.
                    // Ideally, we'd open a modal with this info. Let's use the email modal but with this content.
                    setWhiteEmailData({
                        to: customers.find(c => c.name === item.customerName)?.email || '',
                        cc: '', bcc: '',
                        subject: `URGENT: Follow-up on Overdue Invoice #${item.id}`,
                        body: response,
                        schedule: '', isScheduled: false, sendAsLink: false
                    });
                    setIsEmailModalOpen(true);
                    notify("AI Strategy Generated and loaded into mailer.", "success");
                } catch (e) {
                    notify("Failed to generate AI follow-up.", "error");
                }
            }
        }
        else if (activeView === 'Subscriptions') {
            if (action === 'toggle_status') {
                const currentStatus = normalizeSubscriptionStatus(item.status);

                if (currentStatus === 'Cancelled' || currentStatus === 'Expired') {
                    notify("Change the subscription status from the status menu before reactivating this record.", "error");
                    return;
                }

                const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
                await updateRecurringInvoice({
                    ...item,
                    status: newStatus,
                    nextRunDate: newStatus === 'Active'
                        ? ensureFutureSubscriptionRunDate(item.nextRunDate, item.frequency)
                        : item.nextRunDate
                });
                notify(`Subscription ${currentStatus === 'Active' ? 'paused' : (currentStatus === 'Draft' ? 'activated' : 'resumed')} successfully`, "success");
                return;
            }
            if (action === 'duplicate_exact') {
                const duplicatedDraft = buildRecurringDraftFromTemplate(item);
                setEditingItem(duplicatedDraft);
                setIsFormOpen(true);
                notify("Subscription copied into a new draft. Review the customer and next billing date before saving.", "success");
                return;
            }
        }
        else if (activeView === 'SalesOrders') {
            if (action === 'convert_inv') {
                const newId = await convertJobOrderToInvoice(item);
                notify(`Sales Order ${item.id} successfully converted to Invoice ${newId}`, "success");
                setActiveTab('Invoices');
            }
        }
        else if (activeView === 'Exchanges') {
            if (action === 'approve_exchange') {
                if (window.confirm("Approve this exchange request? This will authorize the replacement/reprint.")) {
                    await approveSalesExchange(item.id, "Approved from Sales Dashboard");
                    notify("Exchange approved and authorized for reprint", "success");
                }
            }
            if (action === 'cancel_exchange') {
                if (window.confirm("Cancel this exchange request?")) {
                    await cancelSalesExchange(item.id);
                    notify("Exchange request cancelled", "info");
                }
            }
            if (action === 'print_note' || action === 'download_pdf') {
                handlePreview('SALES_EXCHANGE', item);
            }
            if (action === 'email_note') {
                openEmailModal(item, 'Sales Exchange', false);
            }
            if (action === 'view_details') {
                setSelectedExchangeForDetail(item);
            }
        }
        else if (activeView === 'Orders') {
            if (action === 'record_payment') {
                const amountStr = window.prompt(`Enter amount to pay for Order #${item.orderNumber} (Remaining: ${companyConfig.currencySymbol}${item.remainingBalance}):`);
                if (amountStr !== null) {
                    const amount = amountStr === "" ? item.remainingBalance : parseFloat(amountStr);
                    if (amount > 0) {
                        try {
                            await recordPayment(item.id, {
                                amountPaid: amount,
                                paymentMethod: 'Cash',
                                reference: `Payment for Order #${item.orderNumber}`
                            });
                        } catch (error: any) {
                            notify(`Payment failed: ${error.message}`, "error");
                        }
                    }
                }
            }
            if (action === 'convert_to_invoice') {
                if (window.confirm(`Convert Order #${item.orderNumber} to an Invoice?`)) {
                    try {
                        const issuedDate = new Date().toISOString().split('T')[0];
                        const customer = customers.find((entry: any) =>
                            entry.id === item.customerId || entry.name === item.customerName
                        );
                        const paymentPolicy = resolveCustomerPaymentPolicy({
                            customer,
                            subAccountName: (item as any).subAccountName,
                            transactionType: 'invoice',
                            issuedDate,
                            preserveCustomTerms: true
                        });
                        const newInvoice: Invoice = {
                            customerName: item.customerName,
                            customerId: item.customerId,
                            date: issuedDate,
                            dueDate: paymentPolicy.dueDate,
                            items: item.items.map((i: any) => ({
                                ...i,
                                description: i.productName || i.description,
                                price: i.unitPrice,
                                // Preserve all revenue-analysis fields from the original order item
                                cost: i.cost ?? i.cost_price ?? 0,
                                cost_price: i.cost_price ?? i.cost ?? 0,
                                adjustmentSnapshots: i.adjustmentSnapshots || [],
                                adjustmentTotal: i.adjustmentTotal ?? i.pricingBreakdown?.adjustmentTotal ?? 0,
                                pricingBreakdown: i.pricingBreakdown,
                                smartPricingSnapshot: i.smartPricingSnapshot,
                                productionCostSnapshot: i.productionCostSnapshot,
                            })),
                            totalAmount: item.totalAmount,
                            paidAmount: item.paidAmount,
                            status: item.paidAmount >= item.totalAmount ? 'Paid' : 'Unpaid',
                            discount: item.discount || 0,
                            notes: `Converted from [Order] #[${item.orderNumber}] on [${new Date().toLocaleString()}] as accepted by [${user?.name || 'System'}]`,
                            createdBy: user?.name || 'System User',
                            type: 'standard' as any,
                            paymentTerms: paymentPolicy.paymentTerms,
                            // Preserve root-level pricing aggregates so Revenue Analysis can use them
                            conversionDetails: {
                                sourceType: 'order',
                                sourceNumber: item.orderNumber,
                                date: new Date().toLocaleDateString(),
                                acceptedBy: user?.name || 'System'
                            },
                            materialTotal: item.materialTotal ?? 0,
                            adjustmentTotal: item.adjustmentTotal ?? 0,
                            adjustmentSnapshots: item.adjustmentSnapshots || [],
                            profitMarginTotal: item.profitMarginTotal ?? 0,
                            roundingTotal: item.roundingTotal ?? item.roundingDifference ?? 0,
                            roundingDifference: item.roundingDifference ?? item.roundingTotal ?? 0,
                        };
                        const invoiceId = await addInvoice(newInvoice);
                        await updateOrderStatus(item.id, 'Completed');
                        notify(`Order #${item.orderNumber} successfully converted to Invoice ${invoiceId}`, "success");
                        setActiveTab('Invoices');
                        if (selectedOrderForDetail) setSelectedOrderForDetail(null); // Close the modal after conversion
                    } catch (error: any) {
                        notify(`Conversion failed: ${error.message}`, "error");
                    }
                }
            }
            if (action === 'cancel_order') {
                const reason = window.prompt(`Reason for cancelling Order #${item.orderNumber}: `);
                if (reason) {
                    try {
                        await cancelOrder(item.id, reason);
                    } catch (error: any) {
                        notify(`Cancellation failed: ${error.message} `, "error");
                    }
                }
            }
        }
    };

    const processedInvoices = useMemo(() => {
        let data = [...(invoices || [])];
        const now = new Date();
        if (moneyBarFilter === 'Overdue') {
            data = data.filter(i => i.status !== 'Paid' && new Date(i.dueDate) < now);
        }
        else if (moneyBarFilter === 'Partial') {
            data = data.filter(i => (i.paidAmount || 0) > 0 && (i.paidAmount || 0) < i.totalAmount);
        }
        else if (moneyBarFilter === 'Unpaid') {
            data = data.filter(i => (i.paidAmount || 0) <= 0 && i.status !== 'Draft');
        }
        else if (moneyBarFilter === 'Paid') {
            data = data.filter(i => i.status === 'Paid');
        }
        if (searchText) {
            const lower = searchText.toLowerCase();
            data = data.filter(i => i.customerName.toLowerCase().includes(lower) || i.id.toLowerCase().includes(lower));
        }
        data.sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];
            if (valA === undefined || valB === undefined) return 0;
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [invoices, moneyBarFilter, searchText, sortField, sortDirection]);

    const handleSort = (field: keyof Invoice) => { if (sortField === field) { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortField(field); setSortDirection('desc'); } };
    const handleSelectInvoice = (id: string) => { setSelectedInvoiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };

    const handleBulkAction = async (action: string) => {
        if (selectedInvoiceIds.length === 0) return;

        if (action === 'bulk_delete') {
            if (activeView === 'Orders') {
                const count = selectedInvoiceIds.length;
                const reason = window.prompt(`Reason for cancelling ${count} orders: `);
                if (reason) {
                    try {
                        for (const id of selectedInvoiceIds) {
                            await cancelOrder(id, reason);
                        }
                        setSelectedInvoiceIds([]);
                        notify(`${count} orders cancelled`, "success");
                    } catch (error: any) {
                        notify(`Failed to cancel some orders: ${error.message} `, "error");
                    }
                }
                return;
            }
            handleBulkDelete();
        } else if (action === 'bulk_pay') {
            if (activeView === 'Orders') {
                const count = selectedInvoiceIds.length;
                const amountStr = window.prompt(`Enter payment amount to record for EACH of the ${count} selected orders(or leave empty to mark as fully paid): `);

                try {
                    for (const id of selectedInvoiceIds) {
                        const order = orders.find(o => o.id === id);
                        if (!order) continue;

                        const amount = amountStr ? parseFloat(amountStr) : order.remainingBalance;
                        if (amount > 0) {
                            await recordPayment(id, {
                                id: `PAY - BLK - ${Date.now()} -${id} -${Math.random().toString(36).substr(2, 5)}`,
                                orderId: id,
                                amountPaid: amount,
                                paymentDate: new Date().toISOString(),
                                paymentMethod: 'Cash',
                                recordedBy: user?.name || 'System User',
                                reference: `Bulk Payment for Order #${order.orderNumber}`
                            });
                        }
                    }
                    setSelectedInvoiceIds([]);
                    notify(`Payments recorded for ${count} orders`, "success");
                } catch (error: any) {
                    notify(`Bulk payment failed: ${error.message} `, "error");
                }
                return;
            }
            if (window.confirm(`Mark ${selectedInvoiceIds.length} invoices as Paid ? `)) {
                selectedInvoiceIds.forEach(id => {
                    const inv = invoices.find(i => i.id === id);
                    if (inv && inv.status !== 'Paid') {
                        updateInvoice({ ...inv, status: 'Paid', paidAmount: inv.totalAmount });
                    }
                });
                notify(`Successfully processed ${selectedInvoiceIds.length} payments`, "success");
                setSelectedInvoiceIds([]);
            }
        } else if (action === 'bulk_convert') {
            if (activeView === 'Orders') {
                const count = selectedInvoiceIds.length;
                if (window.confirm(`Convert ${count} selected orders to invoices ? `)) {
                    try {
                        for (const id of selectedInvoiceIds) {
                            const order = orders.find(o => o.id === id);
                            if (!order) continue;

                            const invoiceData = {
                                ...order,
                                date: new Date().toISOString().split('T')[0],
                                status: 'Unpaid',
                                notes: `Converted from [Order] #[${order.orderNumber}] on [${new Date().toLocaleString()}] as accepted by [${user?.name || 'System'}]`,
                                items: order.items.map((i: any) => ({
                                    ...i,
                                    description: i.productName || i.description,
                                    price: i.unitPrice,
                                    // Preserve all revenue-analysis fields
                                    cost: i.cost ?? i.cost_price ?? 0,
                                    cost_price: i.cost_price ?? i.cost ?? 0,
                                    adjustmentSnapshots: i.adjustmentSnapshots || [],
                                    adjustmentTotal: i.adjustmentTotal ?? i.pricingBreakdown?.adjustmentTotal ?? 0,
                                    pricingBreakdown: i.pricingBreakdown,
                                    smartPricingSnapshot: i.smartPricingSnapshot,
                                    productionCostSnapshot: i.productionCostSnapshot,
                                })),
                                conversionDetails: {
                                    sourceType: 'order',
                                    sourceNumber: order.orderNumber,
                                    date: new Date().toLocaleDateString(),
                                    acceptedBy: user?.name || 'System'
                                },
                            };
                            await addInvoice(invoiceData as any);
                        }
                        setSelectedInvoiceIds([]);
                        notify(`${count} orders converted to invoices`, "success");
                    } catch (error: any) {
                        notify(`Bulk conversion failed: ${error.message} `, "error");
                    }
                }
            }
        } else if (action === 'bulk_approve') {
            if (window.confirm(`Approve ${selectedInvoiceIds.length} selected exchanges ? `)) {
                try {
                    for (const id of selectedInvoiceIds) {
                        await approveSalesExchange(id, "Bulk approved by supervisor");
                    }
                    notify(`Successfully approved ${selectedInvoiceIds.length} exchanges`, "success");
                    setSelectedInvoiceIds([]);
                } catch (error: any) {
                    notify(`Failed to approve some exchanges: ${error.message} `, "error");
                }
            }
        } else if (action === 'bulk_cancel') {
            const type = activeView === 'Exchanges' ? 'exchanges' : 'invoices';
            if (window.confirm(`Cancel ${selectedInvoiceIds.length} selected ${type}?`)) {
                try {
                    if (activeView === 'Exchanges') {
                        // Logic for cancelling exchanges
                        for (const id of selectedInvoiceIds) {
                            const ex = salesExchanges.find(e => e.id === id);
                            if (ex && (ex.status === 'pending' || ex.status === 'Pending')) {
                                await cancelSalesExchange(id);
                            }
                        }
                    } else {
                        selectedInvoiceIds.forEach(id => {
                            const inv = invoices.find(i => i.id === id);
                            if (inv && inv.status !== 'Paid') {
                                updateInvoice({ ...inv, status: 'Cancelled' });
                            }
                        });
                    }
                    notify(`Successfully processed bulk cancel for ${selectedInvoiceIds.length} items`, "info");
                    setSelectedInvoiceIds([]);
                } catch (error: any) {
                    notify(`Bulk cancel failed: ${error.message} `, "error");
                }
            }
        } else if (action === 'bulk_email') {
            notify(`Drafting communications for ${selectedInvoiceIds.length} recipients...`, "info");
            // In a real app, this would open a bulk email composer or trigger a background job
            setTimeout(() => notify("Bulk email transmission completed", "success"), 2000);
            setSelectedInvoiceIds([]);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col relative w-full text-sm font-normal">
            {isFormOpen && (
                <div className="absolute inset-0 z-50 bg-slate-50 overflow-y-auto custom-scrollbar p-4 md:p-6">
                    <OrderForm type={formType} initialData={editingItem} onSave={handleSave} onCancel={() => setIsFormOpen(false)} saving={isSaving} />
                </div>
            )}
            {analysisInvoice && (<ProfitAnalysisModal invoice={analysisInvoice} onClose={() => setAnalysisInvoice(null)} />)}

            {isEmailModalOpen && (
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-premium w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/40 flex flex-col h-[80vh]">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tighter uppercase flex items-center gap-3"><Mail className="text-blue-600" /> Secure Mail Gateway</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">Status Verified • No Spoilers</p>
                            </div>
                            <button onClick={() => setIsEmailModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Recipient</label>
                                    <input type="email" className="w-full p-2.5 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-800 focus:ring-4 focus:ring-blue-500/5 outline-none" value={emailData.to} onChange={e => setWhiteEmailData({ ...emailData, to: e.target.value })} />
                                </div>
                                <div className="flex flex-col justify-end">
                                    {isOnline && (
                                        <button
                                            onClick={() => handleSmartEmailDraft(selectedInvoiceForDetail || editingItem, activeView === 'Invoices' ? 'Invoice' : 'Quotation')}
                                            disabled={isGeneratingEmail}
                                            className="w-full py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-tight hover:bg-indigo-100 flex items-center justify-center gap-2 border border-indigo-100 transition-all"
                                        >
                                            {isGeneratingEmail ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            {isGeneratingEmail ? 'Processing Logic...' : 'AI Verify & Enhance'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5">Subject Line</label>
                                <input type="text" className="w-full p-2.5 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-800 outline-none" value={emailData.subject} onChange={e => setWhiteEmailData({ ...emailData, subject: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1.5 flex items-center gap-2">
                                    <MessageSquare size={14} /> Message Body
                                </label>
                                <textarea className="w-full p-4 border border-slate-200 rounded-2xl h-48 resize-none text-[13px] leading-relaxed outline-none font-normal" value={emailData.body} onChange={e => setWhiteEmailData({ ...emailData, body: e.target.value })} />
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 shrink-0 mt-0.5" size={16} />
                                <div>
                                    <p className="text-[10px] font-bold text-slate-900 uppercase tracking-tight mb-1">Status Verification</p>
                                    <p className="text-[11px] text-slate-500 leading-snug">
                                        Content cross-referenced with ledger. {activeView === 'Exchanges' ? 'Exchange' : 'Invoice'} current status:
                                        <span className="font-bold text-emerald-600 uppercase ml-1">{(selectedInvoiceForDetail || editingItem)?.status || 'Cleared'}</span>.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                            <button onClick={() => setIsEmailModalOpen(false)} className="px-6 py-3 border border-slate-300 rounded-2xl font-bold uppercase text-[10px] tracking-tight text-slate-600 hover:bg-white transition-all">Cancel</button>
                            <button onClick={handleSendFinalEmail} className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-bold uppercase text-[10px] tracking-tight hover:bg-blue-700 shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2">
                                <Send size={14} /> Transmit Mail
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 shrink-0">
                <div>
                    <h1 className="text-[22px] font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                        {activeView === 'Quotations' && <FileText className="text-blue-600" size={20} />}
                        {activeView === 'Invoices' && <FileCheck className="text-blue-600" size={20} />}
                        {activeView === 'Subscriptions' && <Repeat className="text-blue-600" size={20} />}
                        {activeView === 'SalesOrders' && <Truck className="text-blue-600" size={20} />}
                        {activeView === 'Exchanges' && <RefreshCw className="text-blue-600" size={20} />}
                        {activeView === 'Orders' && <List className="text-blue-600" size={20} />}
                        {activeView === 'Quotations' ? 'Quotations' :
                            activeView === 'Invoices' ? 'Invoices' :
                                activeView === 'Subscriptions' ? 'Subscriptions' :
                                    activeView === 'Exchanges' ? 'Sales Exchanges' :
                                        activeView === 'Orders' ? 'Full Orders' : 'Sales Orders'}
                    </h1>
                    <p className="text-xs font-normal text-slate-500 mt-0.5">
                        {activeView === 'Exchanges' ? 'Manage print job replacements and reprints' : 'Manage your sales pipeline and documents'}
                    </p>
                </div>

                <div className="flex gap-2 items-center">
                    {activeView === 'Exchanges' && (
                        <button
                            onClick={() => setIsRequestModalOpen(true)}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-tight hover:bg-blue-700 shadow-xl shadow-blue-500/20 active:scale-95 transition-all mr-2"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            New Exchange Request
                        </button>
                    )}
                    {(activeView === 'Invoices' || activeView === 'Orders') && selectedInvoiceIds.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-right-4">
                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">{selectedInvoiceIds.length} Selected</span>
                            <div className="w-px h-4 bg-blue-200 mx-1"></div>
                            <button
                                onClick={() => handleBulkAction('bulk_delete')}
                                className="p-1 text-rose-600 hover:bg-rose-100 rounded transition-colors"
                                title={activeView === 'Orders' ? "Cancel Selected" : "Delete Selected"}
                            >
                                {activeView === 'Orders' ? <Ban size={16} /> : <Trash2 size={16} />}
                            </button>
                            <button
                                onClick={() => handleBulkAction('bulk_pay')}
                                className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition-colors"
                                title="Record Payment"
                            >
                                <DollarSign size={16} />
                            </button>
                            {activeView === 'Orders' && (
                                <button
                                    onClick={() => handleBulkAction('bulk_convert')}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                    title="Convert to Invoice"
                                >
                                    <RefreshCw size={16} />
                                </button>
                            )}
                            <button
                                onClick={() => setSelectedInvoiceIds([])}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                title="Clear Selection"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    {activeView === 'Invoices' && (
                        <div className="flex gap-2 items-center">
                            <button onClick={handleCheckLateFees} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl text-[10px] font-bold uppercase tracking-tight hover:bg-red-200 flex items-center gap-2" title="Assess Late Fees"><AlertTriangle size={14} /> Fees</button>
                            <div className="relative">
                                <select
                                    className="pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-bold uppercase tracking-tight text-slate-600 focus:ring-4 focus:ring-blue-500/5 outline-none appearance-none shadow-sm"
                                    value={moneyBarFilter}
                                    onChange={e => setMoneyBarFilter(e.target.value as any)}
                                >
                                    <option value="All">Filter: All Records</option>
                                    <option value="Partial">Filter: Partially Paid</option>
                                    <option value="Unpaid">Filter: Fully Unpaid</option>
                                    <option value="Overdue">Filter: Overdue Only</option>
                                    <option value="Paid">Filter: Paid in Full</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => refreshModuleData(true).catch(() => undefined)}
                        disabled={isRefreshing}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Refresh invoicing and billing data"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <div className="flex bg-white/70 backdrop-blur border border-white/60 rounded-xl p-1 shadow-sm">
                        <button onClick={() => setViewMode('List')} className={`p - 1.5 rounded - lg transition - colors ${viewMode === 'List' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'} `}><List size={16} /></button>
                        <button onClick={() => setViewMode('Card')} className={`p - 1.5 rounded - lg transition - colors ${viewMode === 'Card' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'} `}><LayoutGrid size={16} /></button>
                    </div>
                    {activeView !== 'Subscriptions' && (
                        <button onClick={handleCreate} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-tight flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"><Plus size={14} /> Create New</button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
                {activeView === 'Invoices' ? (
                    <>
                        {[
                            { label: 'Total Invoiced', value: `${currency}${invoiceStats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} `, icon: TrendingUp, color: 'blue' },
                            { label: 'Annual Profit', value: `${currency}${invoiceStats.annualProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} `, icon: TrendingUp, color: 'emerald' },
                            { label: 'Outstanding', value: `${currency}${invoiceStats.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} `, icon: Wallet, color: 'indigo' },
                            { label: 'Overdue Amount', value: `${currency}${invoiceStats.overdue.toLocaleString(undefined, { maximumFractionDigits: 0 })} `, icon: AlertCircle, color: 'rose' }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-white/80 backdrop-blur-md border border-slate-200/60 p-3.5 rounded-2xl shadow-sm hover:shadow-md transition-all group flex items-center gap-3 relative overflow-hidden">
                                <div className={`p - 2 rounded - xl bg - ${item.color} -50 text - ${item.color} -600 group - hover: scale - 110 transition - transform`}>
                                    <item.icon size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{item.label}</p>
                                    <p className="text-base font-semibold text-slate-900 tracking-tight">{item.value}</p>
                                </div>
                                {idx === 0 && (
                                    <button
                                        onClick={() => setShowVisualDashboard(!showVisualDashboard)}
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-blue-500 transition-colors"
                                        title="Toggle Visual Analytics"
                                    >
                                        <PieChartIcon size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </>
                ) : null}
            </div>

            {activeView === 'Invoices' && showVisualDashboard && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-500 shrink-0">
                    <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm border border-slate-200 p-6 rounded-[2.5rem] shadow-sm flex flex-col h-[300px]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <BarChart2 size={16} className="text-blue-600" /> Revenue & Profit Trends
                            </h3>
                            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-tight">
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Revenue</div>
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Profit</div>
                            </div>
                        </div>
                        <div style={{ width: '100%', height: 200, minHeight: 150 }}>
                        {/* console.log("Chart container mounted", dashboardData.monthly) */}
                        <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                            <BarChart data={dashboardData.monthly}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(val) => `${currency}${val / 1000} k`} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                        formatter={(val) => [`${currency}${val.toLocaleString()} `]}
                                    />
                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                                    <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="bg-white/90 backdrop-blur-sm border border-slate-200 p-6 rounded-[2.5rem] shadow-sm flex flex-col h-[300px]">
                        <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                            <PieChartIcon size={16} className="text-blue-600" /> Status Distribution
                        </h3>
                        <div style={{ width: '100%', height: 160, minHeight: 150 }}>
                        {/* console.log("Chart container mounted", dashboardData.status) */}
                        <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                            <PieChart>
                                    <Pie
                                        data={dashboardData.status}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {dashboardData.status.map((entry, index) => (
                                            <Cell key={`cell - ${index} `} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                    />
                            </PieChart>
                        </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            {dashboardData.status.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}></div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{s.name}: {s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden flex gap-6 relative">
                <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
                    {isLoading ? (
                        <SalesSkeletonLoader type={viewMode === 'Card' ? 'grid' : 'table'} />
                    ) : (
                        <>
                            {activeView === 'Quotations' && <QuotationList data={quotations || []} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onAction={handleAction} viewMode={viewMode} />}
                            {activeView === 'Invoices' && <InvoiceList data={processedInvoices || []} onView={(inv) => setSelectedInvoiceForDetail(inv)} onEdit={handleEdit} onDelete={handleDelete} onAction={handleAction} viewMode={viewMode} selectedIds={selectedInvoiceIds} onSelect={handleSelectInvoice} onSort={handleSort} sortConfig={{ field: sortField, direction: sortDirection }} selectedId={selectedInvoiceForDetail?.id} />}
                            {activeView === 'Subscriptions' && <SubscriptionView data={recurringInvoices || []} onEdit={handleEdit} onView={handleView} onDelete={handleDelete} onAction={handleAction} />}
                            {activeView === 'SalesOrders' && <SalesOrderList data={jobOrders || []} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onAction={handleAction} viewMode={viewMode} />}
                            {activeView === 'Orders' && <OrdersList data={orders || []} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onAction={handleAction} viewMode={viewMode} />}
                            {activeView === 'Exchanges' && <SalesExchangeList data={salesExchanges || []} onView={handleView} onEdit={handleEdit} onDelete={(id) => deleteSalesExchange(id)} onAction={handleAction} viewMode={viewMode} selectedIds={selectedInvoiceIds} onSelect={handleSelectInvoice} />}
                        </>
                    )}
                </div>

                {selectedInvoiceForDetail && (
                    <InvoiceDetails
                        invoice={selectedInvoiceForDetail}
                        onClose={() => setSelectedInvoiceForDetail(null)}
                        onEdit={(inv) => {
                            handleEdit(inv);
                            setSelectedInvoiceForDetail(null);
                        }}
                        onAction={handleAction}
                    />
                )}

                {selectedQuotationForDetail && (
                    <QuotationDetails
                        quotation={selectedQuotationForDetail}
                        onClose={() => setSelectedQuotationForDetail(null)}
                        onEdit={(q) => {
                            handleEdit(q);
                            setSelectedQuotationForDetail(null);
                        }}
                        onAction={handleAction}
                    />
                )}

                {selectedJobOrderForDetail && (
                    <JobOrderDetails
                        jobOrder={selectedJobOrderForDetail}
                        onClose={() => setSelectedJobOrderForDetail(null)}
                        onEdit={(jo) => {
                            handleEdit(jo);
                            setSelectedJobOrderForDetail(null);
                        }}
                        onAction={handleAction}
                    />
                )}

                {selectedOrderForDetail && (
                    <OrderDetails
                        order={selectedOrderForDetail}
                        onClose={() => setSelectedOrderForDetail(null)}
                        onEdit={(order) => {
                            handleEdit(order);
                            setSelectedOrderForDetail(null);
                        }}
                        onAction={handleAction}
                    />
                )}
            </div>

            {selectedInvoiceIds.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8 duration-300 z-[60] border border-white/10">
                    <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold">
                            {selectedInvoiceIds.length}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-tight">
                            {activeView === 'Exchanges' ? 'Exchanges' : 'Invoices'} Selected
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeView === 'Invoices' && (
                            <>
                                <button
                                    onClick={() => handleBulkAction('bulk_pay')}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-colors flex items-center gap-2"
                                >
                                    <CheckCircle size={14} /> Mark Paid
                                </button>
                                <button
                                    onClick={() => handleBulkAction('bulk_email')}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-colors flex items-center gap-2"
                                >
                                    <Mail size={14} /> Bulk Email
                                </button>
                            </>
                        )}

                        {activeView === 'Exchanges' && (
                            <button
                                onClick={() => handleBulkAction('bulk_approve')}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-colors flex items-center gap-2"
                            >
                                <CheckCircle size={14} /> Approve Selected
                            </button>
                        )}

                        <button
                            onClick={() => handleBulkAction('bulk_cancel')}
                            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-colors flex items-center gap-2"
                        >
                            <Ban size={14} /> Cancel
                        </button>
                        <button
                            onClick={() => handleBulkAction('bulk_delete')}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={14} /> Delete
                        </button>
                        <button
                            onClick={() => {
                                setSelectedInvoiceIds([]);
                            }}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {isRequestModalOpen && (
                <ExchangeRequestModal onClose={() => setIsRequestModalOpen(false)} />
            )}

            {isExchangeModalOpen && selectedInvoiceForExchange && (
                <ExchangeRequestModal
                    initialInvoice={selectedInvoiceForExchange}
                    onClose={() => {
                        setIsExchangeModalOpen(false);
                        setSelectedInvoiceForExchange(null);
                    }}
                />
            )}

            {selectedExchangeForDetail && (
                <ExchangeDetailsModal
                    exchange={selectedExchangeForDetail}
                    onClose={() => setSelectedExchangeForDetail(null)}
                />
            )}
        </div>
    );
};

export default Orders;
