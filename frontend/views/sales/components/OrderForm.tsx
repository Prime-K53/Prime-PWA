import React, { useState, useEffect, useMemo, useRef } from 'react';
// PRICING RULE: Do NOT implement pricing logic here. All pricing MUST go through pricingEngine.ts
import { X, Save, Plus, Trash2, Calculator, Info, ShieldCheck, Building2, Package, Tag, Clock, Search, ChevronDown, Coins, UserPlus, Calendar, RefreshCw, Wallet, Mail, Layers, ExternalLink, FileText, Printer, FileDown, Eye, TrendingUp, Truck, Scale, Copy } from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { useOrders } from '../../../context/OrdersContext';
import { useAuth } from '../../../context/AuthContext';
import { CartItem, Item, Invoice, ProductVariant, Account, OrderItem, OrderPayment, BOMTemplate, AdjustmentSnapshot, Customer } from '../../../types';
import { generateNextId, getDefaultPaymentTermsForSegment, resolveCustomerPaymentPolicy, roundToCurrency } from '../../../utils/helpers';
import { pricingService, DynamicServicePricingResult } from '../../../services/pricingService';
import { dbService } from '../../../services/db';

import { useNavigate } from 'react-router-dom';
import { VariantSelectorModal, ServiceCalculatorModal } from '../../pos/components/PosModals';
import { Loader2 } from 'lucide-react';
import QuickPrintModal from '../../../components/QuickPrintModal';
import { calculateSellingPrice, calculateServicePrice } from '../../../utils/pricing/pricingEngine';
import { getPlaceholder } from '../../../constants/placeholders';
import { resolveStoredCalculatedPrice, resolveStoredCost, resolveStoredSellingPrice } from '../../../utils/pricing';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, getMarketAdjustmentSnapshots, getSnapshotCalculatedAmount, resolveItemAdjustmentSnapshots, summarizePricingBreakdown } from '../../../utils/pricingBreakdown';

import { useDocumentPreview } from '../../../hooks/useDocumentPreview';


interface OrderFormProps {
    type: string;
    initialData?: any;
    onSave: (data: any, asDraft?: boolean, auditReason?: string, andPay?: boolean) => void;
    onCancel: () => void;
    onPreview?: () => void;
}

type QuotationWorkflowType = 'General' | 'Examination';

type ExaminationQuotationClassInput = {
    id: string;
    className: string;
    learners: number;
};

type ExaminationQuotationDetails = {
    batchName: string;
    academicYear: string;
    term: string;
    examType: string;
    pricePerLearner: number;
    classes: ExaminationQuotationClassInput[];
};

const createExaminationClassId = () => `EXAM-CLASS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createEmptyExaminationClass = (): ExaminationQuotationClassInput => ({
    id: createExaminationClassId(),
    className: '',
    learners: 0
});

const RECURRING_STATUSES = ['Draft', 'Active', 'Paused', 'Cancelled', 'Expired'] as const;

const cloneSerializable = <T,>(value: T): T => {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const normalizeDateInputValue = (value?: string | null) => {
    const fallback = new Date();
    const parsed = value ? new Date(value) : fallback;
    if (Number.isNaN(parsed.getTime())) {
        return fallback.toISOString().split('T')[0];
    }
    return parsed.toISOString().split('T')[0];
};

const addRecurringFrequency = (dateValue: string, frequency?: string) => {
    const nextDate = new Date(normalizeDateInputValue(dateValue));
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

const getDefaultRecurringNextRunDate = (frequency = 'Monthly', fromDate?: string) => {
    return addRecurringFrequency(normalizeDateInputValue(fromDate), frequency);
};

const normalizeRecurringStatus = (status?: string) => {
    return RECURRING_STATUSES.includes(status as typeof RECURRING_STATUSES[number])
        ? status
        : 'Draft';
};

const normalizeExaminationQuotationDetails = (raw: any): ExaminationQuotationDetails => {
    const currentYear = new Date().getFullYear().toString();
    const rawClasses = Array.isArray(raw?.classes) ? raw.classes : [];
    const classes = rawClasses.length > 0
        ? rawClasses.map((entry: any) => ({
            id: String(entry?.id || createExaminationClassId()),
            className: String(entry?.className || entry?.class_name || '').trim(),
            learners: Math.max(0, Math.floor(Number(entry?.learners ?? entry?.number_of_learners) || 0))
        }))
        : [createEmptyExaminationClass()];

    return {
        batchName: String(raw?.batchName || raw?.batch_name || '').trim(),
        academicYear: String(raw?.academicYear || raw?.academic_year || currentYear).trim() || currentYear,
        term: String(raw?.term || '1').trim() || '1',
        examType: String(raw?.examType || raw?.exam_type || 'Mid-Term').trim() || 'Mid-Term',
        pricePerLearner: Math.max(0, Number(raw?.pricePerLearner ?? raw?.price_per_learner) || 0),
        classes
    };
};

const toSkuToken = (value: string) => {
    const cleaned = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || 'EXAM';
};

const buildExaminationQuotationItems = (details: ExaminationQuotationDetails): CartItem[] => {
    const safePrice = roundToCurrency(Math.max(0, Number(details.pricePerLearner) || 0));
    return details.classes
        .map((entry) => {
            const className = String(entry.className || '').trim();
            const learners = Math.max(0, Math.floor(Number(entry.learners) || 0));

            if (!className || learners <= 0) {
                return null;
            }

            return {
                id: entry.id,
                itemId: entry.id,
                sku: `EXAM-${toSkuToken(details.examType)}-${toSkuToken(className)}`,
                name: `${details.examType} - ${className}`,
                description: `${details.batchName || 'Examination Batch'} | ${details.academicYear} Term ${details.term}`,
                quantity: learners,
                price: safePrice,
                basePrice: safePrice,
                cost: 0,
                category: 'Examination',
                type: 'Service',
                unit: 'learner',
                minStockLevel: 0,
                stock: 0,
                lineTotalNet: roundToCurrency(learners * safePrice),
                adjustmentSnapshots: [],
                serviceDetails: {
                    mode: 'EXAMINATION_QUOTATION',
                    batchName: details.batchName,
                    className,
                    learners,
                    examType: details.examType,
                    academicYear: details.academicYear,
                    term: details.term
                }
            } as CartItem;
        })
        .filter(Boolean) as CartItem[];
};

export const OrderForm: React.FC<OrderFormProps> = ({ type, initialData, onSave, onCancel, onPreview }) => {
    const { inventory = [], marketAdjustments = [], companyConfig, invoices = [], recurringInvoices = [], quotations = [], customerPayments = [], customers = [], accounts = [], notify, addCustomer, updateReservedStock } = useData();
    const { createOrder } = useOrders();
    const { user } = useAuth();
    const { handlePreview } = useDocumentPreview();
    const navigate = useNavigate();
    const currency = companyConfig?.currencySymbol || '$';

    // Derive Customer Names from Transactions and Customers List
    const customerNames = useMemo(() => {
        const names = new Set<string>();
        customers?.forEach(c => names.add(c.name));
        invoices?.forEach(inv => names.add(inv.customerName));
        customerPayments?.forEach(rec => names.add(rec.customerName));
        quotations?.forEach(q => names.add(q.customerName));
        return Array.from(names).sort();
    }, [customers, invoices, customerPayments, quotations]);

    const [formData, setFormData] = useState<any>({
        id: '',
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        customerName: '',
        customerId: '',
        subAccountName: 'Main',
        salesAccountId: companyConfig?.glMapping?.defaultSalesAccount || '4000',
        items: [] as CartItem[],
        status: type === 'Invoice' ? 'Unpaid' : (type === 'Order' ? 'Pending' : 'Draft'),
        discount: 0,
        frequency: 'Monthly',
        autoDeductWallet: false,
        autoEmail: true,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        scheduledDates: [] as string[],
        nextRunDate: getDefaultRecurringNextRunDate(),
        notes: '',
        billingAddress: '',
        shippingAddress: '',
        orderNumber: '',
        orderDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        tax: 0,
        taxRate: 0,
        quotationType: 'General' as QuotationWorkflowType,
        linkedBatchId: '',
        linkedBatchName: '',
        examinationDetails: normalizeExaminationQuotationDetails(null)
    });


    const findCustomerByName = (name: string) => {
        const normalized = name.trim().toLowerCase();
        if (!normalized) return undefined;
        return customers.find(c => c.name.trim().toLowerCase() === normalized);
    };

    const ensureCustomerExists = async (name: string): Promise<Customer | null> => {
        const normalizedName = name.trim();
        if (!normalizedName) return null;

        const existing = findCustomerByName(normalizedName);
        if (existing) return existing;

        if (typeof addCustomer !== 'function') return null;

        const newCustomer: Customer = {
            id: generateNextId('CUST', customers, companyConfig),
            name: normalizedName,
            email: '',
            phone: '',
            balance: 0,
            walletBalance: 0,
            creditLimit: 0,
            status: 'Active',
            segment: 'Individual',
            paymentTerms: getDefaultPaymentTermsForSegment('Individual')
        };

        await addCustomer(newCustomer);
        return newCustomer;
    };

    const selectedCustomerObj = useMemo(() => {
        if (!formData.customerName) return null;
        return findCustomerByName(formData.customerName) || null;
    }, [customers, formData.customerName]);

    const customerSubAccounts = useMemo(() => {
        if (!formData.customerName) return [];

        // Get from Profile
        const profileSubs = selectedCustomerObj?.subAccounts || [];

        // Get from Transactions
        const transactionSubNames = new Set<string>();
        invoices.filter(i => i.customerName === formData.customerName).forEach(i => {
            if (i.subAccountName) transactionSubNames.add(i.subAccountName);
        });
        customerPayments.filter(r => r.customerName === formData.customerName).forEach(r => {
            if (r.subAccountName) transactionSubNames.add(r.subAccountName);
        });

        const subs = [...profileSubs];
        transactionSubNames.forEach(name => {
            if (!subs.find(s => s.name === name) && name !== 'Main') {
                subs.push({ name, accountNumber: 'Legacy/External', walletBalance: 0 });
            }
        });

        return subs.sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedCustomerObj, formData.customerName, invoices, customerPayments]);

    const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);

    // Search States
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [itemSearch, setItemSearch] = useState('');
    const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

    const customerDropdownRef = useRef<HTMLDivElement>(null);
    const itemDropdownRef = useRef<HTMLDivElement>(null);

    const getCustomerOutstanding = (name: string) => {
        return (invoices as Invoice[])
            .filter(i => i.customerName === name && i.status !== 'Paid' && i.status !== 'Draft' && i.status !== 'Cancelled')
            .reduce((sum, i) => sum + (i.totalAmount - (i.paidAmount || 0)), 0);
    };

    const filteredCustomers = useMemo(() => {
        return customerNames.filter((name: string) =>
            name.toLowerCase().includes(customerSearch.toLowerCase())
        );
    }, [customerNames, customerSearch]);

    const filteredInventory = useMemo(() => {
        const base = inventory.filter((i: Item) => i.type !== 'Material');
        if (!itemSearch) return base;
        return base.filter((i: Item) =>
            (i.name.toLowerCase().includes(itemSearch.toLowerCase()) || i.sku.toLowerCase().includes(itemSearch.toLowerCase()))
        );
    }, [inventory, itemSearch]);

    const revenueAccounts = useMemo(() => {
        return (accounts as Account[]).filter(acc => acc.type === 'Revenue' || acc.code.startsWith('4'));
    }, [accounts]);

    const [auditReason, setAuditReason] = useState('');
    const [selectedProductForVariants, setSelectedProductForVariants] = useState<Item | null>(null);
    const [selectedServiceForCalculator, setSelectedServiceForCalculator] = useState<Item | null>(null);
    const [serviceEditIndex, setServiceEditIndex] = useState<number | null>(null);
    const [serviceInitialValues, setServiceInitialValues] = useState<{ pages: number; copies: number }>({ pages: 1, copies: 1 });
    const [selectedManualOverrideItemId, setSelectedManualOverrideItemId] = useState('');
    const [manualOverrideValue, setManualOverrideValue] = useState('');
    const [showManualOverrideCard, setShowManualOverrideCard] = useState(false);
    const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
    const [quickPrintModal, setQuickPrintModal] = useState<{ open: boolean; type: 'photocopy' | 'printing' }>({
      open: false,
      type: 'photocopy'
    });
    const isEditing = !!initialData?.id;
    const [localUnlock, setLocalUnlock] = useState(false);
    const isQuotation = type === 'Quotation';
    const isRecurring = type === 'Recurring';
    const isExaminationQuotation = isQuotation && formData.quotationType === 'Examination';
    const primaryActionLabel = isRecurring
        ? (isEditing
            ? 'Update Subscription'
            : normalizeRecurringStatus(formData.status) === 'Active'
                ? 'Create & Activate Subscription'
                : 'Save Subscription')
        : (isEditing ? 'Commit Secure Patch' : 'Post & Seal Voucher');
    const examinationDetails = useMemo(
        () => normalizeExaminationQuotationDetails(formData.examinationDetails),
        [formData.examinationDetails]
    );
    const generatedExaminationItems = useMemo(
        () => buildExaminationQuotationItems(examinationDetails),
        [examinationDetails]
    );
    const quotationLineItems = useMemo(
        () => (isExaminationQuotation ? generatedExaminationItems : formData.items),
        [formData.items, generatedExaminationItems, isExaminationQuotation]
    );
    const manualOverrideItems = useMemo(
        () => (isExaminationQuotation ? [] : (Array.isArray(formData.items) ? formData.items.filter((entry: any) => !entry?.isVariantParent) : [])),
        [formData.items, isExaminationQuotation]
    );
    const selectedManualOverrideItem = useMemo(
        () => manualOverrideItems.find((entry: any) => entry.id === selectedManualOverrideItemId) || manualOverrideItems[0] || null,
        [manualOverrideItems, selectedManualOverrideItemId]
    );
    const examinationLearnerCount = useMemo(
        () => examinationDetails.classes.reduce((sum, entry) => sum + Math.max(0, Number(entry.learners) || 0), 0),
        [examinationDetails]
    );
    const getPricingDisplayMeta = (label: string) => {
        const normalized = String(label || '').toLowerCase();

        if (normalized.includes('transport') || normalized.includes('logistics') || normalized.includes('delivery')) {
            return { priority: 0, Icon: Truck, iconClass: 'text-blue-500', textClass: 'text-blue-600' };
        }
        if (normalized.includes('waste') || normalized.includes('wastage') || normalized.includes('shrinkage')) {
            return { priority: 1, Icon: Scale, iconClass: 'text-rose-500', textClass: 'text-rose-600' };
        }
        if (normalized.includes('round')) {
            return { priority: 3, Icon: Tag, iconClass: 'text-purple-500', textClass: normalized.includes('-') ? 'text-rose-600' : 'text-purple-600' };
        }
        if (normalized.includes('profit') || normalized.includes('margin')) {
            return { priority: 4, Icon: TrendingUp, iconClass: 'text-emerald-500', textClass: 'text-emerald-600' };
        }
        return { priority: 2, Icon: Tag, iconClass: 'text-indigo-500', textClass: 'text-indigo-600' };
    };
    // Check if price is locked (approved Quote/Order)
    const isPriceLocked = (!localUnlock) && (initialData?.isPriceLocked || (formData.status === 'Approved' || formData.status === 'Completed' || formData.status === 'Paid'));

    const getAutomaticOrderItemPrice = (item: CartItem | null) => {
        if (!item) return 0;

        const explicitOriginal = Number((item as any).originalPrice);
        if (Number.isFinite(explicitOriginal) && explicitOriginal > 0) return explicitOriginal;

        const storedSelling = Number((item as any).selling_price);
        if (Number.isFinite(storedSelling) && storedSelling > 0) return storedSelling;

        const calculatedPrice = Number((item as any).calculated_price);
        if (Number.isFinite(calculatedPrice) && calculatedPrice > 0) return calculatedPrice;

        return Number(item.price) || 0;
    };

    useEffect(() => {
        if (!manualOverrideItems.length) {
            setSelectedManualOverrideItemId('');
            return;
        }

        const currentExists = manualOverrideItems.some((entry: any) => entry.id === selectedManualOverrideItemId);
        if (!selectedManualOverrideItemId || !currentExists) {
            setSelectedManualOverrideItemId(manualOverrideItems[0].id);
        }
    }, [manualOverrideItems, selectedManualOverrideItemId]);

    useEffect(() => {
        if (selectedManualOverrideItem) {
            setManualOverrideValue(String(Number(selectedManualOverrideItem.price || 0)));
        } else {
            setManualOverrideValue('');
        }
    }, [selectedManualOverrideItem]);

    useEffect(() => {
        if (!manualOverrideItems.length) {
            setShowManualOverrideCard(false);
        }
    }, [manualOverrideItems.length]);

    const applyManualLineItemPrice = (targetId: string, newPrice: number) => {
        const safePrice = roundToCurrency(Math.max(0, Number(newPrice) || 0));

        setFormData((prev: any) => ({
            ...prev,
            items: Array.isArray(prev.items)
                ? prev.items.map((entry: any) => {
                    if (entry.id !== targetId) return entry;

                    return {
                        ...entry,
                        price: safePrice,
                        manual_override: true,
                        serviceDetails: entry.serviceDetails
                            ? {
                                ...entry.serviceDetails,
                                unitPricePerCopy: safePrice,
                                totalPrice: safePrice * (Number(entry.quantity) || 1)
                            }
                            : entry.serviceDetails
                    };
                })
                : prev.items
        }));
    };

    const resetManualLineItemPrice = async (targetId: string) => {
        const currentItems = Array.isArray(formData.items) ? [...formData.items] : [];
        const idx = currentItems.findIndex((entry: any) => entry.id === targetId);
        if (idx < 0) return;

        const item = currentItems[idx];

        if (item.type === 'Service' && (item as any).serviceDetails) {
            const cartItem = item as any;
            const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);

            if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
                currentItems[idx] = {
                    ...currentItems[idx],
                    price: cartItem.lockedUnitPricePerCopy,
                    selling_price: cartItem.lockedUnitPricePerCopy,
                    cost: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                    cost_price: cartItem.lockedUnitCostPerCopy || cartItem.cost_price || cartItem.cost,
                    basePrice: cartItem.lockedUnitCostPerCopy || cartItem.basePrice,
                    manual_override: false,
                    serviceDetails: {
                        ...cartItem.serviceDetails,
                        pages,
                        copies: item.quantity,
                        totalPages: pages * item.quantity,
                        unitPricePerCopy: cartItem.lockedUnitPricePerCopy,
                        unitCostPerCopy: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                        totalCost: Number(cartItem.lockedUnitCostPerCopy || cartItem.cost || 0) * item.quantity,
                        totalPrice: cartItem.lockedUnitPricePerCopy * item.quantity
                    }
                };
                setFormData({ ...formData, items: currentItems });
                return;
            }

            const baseService = inventory.find((i: Item) => i.id === (cartItem.itemId || item.id)) || item;
            const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive).map((adj: any) => ({
                name: adj.name,
                type: adj.type,
                value: adj.value,
                percentage: adj.percentage ?? adj.value,
                adjustmentId: adj.id,
                isActive: true
            }));

            const baseCost = Number(baseService.cost) || 0;
            const pricing = await calculateServicePrice({
                itemId: baseService.id,
                categoryId: baseService.category,
                baseCost,
                pages,
                copies: item.quantity,
                adjustments: activeAdjs,
                marketAdjustments: activeAdjs,
                context: 'SERVICE'
            });

            currentItems[idx] = {
                ...currentItems[idx],
                price: pricing.unitPrice,
                selling_price: pricing.unitPrice,
                cost: pricing.cost,
                cost_price: pricing.cost,
                basePrice: pricing.cost,
                adjustmentSnapshots: pricing.adjustmentSnapshots,
                adjustmentTotal: pricing.adjustmentTotal,
                manual_override: false,
                serviceDetails: {
                    pages,
                    copies: item.quantity,
                    totalPages: pages * item.quantity,
                    unitCostPerPage: pricing.cost / pages,
                    unitPricePerCopy: pricing.unitPrice,
                    unitCostPerCopy: pricing.cost,
                    totalCost: baseCost,
                    totalPrice: pricing.totalPrice
                }
            };

            setFormData({ ...formData, items: currentItems });
            return;
        }

        const baseItemId = (item as any).parentId || item.id;
        const baseItem = inventory.find((i: Item) => i.id === baseItemId) || item;
        const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
        const marketAdjustmentsInput = activeAdjs.map((adj: any) => {
            const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
            let calcAmount = 0;
            if (isPercentage) {
                calcAmount = Number(currentItems[idx].cost || baseItem.cost) * (adj.value / 100);
            } else {
                calcAmount = adj.value;
            }
            return {
                name: adj.name,
                type: adj.type || (isPercentage ? 'PERCENTAGE' : 'FIXED'),
                value: adj.value,
                percentage: isPercentage ? adj.value : undefined,
                calculatedAmount: Number((calcAmount || 0).toFixed(2)),
                adjustmentId: adj.id,
                isActive: true
            };
        });

        const normalizedSnapshots = resolveItemAdjustmentSnapshots(item);
        const storedVariantPrice = resolveStoredSellingPrice(item as any);
        const storedVariantCost = resolveStoredCost(item as any);
        const storedVariantAdjustmentTotal = Number(
            (item as any).smartPricingSnapshot?.marketAdjustmentTotal
            ?? (item as any).adjustmentTotal
            ?? normalizedSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
        );

        if ((item as any).parentId && storedVariantPrice > 0) {
            currentItems[idx] = {
                ...currentItems[idx],
                price: storedVariantPrice,
                selling_price: storedVariantPrice,
                calculated_price: resolveStoredCalculatedPrice(item as any) || storedVariantPrice,
                cost: storedVariantCost || currentItems[idx].cost || 0,
                cost_price: storedVariantCost || currentItems[idx].cost_price || currentItems[idx].cost || 0,
                adjustmentSnapshots: normalizedSnapshots,
                adjustmentTotal: storedVariantAdjustmentTotal,
                manual_override: false
            };
            setFormData({ ...formData, items: currentItems });
            return;
        }

        const basePrice = resolveStoredSellingPrice(baseItem as any);
        const priceData = basePrice > 0 ? {
            unitPrice: basePrice,
            cost: Number(currentItems[idx].cost || baseItem.cost) || 0,
            adjustmentTotal: marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0),
            adjustmentSnapshots: marketAdjustmentsInput
        } : await calculateSellingPrice({
            itemId: baseItem.id,
            categoryId: baseItem.category,
            baseCost: Number(currentItems[idx].cost || baseItem.cost) || 0,
            basePrice: Number(currentItems[idx].price || baseItem.price) || undefined,
            quantity: Number(currentItems[idx].quantity) || 1,
            adjustments: marketAdjustmentsInput,
            context: 'ORDER'
        });

        currentItems[idx] = {
            ...currentItems[idx],
            price: priceData.unitPrice,
            selling_price: priceData.unitPrice,
            cost: priceData.cost,
            cost_price: priceData.cost,
            adjustmentSnapshots: priceData.adjustmentSnapshots,
            adjustmentTotal: priceData.adjustmentTotal,
            manual_override: false
        };

        setFormData({ ...formData, items: currentItems });
    };

    // Use inventory cost price and selling price as final — no recalculation
    // For variants with dynamic pricing, calculate from BOM
    const getInventoryPrices = (item: CartItem) => {
        const invItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
        if (!invItem) return { price: item.price, cost: item.cost || 0, adjustmentSnapshots: resolveItemAdjustmentSnapshots(item) };

        // For variants, check pricing mode — prefer SmartPricing snapshot
        if (item.parentId && invItem.variants) {
            const variant = invItem.variants.find(v => v.id === item.id);
            if (variant) {
                const snap = (variant as any).smartPricingSnapshot;
                const resolvedPrice = resolveStoredSellingPrice(variant as any);
                const resolvedCost = resolveStoredCost(variant as any);
                return {
                    price: resolvedPrice,
                    cost: resolvedCost,
                    adjustmentSnapshots: resolveItemAdjustmentSnapshots(variant as any),
                    smartPricingSnapshot: snap
                };
            }
        }

        return {
            price: resolveStoredSellingPrice(invItem) || 0,
            cost: resolveStoredCost(invItem) || 0,
            adjustmentSnapshots: resolveItemAdjustmentSnapshots(invItem as any)
        };
    };

    useEffect(() => {
        let mounted = true;
        dbService.getAll<BOMTemplate>('bomTemplates')
            .then((templates) => {
                if (mounted) setBomTemplates(templates || []);
            })
            .catch((err) => {
                console.error('Failed to load BOM templates for OrderForm service pricing', err);
            });

        return () => {
            mounted = false;
        };
    }, []);

    // Auto-calculate payment terms + due date from segment policy.
    useEffect(() => {
        if (!formData.customerName) return;

        const customer = findCustomerByName(formData.customerName);
        if (!customer) return;

        const transactionType = type === 'Quotation'
            ? 'quotation'
            : type === 'Order'
                ? 'order'
                : 'invoice';
        const { paymentTerms, dueDate } = resolveCustomerPaymentPolicy({
            customer,
            subAccountName: formData.subAccountName,
            transactionType,
            issuedDate: formData.date,
            preserveCustomTerms: true
        });

        setFormData(prev => {
            if (prev.paymentTerms === paymentTerms && prev.dueDate === dueDate) {
                return prev;
            }

            return {
                ...prev,
                paymentTerms,
                dueDate
            };
        });
    }, [customers, formData.customerName, formData.date, formData.subAccountName, type]);

    const releaseReservedItems = (items: CartItem[]) => {
        items.forEach((item: any) => {
            const itemId = item.parentId || item.id;
            const variantId = item.parentId ? item.id : undefined;
            if (item.type !== 'Service') {
                updateReservedStock(itemId, -(item.quantity || 0), `Quotation type changed`, variantId);
            }
        });
    };

    const handleQuotationTypeChange = (nextType: QuotationWorkflowType) => {
        if (!isQuotation || formData.quotationType === nextType) return;

        if (Array.isArray(formData.items) && formData.items.length > 0) {
            releaseReservedItems(formData.items);
        }

        setFormData((prev: any) => ({
            ...prev,
            quotationType: nextType,
            items: [],
            linkedBatchId: nextType === 'Examination' ? prev.linkedBatchId || '' : '',
            linkedBatchName: nextType === 'Examination' ? prev.linkedBatchName || '' : '',
            examinationDetails: normalizeExaminationQuotationDetails(prev.examinationDetails)
        }));
    };

    const updateExaminationDetails = (updater: (prev: ExaminationQuotationDetails) => ExaminationQuotationDetails) => {
        setFormData((prev: any) => ({
            ...prev,
            examinationDetails: updater(normalizeExaminationQuotationDetails(prev.examinationDetails))
        }));
    };

    const handleAddExaminationClass = () => {
        updateExaminationDetails((prev) => ({
            ...prev,
            classes: [...prev.classes, createEmptyExaminationClass()]
        }));
    };

    const handleUpdateExaminationClass = (
        classId: string,
        field: keyof Pick<ExaminationQuotationClassInput, 'className' | 'learners'>,
        value: string
    ) => {
        updateExaminationDetails((prev) => ({
            ...prev,
            classes: prev.classes.map((entry) => {
                if (entry.id !== classId) return entry;
                return {
                    ...entry,
                    [field]: field === 'learners'
                        ? Math.max(0, Math.floor(Number(value) || 0))
                        : value
                };
            })
        }));
    };

    const handleRemoveExaminationClass = (classId: string) => {
        updateExaminationDetails((prev) => {
            const remaining = prev.classes.filter((entry) => entry.id !== classId);
            return {
                ...prev,
                classes: remaining.length > 0 ? remaining : [createEmptyExaminationClass()]
            };
        });
    };

    const analysis = useMemo(() => {
        let totalGross = 0;
        let totalNet = 0;
        let totalCostPrice = 0;
        const adjustmentBreakdown: Record<string, number> = {};

        const processedItems = quotationLineItems.map((item: CartItem) => {
            const lineBase = (Number(item.basePrice || item.price) || 0) * item.quantity;
            totalNet += lineBase;

            const lineTotal = (Number(item.price) || 0) * item.quantity;
            totalGross += lineTotal;

            // Resolve Inventory Item & Cost
            const invItem = inventory.find((i: Item) => i.id === (item.parentId || item.id));
            let itemCost = item.cost || 0;

            if ((item as any).serviceDetails) {
                // Dynamic services carry calculated unit cost directly on the line
                itemCost = Number(item.cost) || 0;
            } else if (invItem) {
                // For variants, use the variant cost if available, otherwise parent cost
                const variant = item.parentId && invItem.variants
                    ? invItem.variants.find((v: any) => v.id === item.id)
                    : null;
                itemCost = variant ? (variant.cost || 0) : invItem.cost;
            }
            totalCostPrice += itemCost * item.quantity;

            // Aggregate adjustments (Use stored snapshots OR calculate dynamically if missing)
            let currentSnapshots = resolveItemAdjustmentSnapshots(item);

            // SmartPricing variants have their price fully computed and stored by the engine.
            // Do NOT re-apply market adjustments — their adjustments are already baked in.
            const isSmartPricingVariant = !!(item as any).parentId && !!(item as any).smartPricingSnapshot;

            if (!currentSnapshots || currentSnapshots.length === 0) {
                if (isSmartPricingVariant) {
                    // Price is final — skip the dynamic fallback entirely to avoid double-applying
                    // logistics, market adjustments, and other modifiers.
                    currentSnapshots = [];
                } else {
                    // Calculation fallback for legacy items or missing snapshots
                    // Filter active adjustments
                    const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);

                    currentSnapshots = activeAdjs.map((adj: any) => {
                        let calcAmount = 0;
                        // Determine amount based on type
                        const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';

                        if (isPercentage) {
                            calcAmount = itemCost * (adj.value / 100);
                        } else {
                            calcAmount = adj.value;
                        }

                        return {
                            name: adj.name,
                            type: adj.type || (isPercentage ? 'PERCENTAGE' : 'FIXED'),
                            value: adj.value,
                            percentage: isPercentage ? adj.value : undefined,
                            // Ensure calcAmount is a number
                            calculatedAmount: Number((calcAmount || 0).toFixed(2))
                        };
                    });
                }
            }

            // Calculate totals for summary
            if (currentSnapshots && currentSnapshots.length > 0) {
                getMarketAdjustmentSnapshots(currentSnapshots).forEach((snap: any) => {
                    const amount = getSnapshotCalculatedAmount(snap) * item.quantity;
                    const name = snap.name || 'Other Adjustment';
                    adjustmentBreakdown[name] = (adjustmentBreakdown[name] || 0) + amount;
                });
            }

            return attachPricingBreakdown({
                ...item,
                // Attach effective snapshots so they are saved/displayed
                adjustmentSnapshots: currentSnapshots,
                lineTotalNet: lineTotal
            });
        });

        const pricingSummary = summarizePricingBreakdown(processedItems as any[]);

        const currentTaxRate = companyConfig?.taxRate || 0;
        const taxAmount = (companyConfig?.enableTax) ? (totalGross - (formData.discount || 0)) * (currentTaxRate / 100) : 0;
        const finalTotal = totalGross - Number(formData.discount || 0) + taxAmount;

        return {
            subTotal: totalNet,
            totalCostPrice,
            totalAmount: finalTotal,
            tax: taxAmount,
            taxRate: currentTaxRate,
            processedItems,
            adjustmentBreakdown,
            pricingSummary
        };
    }, [quotationLineItems, formData.discount, inventory, marketAdjustments, companyConfig]);

    const finalDisplayTotal = analysis.totalAmount;
    const orderedAdjustmentEntries = useMemo(() => {
        return Object.entries(analysis.adjustmentBreakdown).sort(([nameA], [nameB]) => {
            const metaA = getPricingDisplayMeta(nameA);
            const metaB = getPricingDisplayMeta(nameB);
            if (metaA.priority !== metaB.priority) return metaA.priority - metaB.priority;
            return nameA.localeCompare(nameB);
        });
    }, [analysis.adjustmentBreakdown]);

    useEffect(() => {
        if (!initialData) {
            let key = 'invoice';
            let collection = invoices;

            if (type === 'Quotation') {
                key = 'quotation';
                collection = quotations;
            } else if (type === 'Recurring') {
                key = 'REC';
                collection = recurringInvoices;
            } else if (type === 'Order') {
                key = 'order';
                collection = []; // Orders are in OrdersContext/Store, not DataContext
            }

            setFormData((prev: any) => ({ ...prev, id: generateNextId(key, collection, companyConfig) }));
        } else {
            const clonedItems = Array.isArray(initialData.items) ? cloneSerializable(initialData.items) : [];
            const clonedScheduledDates = Array.isArray(initialData.scheduledDates)
                ? [...initialData.scheduledDates].map((date: any) => String(date))
                : [];
            const resolvedRecurringStatus = normalizeRecurringStatus(initialData.status);
            const fallbackId = initialData.id || generateNextId(
                type === 'Quotation' ? 'quotation' : type === 'Recurring' ? 'REC' : type === 'Order' ? 'order' : 'invoice',
                type === 'Quotation' ? quotations : type === 'Recurring' ? recurringInvoices : type === 'Order' ? [] : invoices,
                companyConfig
            );

            setFormData((prev: any) => ({
                ...prev,
                ...initialData,
                id: fallbackId,
                // Ensure fields are not undefined to prevent uncontrolled input warnings
                customerName: initialData.customerName || '',
                customerId: initialData.customerId || '',
                subAccountName: initialData.subAccountName || 'Main',
                salesAccountId: initialData.salesAccountId || companyConfig?.glMapping?.defaultSalesAccount || '4000',
                items: clonedItems,
                status: isRecurring
                    ? resolvedRecurringStatus
                    : (initialData.status || (type === 'Invoice' ? 'Unpaid' : (type === 'Order' ? 'Pending' : 'Draft'))),
                discount: initialData.discount || 0,
                date: initialData.date || prev.date,
                dueDate: initialData.dueDate || prev.dueDate,
                paymentTerms: initialData.paymentTerms || prev.paymentTerms,
                paymentMethod: initialData.paymentMethod || 'Cash',
                frequency: initialData.frequency || prev.frequency,
                startDate: isRecurring
                    ? normalizeDateInputValue(initialData.startDate || initialData.date || prev.startDate)
                    : (initialData.startDate || prev.startDate),
                endDate: initialData.endDate || '',
                scheduledDates: clonedScheduledDates,
                nextRunDate: isRecurring
                    ? normalizeDateInputValue(initialData.nextRunDate || getDefaultRecurringNextRunDate(initialData.frequency || prev.frequency, initialData.startDate || initialData.date || prev.startDate))
                    : initialData.nextRunDate || prev.nextRunDate,
                quotationType: initialData.quotationType || 'General',
                linkedBatchId: initialData.linkedBatchId || '',
                linkedBatchName: initialData.linkedBatchName || '',
                examinationDetails: normalizeExaminationQuotationDetails(initialData.examinationDetails)
            }));
            setCustomerSearch(initialData.customerName || '');
        }
    }, [type, initialData, invoices, recurringInvoices, quotations, companyConfig, isRecurring]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
                setIsCustomerDropdownOpen(false);
            }
            if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
                setIsItemDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const openServiceCalculator = (service: Item, editIndex: number | null = null, initial?: { pages: number; copies: number }) => {
        setSelectedServiceForCalculator(service);
        setServiceEditIndex(editIndex);
        setServiceInitialValues({
            pages: Math.max(1, Number(initial?.pages || service.pages || 1)),
            copies: Math.max(1, Number(initial?.copies || 1))
        });
    };

    const handleServicePricingConfirm = async (pricing: DynamicServicePricingResult) => {
        if (!selectedServiceForCalculator) return;

        const service = selectedServiceForCalculator;

        const pricedLine: CartItem = {
            ...service,
            quantity: pricing.copies,
            discount: 0,
            price: pricing.unitPricePerCopy,
            cost: pricing.unitCostPerCopy,
            basePrice: pricing.unitCostPerCopy,
            adjustmentSnapshots: pricing.adjustmentSnapshots || [],
            adjustmentTotal: pricing.adjustmentTotal,
            pagesOverride: pricing.pages,
            serviceDetails: pricing.serviceDetails,
            // Store price lock information to prevent recalculation on quantity changes
            priceLocked: pricing.priceLocked || false,
            lockedTotalPrice: pricing.lockedTotalPrice,
            lockedUnitPricePerCopy: pricing.lockedUnitPricePerCopy,
            lockedUnitCostPerCopy: pricing.lockedUnitCostPerCopy
        } as any;

        // Work with the current formData snapshot to compute merges synchronously
        const currentItems = Array.isArray(formData.items) ? [...formData.items] : [];

        if (serviceEditIndex !== null && serviceEditIndex >= 0 && serviceEditIndex < currentItems.length) {
            currentItems[serviceEditIndex] = {
                ...currentItems[serviceEditIndex],
                ...pricedLine
            };
            setFormData({ ...formData, items: currentItems });
            notify(`${service.name} ${serviceEditIndex !== null ? 'updated' : 'added'}`, "success");
            setSelectedServiceForCalculator(null);
            setServiceEditIndex(null);
            return;
        }

        const existingIdx = currentItems.findIndex((line: any) =>
            line.type === 'Service'
            && !line.parentId
            && line.id === service.id
            && Number(line.serviceDetails?.pages || line.pagesOverride || 0) === pricing.pages
        );

        if (existingIdx > -1) {
            const mergedCopies = Number(currentItems[existingIdx].quantity || 0) + pricing.copies;

            // If price is locked, maintain the locked unit price and scale the total
            if (pricing.priceLocked && pricing.lockedUnitPricePerCopy !== undefined) {
                currentItems[existingIdx] = {
                    ...currentItems[existingIdx],
                    quantity: mergedCopies,
                    price: pricing.lockedUnitPricePerCopy,
                    cost: pricing.lockedUnitCostPerCopy || currentItems[existingIdx].cost,
                    basePrice: pricing.lockedUnitCostPerCopy || currentItems[existingIdx].basePrice,
                    pagesOverride: pricing.pages,
                    adjustmentSnapshots: pricing.adjustmentSnapshots || [],
                    adjustmentTotal: pricing.adjustmentTotal,
                    serviceDetails: pricing.serviceDetails,
                    priceLocked: true,
                    lockedTotalPrice: pricing.lockedTotalPrice,
                    lockedUnitPricePerCopy: pricing.lockedUnitPricePerCopy,
                    lockedUnitCostPerCopy: pricing.lockedUnitCostPerCopy
                };

                setFormData({ ...formData, items: currentItems });
            } else {
                // If not locked, recalculate pricing using engine
                const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive).map((adj: any) => ({
                    name: adj.name,
                    type: adj.type,
                    value: adj.value,
                    percentage: adj.percentage ?? adj.value,
                    adjustmentId: adj.id,
                    isActive: true
                }));

                const baseCost = Number(service.cost) || 0;
                const mergedPricing = await calculateServicePrice({
                    itemId: service.id,
                    categoryId: service.category,
                    baseCost: baseCost,
                    pages: pricing.pages,
                    copies: mergedCopies,
                    adjustments: activeAdjs,
                    marketAdjustments: activeAdjs,
                    context: 'SERVICE'
                });

                const totalPages = pricing.pages * mergedCopies;
                currentItems[existingIdx] = {
                    ...currentItems[existingIdx],
                    quantity: mergedCopies,
                    price: mergedPricing.unitPrice,
                    cost: mergedPricing.cost,
                    basePrice: mergedPricing.cost,
                    pagesOverride: pricing.pages,
                    adjustmentSnapshots: mergedPricing.adjustmentSnapshots,
                    adjustmentTotal: mergedPricing.adjustmentTotal,
                    serviceDetails: {
                        pages: pricing.pages,
                        copies: mergedCopies,
                        totalPages,
                        unitCostPerPage: mergedPricing.cost / pricing.pages,
                        unitPricePerCopy: mergedPricing.unitPrice,
                        unitCostPerCopy: mergedPricing.cost,
                        totalCost: baseCost,
                        totalPrice: mergedPricing.totalPrice
                    }
                };

                setFormData({ ...formData, items: currentItems });
            }
        } else {
            currentItems.push(pricedLine);
            setFormData({ ...formData, items: currentItems });
        }

        notify(`${service.name} ${serviceEditIndex !== null ? 'updated' : 'added'}`, "success");
        setSelectedServiceForCalculator(null);
        setServiceEditIndex(null);
    };

    const handleEditServiceConfiguration = (idx: number) => {
        const line = formData.items[idx];
        if (!line || line.type !== 'Service') return;

        const baseService = inventory.find((i: Item) => i.id === ((line as any).itemId || line.id)) || line;
        openServiceCalculator(baseService, idx, {
            pages: Number((line as any).serviceDetails?.pages || line.pagesOverride || 1),
            copies: Number((line as any).serviceDetails?.copies || line.quantity || 1)
        });
    };

    const handleSubmission = async (asDraft: boolean, andPay: boolean = false) => {
        if (!formData.customerName || analysis.processedItems.length === 0) {
            notify("Selection of customer and items is required.", "error");
            return;
        }

        if (isRecurring && !formData.nextRunDate) {
            notify("Next billing date is required for a subscription.", "error");
            return;
        }
        if (isRecurring && !formData.startDate) {
            notify("Start date is required for a subscription.", "error");
            return;
        }
        if (isRecurring && formData.endDate && new Date(formData.endDate).getTime() < new Date(formData.startDate).getTime()) {
            notify("End date cannot be earlier than the subscription start date.", "error");
            return;
        }

        let normalizedExaminationDetails = examinationDetails;
        if (isExaminationQuotation) {
            normalizedExaminationDetails = normalizeExaminationQuotationDetails(formData.examinationDetails);
            const classesWithAnyInput = normalizedExaminationDetails.classes.filter((entry) =>
                String(entry.className || '').trim() || Math.max(0, Number(entry.learners) || 0) > 0
            );
            const validClasses = classesWithAnyInput.filter((entry) =>
                String(entry.className || '').trim() && Math.max(0, Number(entry.learners) || 0) > 0
            );

            if (!normalizedExaminationDetails.batchName) {
                notify("Batch name is required for an examination quotation.", "error");
                return;
            }
            if (!normalizedExaminationDetails.examType) {
                notify("Examination type is required.", "error");
                return;
            }
            if (normalizedExaminationDetails.pricePerLearner <= 0) {
                notify("Price per learner must be greater than zero.", "error");
                return;
            }
            if (classesWithAnyInput.length === 0 || validClasses.length === 0) {
                notify("Add at least one class with a learner count for an examination quotation.", "error");
                return;
            }
            if (validClasses.length !== classesWithAnyInput.length) {
                notify("Each examination class needs both a class name and a learner count greater than zero.", "error");
                return;
            }

            const classNames = new Set<string>();
            for (const entry of validClasses) {
                const key = entry.className.trim().toLowerCase();
                if (classNames.has(key)) {
                    notify(`Duplicate class detected: ${entry.className}. Please keep class names unique.`, "error");
                    return;
                }
                classNames.add(key);
            }

            normalizedExaminationDetails = {
                ...normalizedExaminationDetails,
                classes: validClasses
            };
        }

        let resolvedCustomerName = formData.customerName.trim();
        let resolvedCustomerId = formData.customerId || '';

        const existingCustomer = findCustomerByName(resolvedCustomerName);
        if (existingCustomer) {
            resolvedCustomerName = existingCustomer.name;
            resolvedCustomerId = existingCustomer.id;
        } else {
            try {
                const createdCustomer = await ensureCustomerExists(resolvedCustomerName);
                if (createdCustomer) {
                    resolvedCustomerName = createdCustomer.name;
                    resolvedCustomerId = createdCustomer.id;
                }
            } catch (err: any) {
                notify(`Failed to add client: ${err.message || 'Unknown error'}`, "error");
                return;
            }
        }

        if (!resolvedCustomerId) {
            notify("Unable to resolve a valid client record. Please add/select a client and try again.", "error");
            return;
        }

        // Aggregate adjustments & consumption from items (Common logic for all types)
        const consumptionSnapshots: any[] = [];

        analysis.processedItems.forEach((item: any) => {
            if (item.consumptionSnapshots) {
                consumptionSnapshots.push(...item.consumptionSnapshots);
            }
        });
        const aggregatedSnapshots = aggregateMarketAdjustmentSnapshots(analysis.processedItems as any[]);

        const finalTotalAmount = analysis.totalAmount;

        if (type === 'Order') {
            if (formData.status === 'Completed' && !formData.shippingAddress) {
                notify("Shipping address is required for completed orders.", "error");
                return;
            }

            const orderItems: OrderItem[] = analysis.processedItems.map((item: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                orderId: formData.id,
                productId: item.id,
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                subtotal: item.lineTotalNet,
                total: item.lineTotalNet,
                discount: item.discount || 0,
                adjustmentSnapshots: item.adjustmentSnapshots, // Save per-item snapshots
                adjustmentTotal: item.adjustmentTotal || item.pricingBreakdown?.adjustmentTotal || 0,
                pricingBreakdown: item.pricingBreakdown,
                smartPricingSnapshot: item.smartPricingSnapshot,
                productionCostSnapshot: item.productionCostSnapshot, // If available
                variantId: item.parentId ? item.id : item.variantId,
                parentId: item.parentId,
                serviceDetails: (item as any).serviceDetails
            }));

            const paidAmount = andPay ? finalTotalAmount : 0;
            const payments: OrderPayment[] = andPay ? [{
                id: `PAY-${Date.now()}`,
                orderId: formData.id,
                amountPaid: finalTotalAmount,
                paymentDate: new Date().toISOString(),
                paymentMethod: formData.paymentMethod as any,
                recordedBy: user?.name || user?.username || 'System',
                reference: `Initial payment for Order #${formData.id}`
            }] : [];

            await createOrder({
                id: formData.id,
                orderNumber: formData.id,
                customerId: resolvedCustomerId,
                customerName: resolvedCustomerName,
                orderDate: formData.date,
                status: asDraft ? 'Pending' : (formData.status === 'Draft' ? 'Pending' : formData.status),
                items: orderItems,
                totalAmount: finalTotalAmount,
                paidAmount: paidAmount,
                discount: formData.discount,
                notes: formData.notes,
                billingAddress: formData.billingAddress,
                shippingAddress: formData.shippingAddress,
                createdBy: user?.name || user?.username || 'System',
                payments: payments,
                // Add aggregated snapshots to Order root for reporting
                adjustmentSnapshots: aggregatedSnapshots,
                adjustmentTotal: analysis.pricingSummary.adjustmentTotal,
                materialTotal: analysis.pricingSummary.materialTotal,
                profitMarginTotal: analysis.pricingSummary.profitMarginTotal,
                roundingTotal: analysis.pricingSummary.roundingTotal,
                roundingDifference: analysis.pricingSummary.roundingTotal,
                consumptionSnapshots: consumptionSnapshots,
                subtotal: finalTotalAmount, // Ensure subtotal is present if required by types
                tax: analysis.tax,
                taxRate: analysis.taxRate
            } as any); // Cast as any to bypass strict type checking if Order interface update isn't immediately picked up by IDE cache
            onCancel();
            return;
        }

        const finalData = {
            ...formData,
            customerId: resolvedCustomerId,
            customerName: resolvedCustomerName,
            customerPhone: selectedCustomerObj?.phone || formData.customerPhone || '',
            customerEmail: selectedCustomerObj?.email || formData.customerEmail || '',
            customerAddress: formData.billingAddress || formData.shippingAddress || selectedCustomerObj?.billingAddress || selectedCustomerObj?.address || '',
            items: analysis.processedItems,
            totalAmount: finalTotalAmount,
            total: finalTotalAmount,
            status: isRecurring
                ? normalizeRecurringStatus(asDraft ? 'Draft' : formData.status)
                : (asDraft ? 'Draft' : (formData.status || 'Unpaid')),
            materialTotal: analysis.pricingSummary.materialTotal,
            adjustmentTotal: analysis.pricingSummary.adjustmentTotal,
            adjustmentSnapshots: aggregatedSnapshots,
            profitMarginTotal: analysis.pricingSummary.profitMarginTotal,
            roundingTotal: analysis.pricingSummary.roundingTotal,
            roundingDifference: analysis.pricingSummary.roundingTotal,
            consumptionSnapshots: consumptionSnapshots,
            tax: analysis.tax,
            taxRate: analysis.taxRate,
            paymentTerms: formData.paymentTerms,
            startDate: isRecurring ? normalizeDateInputValue(formData.startDate || formData.date) : formData.startDate,
            endDate: isRecurring ? (formData.endDate || '') : formData.endDate,
            scheduledDates: isRecurring ? [...(formData.scheduledDates || [])].sort() : formData.scheduledDates,
            nextRunDate: isRecurring
                ? normalizeDateInputValue(formData.nextRunDate || getDefaultRecurringNextRunDate(formData.frequency || 'Monthly', formData.startDate || formData.date))
                : formData.nextRunDate,
            createdBy: user?.name || user?.username || 'System User',
            quotationType: isExaminationQuotation ? 'Examination' : 'General',
            examinationDetails: isExaminationQuotation ? normalizedExaminationDetails : null,
            linkedBatchId: isExaminationQuotation ? (formData.linkedBatchId || '') : '',
            linkedBatchName: isExaminationQuotation ? (formData.linkedBatchName || '') : ''
        };

        onSave(finalData, asDraft, auditReason, andPay);
    };

    const handleQuickService = (serviceName: string) => {
        // Set the quick print modal state based on service name
        if (serviceName === 'Printing') {
            setQuickPrintModal({ open: true, type: 'printing' });
        } else if (serviceName === 'Photocopy') {
            setQuickPrintModal({ open: true, type: 'photocopy' });
        }
    };

    const handleQuickPrintConfirm = (quantity: number, pagesPerCopy: number, total: number, printType: 'photocopy' | 'printing', pinningCost?: number, pinningCount?: number) => {
        const isPhotocopy = printType === 'photocopy';
        const pricePerPage = isPhotocopy 
          ? (companyConfig.transactionSettings?.pos?.photocopyPrice || 2.00)
          : (companyConfig.transactionSettings?.pos?.typePrintingPrice || 5.00);

        // For quick print, we use the total FROM THE MODAL (which includes stapling if configured)
        // This ensures the cart calculation matches the modal total
        const finalPrice = total;

        const newItem: CartItem = {
          id: `QUICK-${isPhotocopy ? 'PHOTO' : 'PRINT'}-${Date.now()}`,
          itemId: isPhotocopy ? 'SVC-PHOTOCOPY' : 'SVC-TYPE-PRINT',
          name: isPhotocopy ? 'Quick Photocopy' : 'Type & Printing',
          sku: isPhotocopy ? 'QUICK-PHOTO' : 'QUICK-PRINT',
          desc: isPhotocopy 
            ? `Quick Photocopy (${pagesPerCopy} pages × ${quantity} copies)`
            : `Type & Printing (${pagesPerCopy} pages × ${quantity} copies)`,
          price: finalPrice,
          quantity: 1,
          pagesOverride: pagesPerCopy,
          category: 'Service',
          type: 'Service',
          unit: 'page',
          pages: pagesPerCopy,
          stock: 9999,
          minStockLevel: 0,
          adjustedPrice: finalPrice,
          priceLocked: true,
          lockedUnitPricePerCopy: finalPrice,
          serviceDetails: {
            pages: pagesPerCopy,
            copies: quantity,
            pinningCost: pinningCost,
            pinningCount: pinningCount
          }
        } as any;

        setFormData((prev: any) => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        notify(`${quantity}x${pagesPerCopy} pages added to voucher`, 'success');
    };

const handleAddItem = async (item: Item) => {
        if (item.isVariantParent) {
            setSelectedProductForVariants(item);
            return;
        }

        if (item.type === 'Service') {
            openServiceCalculator(item, null, { pages: item.pages || 1, copies: 1 });
            setItemSearch('');
            return;
        }

        const existingItemIdx = formData.items.findIndex((i: any) => i.id === item.id && !i.parentId);

        if (existingItemIdx > -1) {
            await handleQuantityChange(existingItemIdx, formData.items[existingItemIdx].quantity + 1);
            notify(`Incremented quantity for ${item.name}`, "success");
        } else {
            if (item.type !== 'Service') {
                updateReservedStock(item.id, 1, `Selection in ${type} Form`);
            }

            const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
            const marketAdjustmentsInput = activeAdjs.map((adj: any) => {
                const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
                let calcAmount = 0;
                if (isPercentage) {
                    calcAmount = Number(item.cost) * (adj.value / 100);
                } else {
                    calcAmount = adj.value;
                }
                return {
                    name: adj.name,
                    type: adj.type || (isPercentage ? 'PERCENTAGE' : 'FIXED'),
                    value: adj.value,
                    percentage: isPercentage ? adj.value : undefined,
                    calculatedAmount: Number((calcAmount || 0).toFixed(2)),
                    adjustmentId: adj.id,
                    isActive: true
                };
            });

            const pricing = item.price && item.price > 0 ? {
                unitPrice: item.price,
                cost: Number(item.cost),
                adjustmentTotal: marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0),
                adjustmentSnapshots: marketAdjustmentsInput
            } : await calculateSellingPrice({
                itemId: item.id,
                categoryId: item.category,
                baseCost: Number(item.cost),
                quantity: 1,
                adjustments: marketAdjustmentsInput,
                context: 'ORDER'
            });

            const newItem: CartItem = {
                ...item,
                quantity: 1,
                discount: 0,
                price: pricing.unitPrice,
                cost: pricing.cost,
                basePrice: pricing.cost,
                adjustmentSnapshots: pricing.adjustmentSnapshots,
                adjustmentTotal: pricing.adjustmentTotal,
                pagesOverride: (item as any).pages
            };

            setFormData((prev: any) => ({
                ...prev,
                items: [...prev.items, newItem]
            }));
            notify(`${item.name} added`, "success");
        }

        setItemSearch('');
    };

const handleVariantSelect = async (variant: ProductVariant) => {
        if (!selectedProductForVariants) return;

        const normalizedAdjustmentSnapshots = resolveItemAdjustmentSnapshots(variant as any);

        const existingItemIdx = formData.items.findIndex((i: any) => i.id === variant.id && i.parentId === selectedProductForVariants.id);

        if (existingItemIdx > -1) {
            await handleQuantityChange(existingItemIdx, formData.items[existingItemIdx].quantity + 1);
            notify(`Incremented quantity for ${variant.name}`, "success");
        } else {
            const parentItem = selectedProductForVariants;
            const variantItem: any = {
                ...selectedProductForVariants,
                id: variant.id,
                parentId: selectedProductForVariants.id,
                sku: variant.sku,
                name: variant.name,
                price: resolveStoredSellingPrice(variant as any) || 0,
                selling_price: resolveStoredSellingPrice(variant as any) || 0,
                calculated_price: resolveStoredCalculatedPrice(variant as any) || 0,
                cost: resolveStoredCost(variant as any) || 0,
                cost_price: resolveStoredCost(variant as any) || 0,
                stock: variant.stock,
                isVariantParent: false,
                variants: [],
                pagesOverride: variant.pages,
                pricingSource: variant.pricingSource,
                productionCostSnapshot: variant.productionCostSnapshot,
                quantity: (variant as any).quantity || 1
            };

            const quantity = (variantItem as any).quantity || 1;

            updateReservedStock(selectedProductForVariants.id, quantity, `Variant selection in ${type} Form`, variant.id);

            const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
            const marketAdjustmentsInput = activeAdjs.map((adj: any) => {
                const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
                let calcAmount = 0;
                if (isPercentage) {
                    calcAmount = Number(variantItem.cost) * (adj.value / 100);
                } else {
                    calcAmount = adj.value;
                }
                return {
                    name: adj.name,
                    type: adj.type || (isPercentage ? 'PERCENTAGE' : 'FIXED'),
                    value: adj.value,
                    percentage: isPercentage ? adj.value : undefined,
                    calculatedAmount: Number((calcAmount || 0).toFixed(2)),
                    adjustmentId: adj.id,
                    isActive: true
                };
            });

            // SmartPricing variants: price is already fully computed by the engine
            // and stored on the variant. Using calculateSellingPrice with the material
            // baseCost would re-derive a wrong price (ignores margin + rounding already applied).
            const snapPrice = resolveStoredSellingPrice(variant as any);
            const snapCost = resolveStoredCost(variant as any);
            const snapAdjTotal = Number(
                (variant as any).smartPricingSnapshot?.marketAdjustmentTotal
                ?? (variant as any).adjustmentTotal
                ?? normalizedAdjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
            );
            const snapAdjSnaps = normalizedAdjustmentSnapshots;

            if (snapPrice > 0) {
                // Use the stored SmartPricing price directly
                variantItem.price = snapPrice;
                variantItem.selling_price = snapPrice;
                variantItem.calculated_price = resolveStoredCalculatedPrice(variant as any) || snapPrice;
                variantItem.cost = snapCost;
                variantItem.cost_price = snapCost;
                variantItem.basePrice = snapCost;
                variantItem.adjustmentSnapshots = snapAdjSnaps;
                variantItem.adjustmentTotal = snapAdjTotal;
                variantItem.smartPricingSnapshot = (variant as any).smartPricingSnapshot;
            } else {
                // Fallback: no stored price — run the engine
                const pricing = await calculateSellingPrice({
                    itemId: parentItem.id, // Use parent for margin/category lookup
                    categoryId: parentItem.category,
                    baseCost: Number(variantItem.cost) || 0,
                    basePrice: Number(variantItem.price) || undefined,
                    quantity: 1,
                    adjustments: marketAdjustmentsInput,
                    context: 'ORDER'
                });
                variantItem.price = pricing.unitPrice;
                variantItem.selling_price = pricing.unitPrice;
                variantItem.calculated_price = pricing.unitPrice;
                variantItem.cost = pricing.cost;
                variantItem.cost_price = pricing.cost;
                variantItem.basePrice = pricing.cost;
                variantItem.adjustmentSnapshots = pricing.adjustmentSnapshots;
                variantItem.adjustmentTotal = pricing.adjustmentTotal;
            }

            setFormData((prev: any) => ({
                ...prev,
                items: [...prev.items, variantItem]
            }));

            notify(`${variant.name} added`, "success");
        }

        setSelectedProductForVariants(null);
        setItemSearch('');
    };

    const handleQuantityChange = async (idx: number, newValue: number) => {
        if (isPriceLocked) return; // Prevent change if locked

        const item = formData.items[idx];
        const safeQty = Math.max(1, Math.floor(Number(newValue) || 1));

        if (item.type === 'Service' && (item as any).serviceDetails) {
            const cartItem = item as any;

            if (cartItem.manual_override) {
                const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);
                const newItems = [...formData.items];
                newItems[idx] = {
                    ...newItems[idx],
                    quantity: safeQty,
                    manual_override: true,
                    serviceDetails: {
                        ...cartItem.serviceDetails,
                        pages,
                        copies: safeQty,
                        totalPages: pages * safeQty,
                        unitCostPerPage: pages > 0 ? Number(cartItem.cost || 0) / pages : 0,
                        unitPricePerCopy: cartItem.price,
                        unitCostPerCopy: cartItem.cost,
                        totalCost: Number(cartItem.cost || 0) * safeQty,
                        totalPrice: Number(cartItem.price || 0) * safeQty
                    }
                };

                setFormData({ ...formData, items: newItems });
                return;
            }

            // If price is locked, maintain the locked unit price without recalculation
            if (cartItem.priceLocked && cartItem.lockedUnitPricePerCopy !== undefined) {
                const newItems = [...formData.items];
                newItems[idx] = {
                    ...newItems[idx],
                    quantity: safeQty,
                    price: cartItem.lockedUnitPricePerCopy,
                    cost: cartItem.lockedUnitCostPerCopy || cartItem.cost,
                    basePrice: cartItem.lockedUnitCostPerCopy || cartItem.basePrice,
                    // Preserve locked price information
                    priceLocked: true,
                    lockedTotalPrice: cartItem.lockedTotalPrice,
                    lockedUnitPricePerCopy: cartItem.lockedUnitPricePerCopy,
                    lockedUnitCostPerCopy: cartItem.lockedUnitCostPerCopy
                };

                setFormData({ ...formData, items: newItems });
                return;
            }

            // If not locked, recalculate pricing using engine
            const pages = Number(cartItem.serviceDetails?.pages || item.pagesOverride || 1);
            const baseService = inventory.find((i: Item) => i.id === (cartItem.itemId || item.id)) || item;

            const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive).map((adj: any) => ({
                name: adj.name,
                type: adj.type,
                value: adj.value,
                percentage: adj.percentage ?? adj.value,
                adjustmentId: adj.id,
                isActive: true
            }));

            const baseCost = Number(baseService.cost) || 0;
            const pricing = await calculateServicePrice({
                itemId: baseService.id,
                categoryId: baseService.category,
                baseCost: baseCost,
                pages: pages,
                copies: safeQty,
                adjustments: activeAdjs,
                marketAdjustments: activeAdjs,
                context: 'SERVICE'
            });

            const totalPages = pages * safeQty;
            const newItems = [...formData.items];
            newItems[idx] = {
                ...newItems[idx],
                quantity: safeQty,
                price: pricing.unitPrice,
                cost: pricing.cost,
                basePrice: pricing.cost,
                pagesOverride: pages,
                adjustmentSnapshots: pricing.adjustmentSnapshots,
                adjustmentTotal: pricing.adjustmentTotal,
                serviceDetails: {
                    pages,
                    copies: safeQty,
                    totalPages,
                    unitCostPerPage: pricing.cost / pages,
                    unitPricePerCopy: pricing.unitPrice,
                    unitCostPerCopy: pricing.cost,
                    totalCost: baseCost,
                    totalPrice: pricing.totalPrice
                }
            };

            setFormData({ ...formData, items: newItems });
            return;
        }

        const diff = safeQty - item.quantity;

        if (diff !== 0) {
            const itemId = item.parentId || item.id;
            const variantId = item.parentId ? item.id : undefined;
            if (item.type !== 'Service') {
                updateReservedStock(itemId, diff, `Quantity adjustment in ${type} Form`, variantId);
            }
        }

        const newItems = [...formData.items];
        newItems[idx].quantity = safeQty;

        // For SmartPricing variants: if price is 0 (e.g. loaded from a saved order before
        // the fix), restore it from the inventory record's variant snapshot
        if ((item as any).parentId && (!newItems[idx].price || newItems[idx].price <= 0)) {
            const parentInv = inventory.find((i: Item) => i.id === (item as any).parentId);
            const savedVariant = parentInv?.variants?.find((v: any) => v.id === item.id);
            if (savedVariant) {
                const restored = resolveStoredSellingPrice(savedVariant as any);
                if (restored > 0) {
                    newItems[idx].price = restored;
                    newItems[idx].selling_price = restored;
                    newItems[idx].calculated_price = resolveStoredCalculatedPrice(savedVariant as any) || restored;
                    newItems[idx].cost = resolveStoredCost(savedVariant as any) || 0;
                    newItems[idx].cost_price = resolveStoredCost(savedVariant as any) || 0;
                    newItems[idx].adjustmentSnapshots = resolveItemAdjustmentSnapshots(savedVariant as any);
                    newItems[idx].adjustmentTotal = Number(
                        (savedVariant as any).smartPricingSnapshot?.marketAdjustmentTotal
                        ?? (savedVariant as any).adjustmentTotal
                        ?? newItems[idx].adjustmentSnapshots.reduce((sum: number, snapshot: any) => sum + getSnapshotCalculatedAmount(snapshot), 0)
                    );
                }
            }
        }

        // Final fallback: if price is STILL 0 and it's a non-service item, try to recalculate
        if ((!newItems[idx].price || newItems[idx].price <= 0) && item.type !== 'Service') {
            const baseItemId = (item as any).parentId || item.id;
            const baseItem = inventory.find(i => i.id === baseItemId) || item;
            
            const activeAdjs = marketAdjustments.filter((ma: any) => ma.active ?? ma.isActive);
            const marketAdjustmentsInput = activeAdjs.map((adj: any) => {
                const isPercentage = adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage';
                let calcAmount = 0;
                if (isPercentage) {
                    calcAmount = Number(newItems[idx].cost || baseItem.cost) * (adj.value / 100);
                } else {
                    calcAmount = adj.value;
                }
                return {
                    name: adj.name,
                    type: adj.type || (isPercentage ? 'PERCENTAGE' : 'FIXED'),
                    value: adj.value,
                    percentage: isPercentage ? adj.value : undefined,
                    calculatedAmount: Number((calcAmount || 0).toFixed(2)),
                    adjustmentId: adj.id,
                    isActive: true
                };
            });

            const priceData = Number(newItems[idx].price || baseItem.price) > 0 ? {
                unitPrice: Number(newItems[idx].price || baseItem.price),
                cost: Number(newItems[idx].cost || baseItem.cost),
                adjustmentTotal: marketAdjustmentsInput.reduce((sum: number, adj: any) => sum + (adj.calculatedAmount || 0), 0),
                adjustmentSnapshots: marketAdjustmentsInput
            } : await calculateSellingPrice({
                itemId: baseItem.id,
                categoryId: baseItem.category,
                baseCost: Number(newItems[idx].cost || baseItem.cost) || 0,
                basePrice: Number(newItems[idx].price || baseItem.price) || undefined,
                quantity: safeQty,
                adjustments: marketAdjustmentsInput,
                context: 'ORDER'
            });

            newItems[idx].price = priceData.unitPrice;
            newItems[idx].cost = priceData.cost;
            newItems[idx].adjustmentSnapshots = priceData.adjustmentSnapshots;
            newItems[idx].adjustmentTotal = priceData.adjustmentTotal;
        }

        // Price stays as inventory price, no recalculation
        setFormData({ ...formData, items: newItems });
    };

    const handlePagesChange = (idx: number, newPages: number) => {
        if (isPriceLocked) return;

        const newItems = [...formData.items];
        newItems[idx].pagesOverride = newPages;
        // Price stays as inventory price — no recalculation
        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveItem = (idx: number) => {
        const item = formData.items[idx];
        const itemId = item.parentId || item.id;
        const variantId = item.parentId ? item.id : undefined;

        // Release reservation
        if (item.type !== 'Service') {
            updateReservedStock(itemId, -item.quantity, `Item removed from ${type} Form`, variantId);
        }

        setFormData({
            ...formData,
            items: formData.items.filter((_: any, i: number) => i !== idx)
        });
    };

    const selectCustomer = (name: string) => {
        const normalizedName = name.trim();
        if (!normalizedName) return;
        const customer = findCustomerByName(normalizedName);
        const selectedName = customer?.name || normalizedName;
        setFormData({
            ...formData,
            customerName: selectedName,
            customerId: customer?.id || '',
            subAccountName: 'Main',
            billingAddress: customer?.billingAddress || customer?.address || formData.billingAddress || '',
            shippingAddress: customer?.shippingAddress || customer?.billingAddress || customer?.address || formData.shippingAddress || '',
            customerPhone: customer?.phone || formData.customerPhone || '',
            customerEmail: customer?.email || formData.customerEmail || ''
        });
        setCustomerSearch(selectedName);
        setIsCustomerDropdownOpen(false);

        // Check credit limit immediately
        if (customer && customer.creditLimit) {
            const outstanding = getCustomerOutstanding(selectedName);
            if (outstanding > customer.creditLimit) {
                notify(`Warning: ${selectedName} has exceeded their credit limit. Outstanding: ${currency}${outstanding.toLocaleString()}`, "warning");
            }
        }
    };

    const handleQuickAddCustomer = async () => {
        const name = customerSearch.trim();
        if (!name) return;

        try {
            const customer = await ensureCustomerExists(name);
            if (!customer) {
                notify("Could not create client record. Please try again.", "error");
                return;
            }
            selectCustomer(customer.name);
        } catch (err: any) {
            notify(`Failed to add client: ${err.message || 'Unknown error'}`, "error");
        }
    };

    const handleVoucherDateChange = (nextDate: string) => {
        setFormData((prev: any) => {
            if (!isRecurring) {
                return { ...prev, date: nextDate };
            }

            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                date: nextDate,
                startDate: prev.startDate || nextDate,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || nextDate)
                    : prev.nextRunDate
            };
        });
    };

    const handleRecurringFrequencyChange = (nextFrequency: string) => {
        setFormData((prev: any) => {
            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                frequency: nextFrequency,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(nextFrequency, prev.startDate || prev.date)
                    : prev.nextRunDate
            };
        });
    };

    const handleRecurringStartDateChange = (nextStartDate: string) => {
        setFormData((prev: any) => {
            const currentDefault = getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', prev.startDate || prev.date);
            const shouldRecalculateNextRunDate = !isEditing && (!prev.nextRunDate || prev.nextRunDate === currentDefault);

            return {
                ...prev,
                startDate: nextStartDate,
                nextRunDate: shouldRecalculateNextRunDate
                    ? getDefaultRecurringNextRunDate(prev.frequency || 'Monthly', nextStartDate)
                    : prev.nextRunDate
            };
        });
    };

    const addManualDate = () => {
        if (!manualDate || formData.scheduledDates.includes(manualDate)) return;
        setFormData({
            ...formData,
            scheduledDates: [...formData.scheduledDates, manualDate].sort()
        });
    };

    const removeManualDate = (date: string) => {
        setFormData({
            ...formData,
            scheduledDates: formData.scheduledDates.filter((d: string) => d !== date)
        });
    };

    const handleCancelForm = () => {
        // Release all reservations
        formData.items.forEach((item: any) => {
            const itemId = item.parentId || item.id;
            const variantId = item.parentId ? item.id : undefined;
            if (item.type !== 'Service') {
                updateReservedStock(itemId, -item.quantity, `Form cancelled`, variantId);
            }
        });
        onCancel();
    };

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-xl font-normal text-slate-900">{isEditing ? 'Edit' : 'Create'} {type} - {formData.id}</h2>
                            <p className="text-[11px] font-normal text-slate-400 mt-0.5">Secure Document Terminal</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {isPriceLocked && (
                                <button
                                    onClick={() => {
                                        if (window.confirm("Unlocking the price will allow modifications but may require re-approval. Proceed?")) {
                                            setLocalUnlock(true);
                                            notify("Price unlocked for revision", "info");
                                        }
                                    }}
                                    className="p-2 hover:bg-amber-100 rounded-lg transition-colors text-amber-600 flex items-center gap-2 px-3 border border-amber-200"
                                    title="Unlock Price for Editing"
                                >
                                    <ShieldCheck size={16} />
                                    <span className="text-xs font-normal">Unlock Price</span>
                                </button>
                            )}
                            {onPreview && (
                                <button
                                    onClick={onPreview}
                                    className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600 flex items-center gap-2 px-3"
                                    title="Preview Document"
                                >
                                    <Eye size={20} />
                                    <span className="text-xs font-normal">Preview</span>
                                </button>
                            )}
                            <button onClick={handleCancelForm} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
                        </div>
                    </div>

                    <div className="flex flex-1 overflow-hidden" id="order-form-printable">
                        <div className="w-2/3 p-6 overflow-y-auto border-r border-slate-200 space-y-8 custom-scrollbar bg-[#F8FAFC]">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                {isQuotation && (
                                    <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">Quotation Workflow</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    General quotations use the normal item builder. Examination quotations generate quote lines from classes and create an examination batch when approved.
                                                </p>
                                            </div>
                                            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                                                {(['General', 'Examination'] as QuotationWorkflowType[]).map((entry) => {
                                                    const active = formData.quotationType === entry;
                                                    return (
                                                        <button
                                                            key={entry}
                                                            type="button"
                                                            onClick={() => handleQuotationTypeChange(entry)}
                                                            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                                                                active
                                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                                    : 'text-slate-600 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {entry}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Row 1: Invoice Date & Status */}
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Voucher Date</label>
                                    <input
                                        type="date"
                                        className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm"
                                        value={formData.date}
                                        onChange={e => handleVoucherDateChange(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">
                                        {type === 'Order' ? 'Order Status' : isRecurring ? 'Subscription Status' : `${type} Status`}
                                    </label>
                                    <div className="relative w-64">
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                                            value={formData.status}
                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        >
                                            {type === 'Order' ? (
                                                <>
                                                    <option value="Pending">Pending</option>
                                                    <option value="Processing">Processing</option>
                                                    <option value="Completed">Completed</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </>
                                            ) : type === 'Quotation' ? (
                                                <>
                                                    <option value="Draft">Draft</option>
                                                    <option value="Rejected">Rejected</option>
                                                    <option value="Converted">Converted</option>
                                                    {!['Draft', 'Rejected', 'Converted'].includes(String(formData.status || '')) && (
                                                        <option value={formData.status}>{formData.status}</option>
                                                    )}
                                                </>
                                            ) : isRecurring ? (
                                                <>
                                                    {RECURRING_STATUSES.map((status) => (
                                                        <option key={status} value={status}>{status}</option>
                                                    ))}
                                                    {!RECURRING_STATUSES.includes(String(formData.status || '') as typeof RECURRING_STATUSES[number]) && (
                                                        <option value={formData.status}>{formData.status}</option>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <option value="Draft">Draft</option>
                                                    <option value="Unpaid">Unpaid</option>
                                                    <option value="Partial">Partial</option>
                                                    <option value="Paid">Paid</option>
                                                    <option value="Overdue">Overdue</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </>
                                            )}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Row 2: Client Entity & Due Date */}
                                <div className="relative" ref={customerDropdownRef}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 w-32">
                                            <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap">Client Entity</label>
                                            {selectedCustomerObj && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate('/revenue/contacts', { state: { selectedId: selectedCustomerObj.id, showHub: true } })}
                                                    className="text-blue-600 hover:text-blue-700 transition-colors"
                                                    title="View Profile"
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative w-64">
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-slate-200 rounded-lg bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none font-normal text-slate-800 text-xs transition-all shadow-sm"
                                                placeholder="e.g. Acme Printing"
                                                value={customerSearch}
                                                onChange={(e) => {
                                                    setCustomerSearch(e.target.value);
                                                    setIsCustomerDropdownOpen(true);
                                                }}
                                                onFocus={() => setIsCustomerDropdownOpen(true)}
                                            />
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />

                                            {isCustomerDropdownOpen && (
                                                <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-premium max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                                                    {filteredCustomers.length === 0 ? (
                                                        <div className="p-4 flex flex-col items-center gap-3">
                                                            <p className="text-xs text-slate-400 italic font-normal">No customers found</p>
                                                            {customerSearch.length > 1 && (
                                                                <button onClick={handleQuickAddCustomer} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-normal uppercase tracking-widest hover:bg-blue-700">
                                                                    <Plus size={12} /> Add "{customerSearch}"
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        filteredCustomers.map(name => {
                                                            const outstanding = getCustomerOutstanding(name);
                                                            return (
                                                                <button
                                                                    key={name}
                                                                    onClick={() => selectCustomer(name)}
                                                                    className="w-full px-4 py-2 text-left hover:bg-blue-50 flex justify-between items-center transition-colors border-b border-slate-50 last:border-0"
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm font-normal text-slate-800">{name}</span>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className={`text-[11px] font-semibold ${outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                            {currency}{outstanding.toLocaleString()}
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
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">{type === 'Quotation' ? 'Valid Until' : 'Due Date'}</label>
                                    <input
                                        type="date"
                                        className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm"
                                        value={formData.dueDate}
                                        onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                    />
                                </div>

                                {/* Row 3: Sales Account & Sub Account */}
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Sales Account</label>
                                    <div className="relative w-64">
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                                            value={formData.salesAccountId}
                                            onChange={e => setFormData({ ...formData, salesAccountId: e.target.value })}
                                        >
                                            {accounts.filter(a => a.type === 'Revenue' || a.type === 'Other Income').map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Sub Account</label>
                                    <div className="relative w-64">
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                                            value={formData.subAccountName}
                                            onChange={e => setFormData({ ...formData, subAccountName: e.target.value })}
                                        >
                                            <option value="Main">Main Wallet</option>
                                            {customerSubAccounts.map(sub => (
                                                <option key={sub.name} value={sub.name}>{sub.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Row 4: Payment Method (if Order) */}
                                {type === 'Order' ? (
                                    <div className="flex items-center justify-between gap-3">
                                        <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap w-32">Payment Method</label>
                                        <div className="relative w-64">
                                            <select
                                                className="w-full p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm appearance-none"
                                                value={formData.paymentMethod}
                                                onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="Bank Transfer">Bank Transfer</option>
                                                <option value="Credit Card">Credit Card</option>
                                                <option value="Wallet">Customer Wallet</option>
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                ) : (
                                    <div />
                                )}
                                <div />

                                {type === 'Order' && (
                                    <>
                                        <div className="flex items-start justify-between gap-3">
                                            <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap pt-2 w-32">Billing Protocol</label>
                                            <textarea
                                                className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm h-20 resize-none"
                                                placeholder={getPlaceholder.address()}
                                                value={formData.billingAddress}
                                                onChange={e => setFormData({ ...formData, billingAddress: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap pt-2 w-32">Logistics Protocol</label>
                                            <textarea
                                                className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm h-20 resize-none"
                                                placeholder={`${getPlaceholder.addressLine2()}, ${getPlaceholder.city()}`}
                                                value={formData.shippingAddress}
                                                onChange={e => setFormData({ ...formData, shippingAddress: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap pt-2 w-32">Operational Notes</label>
                                            <textarea
                                                className="w-64 p-2 border border-slate-200 rounded-lg text-xs font-normal bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all shadow-sm h-20 resize-none"
                                                placeholder="e.g. Delivered via courier"
                                                value={formData.notes}
                                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                            />
                                        </div>
                                        <div />
                                    </>
                                )}
                            </div>

                            {isExaminationQuotation && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-[0.2em]">Examination Setup</h3>
                                            <p className="mt-1 text-xs text-slate-500">
                                                These class rows drive the quotation total and are used to create the examination batch automatically after approval.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Learners</p>
                                                <p className="mt-1 text-lg font-semibold text-slate-900">{examinationLearnerCount.toLocaleString()}</p>
                                            </div>
                                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500">Quotation Total</p>
                                                <p className="mt-1 text-lg font-semibold text-blue-700">
                                                    {currency}{analysis.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Batch Name</label>
                                            <input
                                                type="text"
                                                value={examinationDetails.batchName}
                                                onChange={(e) => updateExaminationDetails((prev) => ({ ...prev, batchName: e.target.value }))}
                                                placeholder="e.g. Term 1 Mock Examinations"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Examination Type</label>
                                            <input
                                                type="text"
                                                value={examinationDetails.examType}
                                                onChange={(e) => updateExaminationDetails((prev) => ({ ...prev, examType: e.target.value }))}
                                                placeholder="e.g. Mid-Term"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Academic Year</label>
                                            <input
                                                type="text"
                                                value={examinationDetails.academicYear}
                                                onChange={(e) => updateExaminationDetails((prev) => ({ ...prev, academicYear: e.target.value }))}
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Term</label>
                                            <input
                                                type="text"
                                                value={examinationDetails.term}
                                                onChange={(e) => updateExaminationDetails((prev) => ({ ...prev, term: e.target.value }))}
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Price Per Learner</label>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{currency}</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    value={examinationDetails.pricePerLearner || ''}
                                                    onChange={(e) => updateExaminationDetails((prev) => ({
                                                        ...prev,
                                                        pricePerLearner: Math.max(0, Number(e.target.value) || 0)
                                                    }))}
                                                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                                            <div>
                                                <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Classes</h4>
                                                <p className="mt-1 text-xs text-slate-500">Each class becomes a generated quotation line and later an examination batch class.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddExaminationClass}
                                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                                            >
                                                <Plus size={14} />
                                                Add Class
                                            </button>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {examinationDetails.classes.map((entry, index) => (
                                                <div key={entry.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_56px]">
                                                    <div>
                                                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Class Name</label>
                                                        <input
                                                            type="text"
                                                            value={entry.className}
                                                            onChange={(e) => handleUpdateExaminationClass(entry.id, 'className', e.target.value)}
                                                            placeholder="e.g. Form 4A"
                                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Learners</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={entry.learners || ''}
                                                            onChange={(e) => handleUpdateExaminationClass(entry.id, 'learners', e.target.value)}
                                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                                        />
                                                    </div>
                                                    <div className="flex items-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveExaminationClass(entry.id)}
                                                            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-rose-100 text-rose-500 hover:bg-rose-50 transition-colors"
                                                            title="Remove class"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Subscription Settings (Conditional) */}
                            {type === 'Recurring' && (
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in slide-in-from-top-4">
                                    <h3 className="font-normal text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wider">
                                        <RefreshCw size={16} className="text-blue-600" /> Subscription Protocol
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Billing Frequency</label>
                                                <select
                                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-normal bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                                    value={formData.frequency}
                                                    onChange={e => handleRecurringFrequencyChange(e.target.value)}
                                                >
                                                    <option value="Daily">Daily Cycle</option>
                                                    <option value="Weekly">Weekly Cycle</option>
                                                    <option value="Monthly">Monthly Cycle</option>
                                                    <option value="Quarterly">Quarterly Cycle</option>
                                                    <option value="Annually">Annual Cycle</option>
                                                </select>
                                            </div>
                                            <div className="space-y-3 pt-2">
                                                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer group hover:border-blue-300 transition-all">
                                                    <div className={`p-2 rounded-lg transition-colors ${formData.autoDeductWallet ? 'bg-blue-600 text-white' : 'bg-white text-slate-300'}`}>
                                                        <Wallet size={16} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-normal text-slate-800">Auto-Deduct from Wallet</p>
                                                        <p className="text-[10px] text-slate-400">Pull funds automatically if balance allows</p>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                                        checked={formData.autoDeductWallet}
                                                        onChange={e => {
                                                            if (e.target.checked && selectedCustomerObj) {
                                                                let balance = 0;
                                                                let accountLabel = 'Main Wallet';

                                                                if (formData.subAccountName && formData.subAccountName !== 'Main') {
                                                                    const sub = selectedCustomerObj.subAccounts?.find(s => s.name === formData.subAccountName);
                                                                    balance = sub?.walletBalance || 0;
                                                                    accountLabel = `${formData.subAccountName} Wallet`;
                                                                } else {
                                                                    balance = selectedCustomerObj.walletBalance || 0;
                                                                }

                                                                if (balance < 1000) {
                                                                    notify(`Auto-Deduct requires a wallet balance of at least ${currency}1,000. ${accountLabel} current: ${currency}${balance.toLocaleString()}`, "error");
                                                                    return;
                                                                }
                                                            }
                                                            setFormData({ ...formData, autoDeductWallet: e.target.checked });
                                                        }}
                                                    />
                                                </label>
                                                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer group hover:border-blue-300 transition-all">
                                                    <div className={`p-2 rounded-lg transition-colors ${formData.autoEmail ? 'bg-blue-600 text-white' : 'bg-white text-slate-300'}`}>
                                                        <Mail size={16} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-normal text-slate-800">Auto-Transmit Voucher</p>
                                                        <p className="text-[10px] text-slate-400">Email client upon generation</p>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                                        checked={formData.autoEmail}
                                                        onChange={e => setFormData({ ...formData, autoEmail: e.target.checked })}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Start Date</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-normal bg-white outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                                        value={formData.startDate}
                                                        onChange={e => handleRecurringStartDateChange(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">End Date</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-normal bg-white outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                                        value={formData.endDate}
                                                        min={formData.startDate || undefined}
                                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Next Billing Date</label>
                                                <input
                                                    type="date"
                                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-normal bg-white outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                                    value={formData.nextRunDate}
                                                    onChange={e => setFormData({ ...formData, nextRunDate: e.target.value })}
                                                />
                                                <p className="mt-2 text-[10px] text-slate-400">
                                                    Draft subscriptions stay inactive until you activate them. When activated, this becomes the next billing cycle date.
                                                </p>
                                            </div>
                                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Manual Schedule Overrides</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="date"
                                                    className="flex-1 p-2 border border-slate-200 rounded-xl text-xs font-normal bg-white outline-none"
                                                    value={manualDate}
                                                    onChange={e => setManualDate(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addManualDate}
                                                    className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-all shadow-sm"
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            </div>
                                            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 h-32 overflow-y-auto custom-scrollbar flex flex-wrap gap-2 content-start">
                                                {formData.scheduledDates?.length > 0 ? (
                                                    formData.scheduledDates.map((d: string) => (
                                                        <span key={d} className="bg-white border border-blue-100 text-blue-600 px-2 py-1 rounded-lg text-[10px] font-normal flex items-center gap-1.5 animate-in zoom-in-95">
                                                            <Calendar size={10} /> {d}
                                                            <button type="button" onClick={() => removeManualDate(d)} className="hover:text-rose-500"><X size={10} /></button>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-full mt-4">No manual overrides defined.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Add Items to Voucher Selection Grid (Small Cards, 3x2 Layout) */}
                            {isExaminationQuotation ? (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                                            <FileText size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-600">Generated Quotation Lines</h3>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Examination quotation lines are created automatically from the classes above. Add or update classes and learner counts to change the quoted amount.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                                    {/* Row 1: Add Items to Voucher Header */}
                                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                                        <h3 className="text-[13px] font-semibold text-slate-800">Add Items to Voucher</h3>
                                    </div>
                                    
                                    {/* Row 2: Search Box + Quick Service Buttons */}
                                    <div className="p-4 flex items-center gap-4" ref={itemDropdownRef}>
                                        <div className="relative w-80">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-white outline-none focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
                                                placeholder="Search items..."
                                                value={itemSearch}
                                                onFocus={() => setIsItemDropdownOpen(true)}
                                                onChange={(e) => {
                                                    setItemSearch(e.target.value);
                                                    setIsItemDropdownOpen(true);
                                                }}
                                            />
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />

                                            {isItemDropdownOpen && (
                                                <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-premium max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                                                    {filteredInventory.length === 0 ? (
                                                        <div className="p-4 flex flex-col items-center gap-3">
                                                            <p className="text-xs text-slate-400 italic font-normal">No matching items.</p>
                                                        </div>
                                                    ) : (
                                                        filteredInventory.map(item => {
                                                            const hasVariants = item.variants && item.variants.length > 0;
                                                            const prices = hasVariants ? item.variants.map((v: any) => Number(v.price || v.selling_price || 0)) : [];
                                                            const minPrice = hasVariants ? Math.min(...prices) : 0;
                                                            const maxPrice = hasVariants ? Math.max(...prices) : 0;
                                                            const isPriceRange = hasVariants && minPrice !== maxPrice;

                                                            return (
                                                                <button
                                                                    key={item.id}
                                                                    onClick={() => {
                                                                        handleAddItem(item);
                                                                        setIsItemDropdownOpen(false);
                                                                        setItemSearch('');
                                                                    }}
                                                                    className="w-full px-4 py-3 text-left hover:bg-blue-50 flex flex-col gap-1 transition-colors border-b border-slate-50 last:border-0"
                                                                >
                                                                    <div className="flex justify-between items-start">
                                                                        <span className="text-xs font-semibold text-slate-800 truncate pr-4">{item.name}</span>
                                                                        <span className="text-xs font-bold text-slate-900 shrink-0">
                                                                            {isPriceRange 
                                                                                ? `${currency}${minPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} - ${currency}${maxPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                                                                : `${currency}${Number((hasVariants ? minPrice : (item.price || item.selling_price)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-[10px] text-slate-400 font-mono tracking-tight">{item.sku || 'NO-SKU'}</span>
                                                                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{item.type}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-3 shrink-0 ml-auto">
                                            <button
                                                onClick={() => handleQuickService('Printing')}
                                                className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm font-semibold"
                                            >
                                                <FileText size={16} /> Type and Printing
                                            </button>
                                            <button
                                                onClick={() => handleQuickService('Photocopy')}
                                                className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm font-semibold"
                                            >
                                                <Copy size={16} /> Photocopy
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Document Line Items Table (For Adjustment) */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="p-4 bg-slate-50 border-b border-slate-200">
                                    <h3 className="text-[13px] font-semibold text-slate-800">Current Voucher Summary</h3>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50/80 backdrop-blur font-normal text-slate-400 border-b border-slate-200 sticky top-0 z-10">
                                            <tr>
                                                <th className="py-3 px-5 text-[13px]">Item Name</th>
                                                <th className="py-3 px-5 text-center w-24 text-[13px]">Quantity</th>
                                                <th className="py-3 px-5 text-right w-40 text-[13px]">Price</th>
                                                <th className="py-3 px-5 text-right w-40 text-[13px]">Total</th>
                                                <th className="py-3 px-5 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {analysis.processedItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="p-10 text-center text-slate-300 font-normal italic">No items added to voucher yet.</td>
                                                </tr>
                                            )}
                                            {analysis.processedItems.map((item: CartItem, idx: number) => {
                                                const isVariant = !!item.parentId;
                                                const serviceDetails = (item as any).serviceDetails;
                                                return (
                                                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                                        <td className="py-2 px-5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="font-normal text-slate-800 text-sm leading-tight">{item.name}</div>
                                                                {isVariant && (
                                                                    <span className="text-[9px] font-normal bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">Variant</span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-0.5 mt-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span>SKU: {item.sku}</span>
                                                                    {isVariant && item.attributes && (
                                                                        <span className="text-slate-300">| {Object.entries(item.attributes).map(([k, v]) => `${k}:${v}`).join(', ')}</span>
                                                                    )}
                                                                </div>
                                                                {/* Adjustment display hidden as per request */}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-5 text-center">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-center font-normal text-slate-900 focus:bg-white focus:ring-4 focus:ring-blue-500/5 outline-none transition-all disabled:opacity-50"
                                                                value={item.quantity}
                                                                onChange={e => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                                                                disabled={isPriceLocked || isExaminationQuotation}
                                                            />
                                                        </td>
                                                        <td className="py-2 px-5 text-right font-normal text-slate-600 font-mono text-[13px]">
                                                            {(item as any).isVariantParent ? (
                                                                <button
                                                                    onClick={() => setSelectedProductForVariants(item)}
                                                                    className="text-[9px] font-normal bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors"
                                                                >
                                                                    View
                                                                </button>
                                                            ) : (
                                                                <input
                                                                    type="number"
                                                                    className={`w-full bg-transparent text-right outline-none focus:text-blue-600 font-mono font-normal disabled:text-slate-500 ${item.manual_override ? 'text-blue-600 font-bold underline decoration-dotted' : ''}`}
                                                                    value={item.price}
                                                                    onChange={e => {
                                                                        if (isPriceLocked || serviceDetails) return;
                                                                        applyManualLineItemPrice(item.id, parseFloat(e.target.value) || 0);
                                                                    }}
                                                                    disabled={isPriceLocked || isExaminationQuotation}
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-5 text-right font-normal text-slate-900 font-mono text-[13px]">
                                                            {currency}{((Number(item.price) || 0) * (Number(item.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-2 px-5 text-right">
                                                            <button
                                                                onClick={() => handleRemoveItem(idx)}
                                                                disabled={isPriceLocked || isExaminationQuotation}
                                                                className="text-slate-300 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="w-1/3 bg-slate-50 p-8 flex flex-col border-l border-slate-200 overflow-y-auto custom-scrollbar">
                            <div className="mb-auto space-y-6 pb-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2.5 bg-slate-900 text-white rounded-lg shadow-xl">
                                        <Calculator size={24} />
                                    </div>
                                    <h3 className="font-normal text-slate-800 text-xl leading-none">Fiscal Summary</h3>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                    {selectedCustomerObj && (
                                        <div className={`p-3 rounded-xl border mb-4 ${getCustomerOutstanding(selectedCustomerObj.name) + finalDisplayTotal > (selectedCustomerObj.creditLimit || 0) && selectedCustomerObj.creditLimit ? 'bg-rose-500/10 border-rose-500/50' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-normal text-slate-400 uppercase">Credit Risk</span>
                                                <span className={`text-[10px] font-normal uppercase ${getCustomerOutstanding(selectedCustomerObj.name) + finalDisplayTotal > (selectedCustomerObj.creditLimit || 0) && selectedCustomerObj.creditLimit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {getCustomerOutstanding(selectedCustomerObj.name) + finalDisplayTotal > (selectedCustomerObj.creditLimit || 0) && selectedCustomerObj.creditLimit ? 'High Risk' : 'Healthy'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="text-[9px] text-slate-500 font-normal uppercase tracking-tighter">Limit: {currency}{(selectedCustomerObj.creditLimit || 0).toLocaleString()}</div>
                                                <div className="text-xs font-normal text-slate-700">Exposure: {currency}{(getCustomerOutstanding(selectedCustomerObj.name) + finalDisplayTotal).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    )}
                                    {!isExaminationQuotation && selectedManualOverrideItem && (
                                        <div className="mb-4">
                                            <button
                                                type="button"
                                                onClick={() => setShowManualOverrideCard(prev => !prev)}
                                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${showManualOverrideCard ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                {showManualOverrideCard ? <Eye size={14} /> : <TrendingUp size={14} />}
                                                {showManualOverrideCard ? 'Hide Manual Override Pricing' : 'Manual Override Pricing'}
                                            </button>
                                        </div>
                                    )}
                                    {!isExaminationQuotation && showManualOverrideCard && selectedManualOverrideItem && (
                                        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 mb-4 space-y-3">
                                            <div className="space-y-1">
                                                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Manual Override Pricing</div>
                                                <div className="text-xs text-slate-700">
                                                    Auto Price: <span className="font-semibold">{currency}{getAutomaticOrderItemPrice(selectedManualOverrideItem).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    <span className="mx-2 text-slate-400">|</span>
                                                    Final Price: <span className="font-semibold">{currency}{Number(selectedManualOverrideItem.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className={`text-[10px] font-bold uppercase tracking-wider ${selectedManualOverrideItem.manual_override ? 'text-amber-700' : 'text-slate-500'}`}>
                                                    {selectedManualOverrideItem.manual_override ? 'Status: Manual Override Active' : 'Status: Auto Pricing'}
                                                </div>
                                            </div>

                                            <select
                                                value={selectedManualOverrideItem.id}
                                                onChange={(e) => setSelectedManualOverrideItemId(e.target.value)}
                                                disabled={isPriceLocked}
                                                className="w-full p-2.5 bg-white border border-amber-200 rounded-lg text-xs font-semibold text-slate-700 outline-none disabled:opacity-60"
                                            >
                                                {manualOverrideItems.map((entry: any) => (
                                                    <option key={entry.id} value={entry.id}>
                                                        {entry.name} ({currency}{Number(entry.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                                    </option>
                                                ))}
                                            </select>

                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={manualOverrideValue}
                                                    onChange={(e) => setManualOverrideValue(e.target.value)}
                                                    disabled={isPriceLocked}
                                                    className="flex-1 p-2.5 bg-white border border-amber-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
                                                    placeholder="Override unit price"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => applyManualLineItemPrice(selectedManualOverrideItem.id, Number(manualOverrideValue) || 0)}
                                                    disabled={isPriceLocked}
                                                    className="px-4 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-60"
                                                >
                                                    {selectedManualOverrideItem.manual_override ? 'Update' : 'Apply'}
                                                </button>
                                                {selectedManualOverrideItem.manual_override && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void resetManualLineItemPrice(selectedManualOverrideItem.id)}
                                                        disabled={isPriceLocked}
                                                        className="px-4 py-2.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 disabled:opacity-60"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-[15px] font-normal">
                                        <span className="text-slate-400">Net Valuation</span>
                                        <span className="text-slate-700 font-mono">{currency}{analysis.totalCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>

                                    {/* Market Adjustment Breakdown */}
                                    <div className="space-y-1.5 pt-2 border-t border-slate-50">
                                        {orderedAdjustmentEntries.map(([name, amount]) => {
                                            if ((amount as number) <= 0) return null;
                                            const meta = getPricingDisplayMeta(name);
                                            const Icon = meta.Icon;

                                            return (
                                                <div key={name} className="flex justify-between items-center">
                                                    <span className="text-slate-400 text-[11px] font-normal tracking-tight flex items-center gap-1.5">
                                                        <Icon size={10} className={meta.iconClass} /> {name}
                                                    </span>
                                                    <span className={`${meta.textClass} font-mono text-[11px] font-medium`}>+{currency}{(amount as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            );
                                        })}
                                        {Math.abs(analysis.pricingSummary.roundingTotal) > 0.0001 && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-purple-600 text-[11px] font-semibold tracking-tight flex items-center gap-1.5">
                                                    <Tag size={10} className="text-purple-500" /> Round Up
                                                </span>
                                                <span className={`font-mono text-[11px] font-semibold ${analysis.pricingSummary.roundingTotal >= 0 ? 'text-purple-600' : 'text-rose-600'}`}>
                                                    {analysis.pricingSummary.roundingTotal >= 0 ? '+' : ''}{currency}{analysis.pricingSummary.roundingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                        {analysis.pricingSummary.profitMarginTotal > 0 && (
                                            <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
                                                <span className="text-emerald-600 text-[11px] font-semibold tracking-tight flex items-center gap-1.5">
                                                    <TrendingUp size={10} className="text-emerald-500" /> Profit Margin
                                                </span>
                                                <span className="text-emerald-600 font-mono text-[11px] font-semibold">+{currency}{analysis.pricingSummary.profitMarginTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                        <div className="flex items-center gap-2 text-slate-400 font-normal text-[13px]">
                                            <Tag size={14} /> Voucher Discount
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-300 font-mono text-[10px]">{currency}</span>
                                            <input
                                                type="number"
                                                className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-right text-xs font-normal outline-none focus:bg-white focus:border-blue-400 transition-all"
                                                value={formData.discount}
                                                onChange={e => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-6 mt-2 border-t-2 border-slate-900 flex justify-between items-center">
                                        <span className="font-semibold text-[13px] text-slate-900">Grand Total</span>
                                        <span className="text-2xl font-semibold text-blue-600 tracking-tighter leading-none">{currency}{finalDisplayTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>

                                <div className="bg-blue-100/50 p-6 rounded-xl text-blue-900 border border-blue-200 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform"><ShieldCheck size={80} /></div>
                                    <div className="relative z-10 flex items-start gap-4">
                                        <Info size={24} className="text-blue-600 shrink-0 mt-1" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] text-blue-700 font-normal uppercase tracking-wider">Compliance Protocol</p>
                                            <p className="text-xs text-blue-800/80 leading-relaxed font-normal">
                                                Voucher will be cryptographically logged to the system audit trail. Security protocols ensure real-time integrity reporting.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {isEditing && (
                                    <div className="mt-4 pt-6 border-t border-slate-200 animate-in slide-in-from-bottom-2">
                                        <label className="block text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2 px-1">
                                            <Clock size={12} /> Revision Memo (Required)
                                        </label>
                                        <textarea
                                            className="w-full p-4 bg-white border border-slate-200 rounded-lg text-sm h-24 resize-none focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-sm font-normal"
                                            placeholder="e.g. Corrected quantity mismatch"
                                            value={auditReason}
                                            onChange={e => setAuditReason(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 shrink-0">
                                {type === 'Invoice' && (
                                    <button
                                        onClick={() => handleSubmission(false, true)}
                                        disabled={formData.items.length === 0 || (isEditing && !auditReason.trim())}
                                        className="w-full py-3 bg-emerald-600 text-white rounded-lg font-normal text-[12px] shadow-xl shadow-emerald-900/20 hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <Coins size={16} />
                                        Save and Pay Now
                                    </button>
                                )}
                                <button
                                    onClick={() => handleSubmission(false, false)}
                                    disabled={formData.items.length === 0 || (isEditing && !auditReason.trim())}
                                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-normal text-[12px] shadow-xl shadow-blue-900/20 hover:bg-blue-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2 active:scale-95"
                                >
                                    <Save size={16} />
                                    {primaryActionLabel}
                                </button>
                                <button onClick={handleCancelForm} className="w-full py-2 text-slate-400 font-normal text-[10px] hover:text-rose-500 transition-colors text-center">Abandon Draft</button>
                            </div>
                        </div>
                    </div>
                </div>

                {selectedProductForVariants && (
                    <VariantSelectorModal
                        product={selectedProductForVariants}
                        onSelect={handleVariantSelect}
                        onClose={() => setSelectedProductForVariants(null)}
                    />
                )}
                {selectedServiceForCalculator && (
                    <ServiceCalculatorModal
                        service={selectedServiceForCalculator}
                        currencySymbol={currency}
                        initialPages={serviceInitialValues.pages}
                        initialCopies={serviceInitialValues.copies}
                        onConfirm={handleServicePricingConfirm}
                        onClose={() => {
                            setSelectedServiceForCalculator(null);
                            setServiceEditIndex(null);
                        }}
                    />
                )}
                {quickPrintModal.open && (
                    <QuickPrintModal
                        open={quickPrintModal.open}
                        onClose={() => setQuickPrintModal({ open: false, type: 'photocopy' })}
                        type={quickPrintModal.type}
                        pricePerPage={quickPrintModal.type === 'photocopy' 
                            ? (companyConfig.transactionSettings?.pos?.photocopyPrice || 2.00)
                            : (companyConfig.transactionSettings?.pos?.typePrintingPrice || 5.00)}
                        currency={currency}
                        staplePrice={companyConfig.transactionSettings?.pos?.staplePrice}
                        pinningItem={(() => {
                            const pinning = inventory.find(i => i.name?.toLowerCase().includes('staple') || i.name?.toLowerCase().includes('pin'));
                            if (!pinning) return null;
                            const conversionRate = Number((pinning as any).conversionRate ?? (pinning as any).conversion_rate ?? 1);
                            return {
                                costPerUnit: Number((pinning as any).cost_price ?? (pinning as any).cost_per_unit ?? pinning.cost ?? 0),
                                conversionRate: conversionRate,
                                materialId: pinning.id
                            };
                        })()}
                        onConfirm={handleQuickPrintConfirm}
                    />
                )}
            </div>
            </>
        );
    };
