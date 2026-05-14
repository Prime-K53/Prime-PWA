import { dbService } from './db';
import { pricingService } from './pricingService';
import { inventoryTransactionService } from './inventoryTransactionService';
import { currencyService } from './currencyService';
import {
    Sale, CartItem, LedgerEntry, WalletTransaction, Customer, SalesExchange,
    ReprintJob, SalesExchangeItem, SalesExchangeApproval, Invoice, Expense,
    Income, Transfer, Item, Purchase, GoodsReceipt, ProductionBatch, WorkOrder,
    Order, OrderPayment, CustomerPayment, SupplierPayment, PurchaseAllocation, Supplier, VatTransaction, VATConfig,
    ConsumptionSnapshot, BOMTemplate, MarketAdjustment, MarketAdjustmentTransaction, TransactionAdjustmentSnapshot,
    Shipment, DeliveryNote, ProofOfDeliveryRecord
} from '../types';
import { BankAccount, BankTransaction } from '../types/banking';
import { MultiCurrencyJournalEntry, MultiCurrencyTransactionLine, CurrencyGainLoss } from '../types/currency';

import { assertInvoiceNumberFormat, calculateDueDate, generateNextId, resolveCustomerPaymentTerms, roundToCurrency } from '../utils/helpers';
import { extractProfitMargin } from '../utils/financial/extractors';
import { pagesToReams, pagesToTonerKg } from '../utils/printConversions';
import { inferSignatureInputMode, resolveSignatureDataUrl } from '../utils/signatureUtils';
import {
    calculateCustomerPaymentSnapshot,
    CustomerReceiptInvoiceInput
} from './receiptCalculationService';
import { logger } from './logger';

/**
 * Helper to get dynamic config from CompanyConfig (mirrored from helpers)
 */
const getCompanyConfig = () => {
    const saved = localStorage.getItem('nexus_company_config');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse company config", e);
        }
    }
    return null;
};

/**
 * Helper to get dynamic GL mapping from CompanyConfig
 */
const getGLConfig = () => {
    const saved = localStorage.getItem('nexus_company_config');
    const defaultConfig = {
        defaultSalesAccount: '4000',
        defaultInventoryAccount: '1200',
        defaultCOGSAccount: '5000',
        accountsReceivable: '1100',
        accountsPayable: '2000',
        cashDrawerAccount: '1000',
        bankAccount: '1050',
        mobileMoneyAccount: '1060',
        salesReturnAccount: '4100',
        customerDepositAccount: '2200',
        otherIncomeAccount: '4900',
        defaultExpenseAccount: '6100',
        defaultLaborWagesAccount: '6300',
        retainedEarningsAccount: '3000'
    };

    if (saved) {
        try {
            const config = JSON.parse(saved);
            return {
                ...defaultConfig,
                ...(config.glMapping || {})
            };
        } catch (e) {
            console.error("Failed to parse company config", e);
        }
    }
    return defaultConfig;
};

const calculateBankBalance = (transactions: BankTransaction[], accountId: string): number => {
    return transactions
        .filter(tx => tx.bankAccountId === accountId)
        .reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);
};

const ensureBankAccounts = async (bankAccountsStore: any): Promise<BankAccount[]> => {
    const existing = await bankAccountsStore.getAll();
    if (existing.length > 0) return existing;

    const now = new Date().toISOString();
    const sampleAccounts: Omit<BankAccount, 'id' | 'balance' | 'availableBalance' | 'createdAt' | 'updatedAt'>[] = [
        {
            name: 'Cash Account',
            accountNumber: 'CASH-001',
            bankName: 'Prime Bank',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        },
        {
            name: 'Bank Account',
            accountNumber: 'BANK-001',
            bankName: 'Prime Bank',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        },
        {
            name: 'Mobile Money Account',
            accountNumber: 'MOMO-001',
            bankName: 'Mobile Money',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        }
    ];

    let seeded: BankAccount[] = [];
    let temp = [...existing];

    for (const accountData of sampleAccounts) {
        const newAccount: BankAccount = {
            ...accountData,
            id: generateNextId('BANK', temp),
            balance: 0,
            availableBalance: 0,
            createdAt: now,
            updatedAt: now
        };
        await bankAccountsStore.put(newAccount);
        temp.push(newAccount);
        seeded.push(newAccount);
    }

    return temp;
};

const resolveBankAccountForPayment = (
    bankAccounts: BankAccount[],
    payment: Pick<CustomerPayment, 'accountId' | 'paymentMethod'>
): BankAccount | undefined => {
    if (bankAccounts.length === 0) return undefined;

    if (payment.accountId) {
        const direct = bankAccounts.find(acc => acc.id === payment.accountId);
        if (direct) return direct;
    }

    const method = (payment.paymentMethod || '').toLowerCase();
    const accountId = payment.accountId || '';

    const matches = (acc: BankAccount, tokens: string[]) => {
        const name = (acc.name || '').toLowerCase();
        const number = (acc.accountNumber || '').toLowerCase();
        return tokens.some(token => name.includes(token) || number.includes(token));
    };

    if (accountId === '1000' || method.includes('cash')) {
        return bankAccounts.find(acc => matches(acc, ['cash']));
    }

    if (accountId === '1060' || method.includes('mobile') || method.includes('momo')) {
        return bankAccounts.find(acc => matches(acc, ['mobile', 'momo']));
    }

    if (accountId === '1050' || method.includes('bank') || method.includes('card')) {
        return bankAccounts.find(acc => matches(acc, ['bank']));
    }

    return undefined;
};

const reserveIdempotencyKey = async (
    tx: any,
    scope: string,
    sourceId: string,
    explicitKey?: string
) => {
    const store = tx.objectStore('idempotencyKeys');
    const key = String(explicitKey || `${scope}:${sourceId}`).trim();
    const existing = await store.get(key);
    if (existing) {
        throw new Error(`Duplicate financial request blocked for ${scope} (${sourceId}).`);
    }

    await store.put({
        id: key,
        scope,
        sourceId,
        createdAt: new Date().toISOString()
    });
};

const ensureMirroredBankTransaction = async ({
    bankAccountsStore,
    bankTransactionsStore,
    date,
    amount,
    type,
    description,
    reference,
    accountId,
    paymentMethod,
    category,
    counterpartyName
}: {
    bankAccountsStore: any;
    bankTransactionsStore: any;
    date: string;
    amount: number;
    type: 'Deposit' | 'Withdrawal';
    description: string;
    reference: string;
    accountId?: string;
    paymentMethod?: string;
    category?: string;
    counterpartyName?: string;
}) => {
    const normalizedAmount = roundToCurrency(Math.max(0, Number(amount || 0)));
    if (normalizedAmount <= 0) return null;

    const bankAccounts = await ensureBankAccounts(bankAccountsStore);
    const bankAccount = resolveBankAccountForPayment(bankAccounts, {
        accountId,
        paymentMethod: paymentMethod || ''
    });
    if (!bankAccount) return null;

    const allBankTransactions = await bankTransactionsStore.getAll();
    const existing = allBankTransactions.find((entry: BankTransaction) =>
        entry.bankAccountId === bankAccount.id &&
        entry.reference === reference &&
        entry.type === type
    );
    if (existing) return existing;

    const bankTx: BankTransaction = {
        id: generateNextId('TXN', allBankTransactions),
        date,
        amount: normalizedAmount,
        type,
        description,
        reference,
        bankAccountId: bankAccount.id,
        counterparty: counterpartyName ? { name: counterpartyName } : undefined,
        category,
        reconciled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const nextTransactions = [...allBankTransactions, bankTx];
    await bankTransactionsStore.put(bankTx);

    const nextBalance = calculateBankBalance(nextTransactions, bankAccount.id);
    await bankAccountsStore.put({
        ...bankAccount,
        balance: roundToCurrency(nextBalance),
        availableBalance: roundToCurrency(nextBalance),
        updatedAt: new Date().toISOString()
    });

    return bankTx;
};

const getVatConfig = (): VATConfig | undefined => {
    const saved = localStorage.getItem('nexus_company_config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            return config.vat;
        } catch (e) {
            console.error("Failed to parse company config for VAT", e);
        }
    }
    return undefined;
};

const toMoney = (value: number): number => {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
};

/**
 * Create a multi-currency journal entry
 * Handles currency conversion and gain/loss calculation
 */
const createMultiCurrencyJournalEntry = async (
    date: Date | string,
    description: string,
    lines: Array<{
        accountId: string;
        amount: number;
        currency: string;
        type: 'debit' | 'credit';
    }>,
    transactionCurrency: string,
    reference?: string
): Promise<MultiCurrencyJournalEntry> => {
    const baseCurrency = currencyService.getBaseCurrency();
    
    // Get exchange rate for the transaction
    const exchangeRate = transactionCurrency === baseCurrency 
        ? 1 
        : await currencyService.getExchangeRate(transactionCurrency, baseCurrency);
    
    // Process lines with currency conversion
    const processedLines: MultiCurrencyTransactionLine[] = await Promise.all(
        lines.map(async (line) => {
            const baseAmount = line.currency === baseCurrency
                ? line.amount
                : currencyService.roundAmount(
                    (await currencyService.convert(line.amount, line.currency, baseCurrency)).baseAmount,
                    baseCurrency
                );
            
            return {
                accountId: line.accountId,
                amount: line.amount,
                currency: line.currency,
                baseAmount,
                baseCurrency,
                exchangeRate: line.currency === baseCurrency ? 1 : exchangeRate,
                exchangeRateDate: new Date(),
                debit: line.type === 'debit' ? line.amount : 0,
                credit: line.type === 'credit' ? line.amount : 0,
            };
        })
    );
    
    // Calculate totals
    const totalDebit = processedLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = processedLines.reduce((sum, l) => sum + l.credit, 0);
    const totalBaseDebit = processedLines.reduce((sum, l) => sum + (l.type === 'debit' ? l.baseAmount : 0), 0);
    const totalBaseCredit = processedLines.reduce((sum, l) => sum + (l.type === 'credit' ? l.baseAmount : 0), 0);
    
    return {
        id: `MCJ-${Date.now()}`,
        date: typeof date === 'string' ? new Date(date) : date,
        description,
        reference,
        transactionCurrency,
        exchangeRate,
        exchangeRateDate: new Date(),
        lines: processedLines.map((l, i) => ({
            ...l,
            description: lines[i].description,
        })),
        totalDebit,
        totalCredit,
        totalBaseDebit,
        totalBaseCredit,
        createdBy: 'system',
        createdAt: new Date(),
        status: 'posted',
    };
};

/**
 * Calculate currency gain/loss for a payment
 */
const calculatePaymentGainLoss = async (
    invoice: Invoice,
    paymentAmount: number,
    paymentCurrency: string,
    paymentRate: number
): Promise<CurrencyGainLoss | null> => {
    const baseCurrency = currencyService.getBaseCurrency();
    const invoiceCurrency = (invoice as any).currency || baseCurrency;
    
    // If same currency, no gain/loss
    if (invoiceCurrency === paymentCurrency) {
        return null;
    }
    
    // Get original invoice rate
    const invoiceRate = invoiceCurrency === baseCurrency 
        ? 1 
        : await currencyService.getExchangeRate(invoiceCurrency, baseCurrency);
    
    return currencyService.calculateGainLoss(
        invoice.id,
        invoice.totalAmount,
        invoiceCurrency,
        invoiceRate,
        paymentAmount,
        paymentRate
    );
};

const resolveItemUnitCost = (item: any, inventoryItem: any): number => {
    const snapshotCost = Number(item?.productionCostSnapshot?.baseProductionCost);
    if (Number.isFinite(snapshotCost) && snapshotCost > 0) return snapshotCost;

    const directCost = Number(item?.cost_price ?? item?.cost);
    if (Number.isFinite(directCost) && directCost > 0) return directCost;

    const variantId = item?.variantId;
    if (variantId && inventoryItem?.variants?.length) {
        const variant = inventoryItem.variants.find((v: any) => v.id === variantId);
        if (variant) {
            const variantCost = Number(variant.cost_price ?? variant.cost);
            if (Number.isFinite(variantCost) && variantCost > 0) return variantCost;
        }
    }

    const inventoryCost = Number(inventoryItem?.cost_price ?? inventoryItem?.cost);
    return Number.isFinite(inventoryCost) ? inventoryCost : 0;
};

const resolveInventoryRecord = async (
    itemId: string | undefined,
    ...sources: any[]
) => {
    const normalizedItemId = String(itemId || '').trim();
    if (!normalizedItemId) return undefined;

    for (const source of sources) {
        if (!source) continue;

        if (Array.isArray(source)) {
            const match = source.find((entry) => String(entry?.id || '').trim() === normalizedItemId);
            if (match) return match;
            continue;
        }

        if (source instanceof Map) {
            const match = source.get(normalizedItemId);
            if (match) return match;
            continue;
        }

        if (typeof source.get === 'function') {
            const match = await source.get(normalizedItemId);
            if (match) return match;
        }
    }

    return undefined;
};

const calculateItemsCost = async (
    items: any[],
    inventorySource: any,
    resolveId: (item: any) => string | undefined,
    fallbackInventorySource?: any
) => {
    let totalCost = 0;
    for (const item of items || []) {
        if (item?.type === 'Service') continue;
        const itemId = resolveId(item);
        if (!itemId) continue;
        const invItem = await resolveInventoryRecord(itemId, inventorySource, fallbackInventorySource);
        const unitCost = resolveItemUnitCost(item, invItem);
        const qty = Number(item?.quantity || 0);
        if (qty > 0 && unitCost > 0) {
            totalCost += unitCost * qty;
        }
    }
    return roundToCurrency(totalCost);
};

const distributePosRetainedAmounts = (
    payments: { method: string; amount: number; accountId?: string }[],
    totalAmount: number
): number[] => {
    const retained = payments.map(payment => toMoney(payment.amount));
    let remainingChange = Math.max(0, toMoney(payments.reduce((sum, payment) => sum + payment.amount, 0) - totalAmount));
    if (remainingChange <= 0) return retained;

    const cashIndexes = payments
        .map((payment, index) => ({ payment, index }))
        .filter(entry => entry.payment.method === 'Cash')
        .map(entry => entry.index);

    const deductionOrder = cashIndexes.length > 0
        ? cashIndexes
        : (payments.length > 0 ? [payments.length - 1] : []);

    const deductFromIndex = (index: number) => {
        if (remainingChange <= 0) return;
        const current = retained[index] || 0;
        if (current <= 0) return;
        const deduction = Math.min(current, remainingChange);
        retained[index] = toMoney(current - deduction);
        remainingChange = toMoney(remainingChange - deduction);
    };

    for (const index of deductionOrder) {
        deductFromIndex(index);
        if (remainingChange <= 0) break;
    }

    if (remainingChange > 0) {
        for (let index = retained.length - 1; index >= 0; index -= 1) {
            deductFromIndex(index);
            if (remainingChange <= 0) break;
        }
    }

    return retained.map(amount => Math.max(0, toMoney(amount)));
};

export const transactionService = {
    /**
     * Internal helper to handle structured inventory deduction with audit trail
     */
    async _executeDeductInventory(
        inventoryStore: any,
        inventoryTransactionsStore: any,
        items: CartItem[],
        snapshots: ConsumptionSnapshot[],
        referenceType: string,
        referenceId: string,
        performedBy: string,
        inventorySnapshot?: any[]
    ) {
        const timestamp = new Date().toISOString();

        // 1. Deduct Materials from BOM Snapshots
        for (const snap of snapshots) {
            if (!snap.bomBreakdown) continue;
            for (const comp of snap.bomBreakdown) {
                const matItem = await resolveInventoryRecord(comp.materialId, inventorySnapshot, inventoryStore);
                if (matItem) {
                    const previousQuantity = matItem.stock || 0;
                    const newQuantity = previousQuantity - comp.quantity;
                    matItem.stock = newQuantity;
                    await inventoryStore.put(matItem);

                    // Create audit trail record
                    const transaction = {
                        id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        itemId: comp.materialId,
                        type: 'OUT',
                        quantity: -comp.quantity,
                        previousQuantity,
                        newQuantity,
                        unitCost: matItem.cost || 0,
                        totalCost: -(comp.quantity * (matItem.cost || 0)),
                        reference: referenceType,
                        referenceId,
                        reason: `BOM Component for ${referenceType}`,
                        performedBy,
                        timestamp
                    };
                    await inventoryTransactionsStore.put(transaction);
                }
            }
        }

        // 2. Deduct Finished Products (Items without BOM snapshots)
        for (const item of items) {
            const hasSnapshot = snapshots.some(s => s.itemId === (item.parentId || item.id));
            if (!hasSnapshot && item.type !== 'Service') {
                const invItem = await resolveInventoryRecord(item.id, inventorySnapshot, inventoryStore);
                if (invItem && invItem.type !== 'Service') {
                    const previousQuantity = invItem.stock || 0;
                    const newQuantity = previousQuantity - item.quantity;
                    invItem.stock = newQuantity;
                    await inventoryStore.put(invItem);

                    // Create audit trail record
                    const transaction = {
                        id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        itemId: item.id,
                        type: 'OUT',
                        quantity: -item.quantity,
                        previousQuantity,
                        newQuantity,
                        unitCost: invItem.cost || 0,
                        totalCost: -(item.quantity * (invItem.cost || 0)),
                        reference: referenceType,
                        referenceId,
                        reason: `${referenceType} Sale`,
                        performedBy,
                        timestamp
                    };
                    await inventoryTransactionsStore.put(transaction);
                }
            }
        }
    },

    /**
     * Internal helper to process market adjustments for any transaction type.
     * This shared method handles adjustment snapshot generation and transaction recording.
     * 
     * @param items - Cart items to process adjustments for
     * @param inventory - Full inventory array for lookups
     * @param bomTemplates - BOM templates for production items
     * @param marketAdjustments - Active market adjustments
     * @param transactionId - The sale/invoice/order ID
     * @param transactionType - Type of transaction for proper ID field naming
     * @param inventoryStore - IndexedDB store for inventory lookups
     * @returns Processed adjustment data including snapshots and transactions
     */
    async _processMarketAdjustments(
        items: CartItem[],
        inventory: any[],
        bomTemplates: BOMTemplate[],
        marketAdjustments: MarketAdjustment[],
        transactionId: string,
        transactionType: 'sale' | 'invoice' | 'order' | 'quotation',
        inventoryStore: any
    ): Promise<{
        transactionAdjustmentSnapshots: TransactionAdjustmentSnapshot[];
        adjustmentTransactions: MarketAdjustmentTransaction[];
        adjustmentSnapshots: any[];
        adjustmentTotal: number;
        // TODO: normalise to adjustmentSnapshots — see cleanup tracker
        adjustmentSummary: any[];
    }> {
        const allTransactionSnapshots: TransactionAdjustmentSnapshot[] = [];
        const allAdjustmentTransactions: MarketAdjustmentTransaction[] = [];
        const allSnapshots: any[] = [];
        let totalAdjustment = 0;

        for (const item of items) {
            // Check if item already has transaction adjustment snapshots
            // OR basic adjustmentSnapshots (for variants passed from POS/OrderForm)
            const hasTransactionSnapshots = item.transactionAdjustmentSnapshots && item.transactionAdjustmentSnapshots.length > 0;
            const hasBasicSnapshots = (item as any).adjustmentSnapshots && (item as any).adjustmentSnapshots.length > 0;
            
            if (hasTransactionSnapshots) {
                // Use existing transaction-level snapshots (full format)
                const updatedSnapshots = item.transactionAdjustmentSnapshots.map((snap: any) => ({
                    ...snap,
                    ...(transactionType === 'sale' ? { saleId: transactionId } :
                        transactionType === 'invoice' ? { invoiceId: transactionId } :
                            transactionType === 'order' ? { orderId: transactionId } :
                                { quotationId: transactionId })
                }));
                allTransactionSnapshots.push(...updatedSnapshots);

                // Create adjustment transactions from snapshots
                const transactions = pricingService.createAdjustmentTransactions(updatedSnapshots, transactionId);
                allAdjustmentTransactions.push(...transactions);
            } else if (hasBasicSnapshots) {
                // ✅ Convert basic adjustmentSnapshots to TransactionAdjustmentSnapshot format
                // This ensures POS items have proper transaction-level tracking
                const basicSnapshots = (item as any).adjustmentSnapshots;
                const quantity = item.quantity || 1;
                const itemCost = item.cost || 0;
                
                const convertedSnapshots: TransactionAdjustmentSnapshot[] = basicSnapshots.map((snap: any) => ({
                    adjustmentId: snap.adjustmentId || '',
                    itemId: item.id,
                    itemName: item.name || (item as any).productName || 'Unknown Item',
                    variantId: (item as any).variantId || (item as any).parentId,
                    quantity: quantity,
                    baseCost: itemCost,
                    unitAdjustmentAmount: snap.calculatedAmount || 0,
                    totalAdjustmentAmount: (snap.calculatedAmount || 0) * quantity,
                    timestamp: new Date().toISOString(),
                    name: snap.name,
                    type: snap.type || 'PERCENTAGE',
                    value: snap.value || snap.percentage || 0,
                    calculatedAmount: snap.calculatedAmount || 0,
                    category: snap.category,
                    isActive: true,
                    // Add transaction ID based on type
                    ...(transactionType === 'sale' ? { saleId: transactionId } :
                        transactionType === 'invoice' ? { invoiceId: transactionId } :
                            transactionType === 'order' ? { orderId: transactionId } :
                                { quotationId: transactionId })
                }));
                
                allTransactionSnapshots.push(...convertedSnapshots);
                
                // Create adjustment transactions from converted snapshots
                const transactions = pricingService.createAdjustmentTransactions(convertedSnapshots, transactionId);
                allAdjustmentTransactions.push(...transactions);
                
                // Aggregate for basic adjustmentSnapshots tracking
                basicSnapshots.forEach((snap: any) => {
                    const amount = (snap.calculatedAmount || 0) * quantity;
                    const existing = allSnapshots.find(s => s.name === snap.name);
                    if (existing) {
                        existing.calculatedAmount = Number((existing.calculatedAmount + amount).toFixed(2));
                    } else {
                        allSnapshots.push({ ...snap, calculatedAmount: amount });
                    }
                });
                totalAdjustment += (item as any).adjustmentTotal || basicSnapshots.reduce((sum: number, s: any) => sum + (s.calculatedAmount || 0) * quantity, 0);
            } else {
                // Generate new snapshots using pricingService
                const invItem = await resolveInventoryRecord(item.id, inventory, inventoryStore);
                if (invItem && item.type !== 'Service') {
                    const res = pricingService.calculateItemPrice(
                        invItem,
                        item.quantity,
                        (item as any).variantId,
                        (item as any).pagesOverride,
                        inventory,
                        bomTemplates,
                        marketAdjustments
                    );

                    if (res.transactionAdjustmentSnapshots && res.transactionAdjustmentSnapshots.length > 0) {
                        // Update transaction ID in snapshots based on transaction type
                        const updatedSnapshots = res.transactionAdjustmentSnapshots.map(snap => ({
                            ...snap,
                            ...(transactionType === 'sale' ? { saleId: transactionId } :
                                transactionType === 'invoice' ? { invoiceId: transactionId } :
                                    transactionType === 'order' ? { orderId: transactionId } :
                                        { quotationId: transactionId })
                        }));
                        allTransactionSnapshots.push(...updatedSnapshots);

                        // Create adjustment transactions
                        const transactions = pricingService.createAdjustmentTransactions(updatedSnapshots, transactionId);
                        allAdjustmentTransactions.push(...transactions);
                    }

                    // Also capture basic adjustment snapshots for backward compatibility
                    if (res.adjustmentSnapshots) {
                        res.adjustmentSnapshots.forEach((snap: any) => {
                            const existing = allSnapshots.find(s => s.name === snap.name);
                            if (existing) {
                                existing.calculatedAmount = Number((existing.calculatedAmount + snap.calculatedAmount).toFixed(2));
                            } else {
                                allSnapshots.push({ ...snap });
                            }
                        });
                    }
                    totalAdjustment += (res.adjustmentTotal || 0);
                }
            }
        }

        // Generate adjustment summary
        const adjustmentSummary = pricingService.generateAdjustmentSummary(allTransactionSnapshots);

        return {
            transactionAdjustmentSnapshots: allTransactionSnapshots,
            adjustmentTransactions: allAdjustmentTransactions,
            adjustmentSnapshots: allSnapshots,
            adjustmentTotal: Number(totalAdjustment.toFixed(2)),
            adjustmentSummary
        };
    },

    _normalizeProofOfDelivery(
        proof?: ProofOfDeliveryRecord | null
    ): ProofOfDeliveryRecord | undefined {
        if (!proof) return undefined;

        const signatureDataUrl = resolveSignatureDataUrl(proof as any);
        if (!signatureDataUrl) return undefined;

        const normalizedMode = inferSignatureInputMode(
            (proof as any).signatureInputMode,
            signatureDataUrl
        );

        return {
            ...proof,
            signature: signatureDataUrl,
            signatureDataUrl,
            signatureInputMode: normalizedMode,
            notes: proof.notes || proof.remarks,
            remarks: proof.remarks || proof.notes
        } as ProofOfDeliveryRecord;
    },

    async updateShipmentStatus(shipment: Shipment, deliveryNotePatch?: Partial<DeliveryNote>) {
        return dbService.executeAtomicOperation(
            ['shipments', 'deliveryNotes'],
            async (tx) => {
                const shipmentStore = tx.objectStore('shipments');
                const deliveryNoteStore = tx.objectStore('deliveryNotes');

                const normalizedShipmentProof = this._normalizeProofOfDelivery(shipment.proofOfDelivery);
                const normalizedShipment: Shipment = {
                    ...shipment,
                    proofOfDelivery: normalizedShipmentProof || shipment.proofOfDelivery
                };

                await shipmentStore.put(normalizedShipment);

                const deliveryNoteId = deliveryNotePatch?.id || shipment.orderId;
                let linkedDeliveryNote: DeliveryNote | undefined;

                if (deliveryNoteId) {
                    linkedDeliveryNote = await deliveryNoteStore.get(deliveryNoteId);
                }

                if (!linkedDeliveryNote && shipment.orderId) {
                    const allDeliveryNotes: DeliveryNote[] = await deliveryNoteStore.getAll();
                    linkedDeliveryNote = allDeliveryNotes.find((note) =>
                        note.id === shipment.orderId || note.invoiceId === shipment.orderId
                    );
                }

                if (!linkedDeliveryNote && !deliveryNotePatch) {
                    return { success: true, shipment: normalizedShipment, deliveryNote: null };
                }

                const mappedStatus: DeliveryNote['status'] | undefined =
                    (deliveryNotePatch?.status as DeliveryNote['status'] | undefined) ||
                    (shipment.status === 'Delivered'
                        ? 'Delivered'
                        : shipment.status === 'In Transit'
                            ? 'In Transit'
                            : undefined);

                const normalizedDeliveryProof = this._normalizeProofOfDelivery(
                    deliveryNotePatch?.proofOfDelivery || shipment.proofOfDelivery
                );

                const fallbackDeliveryNote: DeliveryNote = {
                    id: deliveryNoteId || shipment.orderId,
                    invoiceId: shipment.orderId,
                    date: shipment.actualArrival || shipment.estimatedDelivery || new Date().toISOString(),
                    customerName: shipment.customerName,
                    shippingAddress: '',
                    items: [],
                    status: mappedStatus || 'Pending'
                };

                const mergedDeliveryNote: DeliveryNote = {
                    ...(linkedDeliveryNote || fallbackDeliveryNote),
                    ...(deliveryNotePatch || {}),
                    id: linkedDeliveryNote?.id || deliveryNotePatch?.id || deliveryNoteId || shipment.orderId,
                    customerName:
                        deliveryNotePatch?.customerName ||
                        linkedDeliveryNote?.customerName ||
                        shipment.customerName,
                    carrier: deliveryNotePatch?.carrier ?? shipment.carrier ?? linkedDeliveryNote?.carrier,
                    driverName: deliveryNotePatch?.driverName ?? shipment.driverName ?? linkedDeliveryNote?.driverName,
                    vehicleNo: deliveryNotePatch?.vehicleNo ?? shipment.vehicleNo ?? linkedDeliveryNote?.vehicleNo,
                    trackingNumber:
                        deliveryNotePatch?.trackingNumber ?? shipment.trackingNumber ?? linkedDeliveryNote?.trackingNumber,
                    estimatedDelivery:
                        deliveryNotePatch?.estimatedDelivery ??
                        shipment.estimatedDelivery ??
                        linkedDeliveryNote?.estimatedDelivery,
                    actualArrival:
                        deliveryNotePatch?.actualArrival ?? shipment.actualArrival ?? linkedDeliveryNote?.actualArrival,
                    currentLocation:
                        deliveryNotePatch?.currentLocation ??
                        shipment.currentLocation ??
                        linkedDeliveryNote?.currentLocation,
                    status: mappedStatus || linkedDeliveryNote?.status || 'Pending',
                    proofOfDelivery:
                        normalizedDeliveryProof ||
                        linkedDeliveryNote?.proofOfDelivery ||
                        deliveryNotePatch?.proofOfDelivery
                };

                await deliveryNoteStore.put(mergedDeliveryNote);

                return { success: true, shipment: normalizedShipment, deliveryNote: mergedDeliveryNote };
            }
        );
    },

    async reconcileLegacyShipmentProofToDeliveryNotes() {
        return dbService.executeAtomicOperation(
            ['shipments', 'deliveryNotes'],
            async (tx) => {
                const shipmentStore = tx.objectStore('shipments');
                const deliveryNoteStore = tx.objectStore('deliveryNotes');

                const allShipments: Shipment[] = await shipmentStore.getAll();
                const allDeliveryNotes: DeliveryNote[] = await deliveryNoteStore.getAll();
                const deliveryNoteById = new Map(allDeliveryNotes.map((note) => [note.id, note]));
                const updatedDeliveryNotes: DeliveryNote[] = [];

                for (const shipment of allShipments) {
                    if (shipment.status !== 'Delivered' || !shipment.proofOfDelivery) continue;

                    const note = deliveryNoteById.get(shipment.orderId);
                    if (!note) continue;

                    const hasAuthoritativeProof = Boolean(
                        resolveSignatureDataUrl(note.proofOfDelivery as any)
                    );
                    if (hasAuthoritativeProof) continue;

                    const normalizedProof = this._normalizeProofOfDelivery(shipment.proofOfDelivery);
                    if (!normalizedProof) continue;

                    const patchedNote: DeliveryNote = {
                        ...note,
                        status: note.status === 'Delivered' ? note.status : 'Delivered',
                        carrier: note.carrier ?? shipment.carrier,
                        driverName: note.driverName ?? shipment.driverName,
                        vehicleNo: note.vehicleNo ?? shipment.vehicleNo,
                        trackingNumber: note.trackingNumber ?? shipment.trackingNumber,
                        estimatedDelivery: note.estimatedDelivery ?? shipment.estimatedDelivery,
                        actualArrival: note.actualArrival ?? shipment.actualArrival ?? normalizedProof.timestamp,
                        currentLocation: note.currentLocation ?? shipment.currentLocation ?? normalizedProof.locationStamp,
                        proofOfDelivery: normalizedProof
                    };

                    await deliveryNoteStore.put(patchedNote);
                    updatedDeliveryNotes.push(patchedNote);
                    deliveryNoteById.set(patchedNote.id, patchedNote);
                }

                return {
                    success: true,
                    updatedCount: updatedDeliveryNotes.length,
                    updatedDeliveryNotes
                };
            }
        );
    },

    /**
     * Processes a sale atomically: 
     * 1. Saves the sale record
     * 2. Updates inventory stock
     * 3. Creates ledger entries
     * 4. Handles excess payment (Wallet deposit)
     */
    async processSale(sale: Sale, excessHandling?: 'Change' | 'Wallet', performedBy?: string) {
        const stores: any[] = ['sales', 'inventory', 'ledger', 'accounts', 'customers', 'walletTransactions', 'customerPayments', 'vatTransactions', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'bankAccounts', 'bankTransactions', 'invoices', 'inventoryTransactions', 'idempotencyKeys'];

        return dbService.executeAtomicOperation(
            stores,
            async (tx) => {
                await reserveIdempotencyKey(tx, 'sale', sale.id, (sale as any).idempotencyKey);

                const salesStore = tx.objectStore('sales');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const walletStore = tx.objectStore('walletTransactions');
                const customerPaymentsStore = tx.objectStore('customerPayments');
                const vatStore = tx.objectStore('vatTransactions');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const inventoryTransactionsStore = tx.objectStore('inventoryTransactions');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');
                const invoicesStore = tx.objectStore('invoices');

                // Pre-fetch data for snapshots
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                // 1. Validation & Snapshot Generation
                // We trust the snapshots passed from the UI (OrderForm/POS) if they exist and are valid.
                let snapshots: ConsumptionSnapshot[] = sale.consumptionSnapshots || [];

                // Fallback: If no snapshots provided (e.g. legacy/API), try to generate them using pricingService
                if (!snapshots || snapshots.length === 0) {
                    for (const item of sale.items) {
                        if (item.type !== 'Service' && (item as any).printConsumptionEnabled) {
                            // Use the pricingService helper to generate a snapshot
                            // We need to fetch the item fully first
                            const invItem = await resolveInventoryRecord(item.id, inventory, inventoryStore);
                            if (invItem) {
                                const res = pricingService.calculateItemPrice(
                                    invItem,
                                    item.quantity,
                                    (item as any).variantId, // Cast as any if variantId property missing on CartItem interface in basic context
                                    (item as any).pagesOverride,
                                    inventory,
                                    bomTemplates,
                                    marketAdjustments // Include market adjustments in fallback
                                );
                                if (res.consumption) snapshots.push({ ...res.consumption, saleId: sale.id });
                            }
                        }
                    }
                    // Update sale with generated snapshots
                    sale.consumptionSnapshots = snapshots;
                }

                // 2. Inventory Deduction Gate
                const shouldDeduct = sale.status === 'Paid' || sale.status === 'Completed' || (sale.status === 'Partial' && sale.fulfillmentStatus === 'Delivered');

                if (shouldDeduct) {
                    await this._executeDeductInventory(
                        inventoryStore,
                        inventoryTransactionsStore,
                        sale.items,
                        snapshots,
                        'Sale',
                        sale.id,
                        performedBy || 'System',
                        inventory
                    );
                }

                // 3. Save the sale with snapshots
                sale.consumptionSnapshots = snapshots;

                // 4. Process Market Adjustments using shared helper
                const adjustmentResult = await this._processMarketAdjustments(
                    sale.items,
                    inventory,
                    bomTemplates,
                    marketAdjustments,
                    sale.id,
                    'sale',
                    inventoryStore
                );

                // Store both basic and granular adjustment data
                sale.adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                    ? adjustmentResult.adjustmentSnapshots
                    : sale.adjustmentSnapshots;
                sale.adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                    ? adjustmentResult.adjustmentTotal
                    : sale.adjustmentTotal;
                sale.transactionAdjustments = adjustmentResult.adjustmentTransactions;
                sale.adjustmentSummary = adjustmentResult.adjustmentSummary;

                // Backward compatibility: store profitAdjustment from snapshots
                try {
                    const profit = extractProfitMargin(sale);
                    (sale as any).profitAdjustment = profit;
                } catch (e) {
                    // ignore extraction errors
                }

                // Save adjustment transactions to the store
                for (const adjTx of adjustmentResult.adjustmentTransactions) {
                    await marketAdjustmentTransactionsStore.put(adjTx);
                }

                await salesStore.put(sale);

                const rawPayments = sale.payments && sale.payments.length > 0
                    ? sale.payments.map(payment => ({
                        method: payment.method,
                        amount: toMoney(payment.amount),
                        accountId: payment.accountId
                    }))
                    : [{
                        method: sale.paymentMethod || 'Cash',
                        amount: toMoney(sale.totalAmount),
                        accountId: undefined
                    }];

                const totalTendered = toMoney(rawPayments.reduce((sum, payment) => sum + payment.amount, 0));
                const saleTotal = toMoney(sale.totalAmount);
                const walletDepositAmount = excessHandling === 'Wallet'
                    ? toMoney(Math.max(0, totalTendered - saleTotal))
                    : 0;
                const retainedTarget = toMoney(
                    excessHandling === 'Wallet' ? totalTendered : saleTotal
                );
                const retainedAmounts = distributePosRetainedAmounts(rawPayments, retainedTarget);

                const normalizedPayments = rawPayments.map((payment, index) => {
                    const retained = toMoney(retainedAmounts[index] || 0);
                    const tendered = toMoney(payment.amount);
                    const excess = toMoney(Math.max(0, tendered - retained));
                    return {
                        ...payment,
                        tendered,
                        retained,
                        excess,
                        reference: rawPayments.length > 1 ? `POS-${sale.id}-${index + 1}` : `POS-${sale.id}`,
                        description: `POS Sale #${sale.id} (${payment.method})`
                    };
                });

                const totalRetained = toMoney(normalizedPayments.reduce((sum, payment) => sum + payment.retained, 0));
                const totalChange = toMoney(Math.max(0, totalTendered - totalRetained));
                sale.cash_tendered = totalTendered;
                sale.change_due = totalChange;
                sale.excessAmount = walletDepositAmount > 0 ? walletDepositAmount : totalChange;
                await salesStore.put(sale);

                // 3. Create Ledger Entries
                const gl = getGLConfig();
                const vatConfig = getVatConfig();
                const totalAmount = Number(sale.totalAmount);
                const roundingDiff = Number(sale.roundingDifference || 0);
                let revenueAmount = totalAmount - roundingDiff;
                let taxAmount = 0;
                let marketAdjustmentAmount = sale.adjustmentTotal || 0;

                const isVatMode = vatConfig?.pricingMode === 'VAT';
                const isMarketMode = vatConfig?.pricingMode === 'MarketAdjustment';
                const paymentRatio = totalAmount > 0 ? Math.min(1, totalRetained / totalAmount) : 0;
                const outstandingAmount = Math.max(0, toMoney(totalAmount - totalRetained));

                if (isVatMode && vatConfig?.outputTaxAccount) {
                    const rate = vatConfig.rate || 17.5;
                    // Tax is typically calculated on the unrounded, unadjusted base.
                    // But simplified here: assume tax included in total, proportional.
                    // If rounding exists, tax should be on (Total - Rounding).
                    const baseForTax = revenueAmount;
                    taxAmount = baseForTax - (baseForTax / (1 + rate / 100));
                    revenueAmount -= taxAmount;

                    const vatTx: VatTransaction = {
                        id: `VAT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: sale.date,
                        type: 'Output',
                        amount: Number(taxAmount.toFixed(2)),
                        taxableAmount: Number(revenueAmount.toFixed(2)),
                        rate: rate,
                        referenceId: sale.id,
                        referenceType: 'Invoice',
                        description: `VAT on Sale #${sale.id}`,
                        isFiled: false,
                        customerName: sale.customerName
                    };
                    await vatStore.put(vatTx);

                    const paidTax = roundToCurrency(taxAmount * paymentRatio);
                    const unpaidTax = roundToCurrency(taxAmount - paidTax);

                    if (paidTax > 0) {
                        const taxEntry: LedgerEntry = {
                            id: `LG-TAX-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `VAT Output - Sale #${sale.id}`,
                            debitAccountId: gl.cashDrawerAccount,
                            creditAccountId: vatConfig.outputTaxAccount,
                            amount: Number(paidTax.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                        await ledgerStore.put(taxEntry);
                    }

                    if (unpaidTax > 0) {
                        const taxEntry: LedgerEntry = {
                            id: `LG-TAX-AR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `VAT Output (AR) - Sale #${sale.id}`,
                            debitAccountId: gl.accountsReceivable,
                            creditAccountId: vatConfig.outputTaxAccount,
                            amount: Number(unpaidTax.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                        await ledgerStore.put(taxEntry);
                    }
                }

                if (isMarketMode && marketAdjustmentAmount > 0) {
                    revenueAmount -= marketAdjustmentAmount;

                    if (vatConfig?.marketAdjustmentAccount) {
                        const paidMarket = roundToCurrency(marketAdjustmentAmount * paymentRatio);
                        const unpaidMarket = roundToCurrency(marketAdjustmentAmount - paidMarket);

                        if (paidMarket > 0) {
                            const marketEntry: LedgerEntry = {
                                id: `LG-MKT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                date: sale.date,
                                description: `Market Adjustment - Sale #${sale.id}`,
                                debitAccountId: gl.cashDrawerAccount,
                                creditAccountId: vatConfig.marketAdjustmentAccount,
                                amount: Number(paidMarket.toFixed(2)),
                                referenceId: sale.id,
                                reconciled: false,
                                customerId: sale.customerId,
                                customerName: sale.customerName
                            };
                            await ledgerStore.put(marketEntry);
                        }

                        if (unpaidMarket > 0) {
                            const marketEntry: LedgerEntry = {
                                id: `LG-MKT-AR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                date: sale.date,
                                description: `Market Adjustment (AR) - Sale #${sale.id}`,
                                debitAccountId: gl.accountsReceivable,
                                creditAccountId: vatConfig.marketAdjustmentAccount,
                                amount: Number(unpaidMarket.toFixed(2)),
                                referenceId: sale.id,
                                reconciled: false,
                                customerId: sale.customerId,
                                customerName: sale.customerName
                            };
                            await ledgerStore.put(marketEntry);
                        }
                    }
                }

                // ── SmartPricing Revenue Analytics: persist margin/rounding totals on sale ──
                const profitMarginTotal = Number((sale as any).profitMarginTotal || 0);
                const roundingTotal = Number((sale as any).roundingTotal || sale.roundingDifference || 0);

                // Write a ledger entry for realised profit margin (if captured from SmartPricing)
                if (profitMarginTotal > 0) {
                    const paidMargin = roundToCurrency(profitMarginTotal * paymentRatio);
                    if (paidMargin > 0) {
                        const marginAccount = gl.marginIncomeAccount || gl.otherIncomeAccount || '4900';
                        const marginEntry: LedgerEntry = {
                            id: `LG-MARGIN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `Profit Margin - Sale #${sale.id}`,
                            debitAccountId: gl.cashDrawerAccount,
                            creditAccountId: marginAccount,
                            amount: Number(paidMargin.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName,
                            entryType: 'ProfitMargin'
                        };
                        await ledgerStore.put(marginEntry);
                    }
                }

                // Handle Rounding Difference Ledger Entry
                if (Math.abs(roundingDiff) > 0.001) {
                    const paidRounding = roundToCurrency(roundingDiff * paymentRatio);
                    const unpaidRounding = roundToCurrency(roundingDiff - paidRounding);
                    
                    // If rounding is positive (gain), Credit Income/Rounding account. Debit Cash/AR.
                    // If rounding is negative (loss), Debit Expense/Rounding account. Credit Cash/AR (effectively reducing revenue receipt).
                    // For simplicity, we treat positive rounding as Other Income.
                    const roundingAccount = gl.roundingAccount || gl.otherIncomeAccount || '4900'; 
                    
                    if (paidRounding !== 0) {
                         const roundingEntry: LedgerEntry = {
                            id: `LG-RND-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `Rounding Difference - Sale #${sale.id}`,
                            debitAccountId: gl.cashDrawerAccount,
                            creditAccountId: roundingAccount,
                            amount: Number(paidRounding.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                        // If amount is negative, it means a loss. The ledger logic handles negative amounts? 
                        // Usually Ledger expects positive amounts and swaps debit/credit.
                        // But here we rely on the generic structure. 
                        // Better to normalize:
                        if (paidRounding < 0) {
                             roundingEntry.debitAccountId = roundingAccount;
                             roundingEntry.creditAccountId = gl.cashDrawerAccount;
                             roundingEntry.amount = Math.abs(roundingEntry.amount);
                        }
                        await ledgerStore.put(roundingEntry);
                    }

                    if (unpaidRounding !== 0) {
                         const roundingEntry: LedgerEntry = {
                            id: `LG-RND-AR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `Rounding Difference (AR) - Sale #${sale.id}`,
                            debitAccountId: gl.accountsReceivable,
                            creditAccountId: roundingAccount,
                            amount: Number(unpaidRounding.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                         if (unpaidRounding < 0) {
                             roundingEntry.debitAccountId = roundingAccount;
                             roundingEntry.creditAccountId = gl.accountsReceivable;
                             roundingEntry.amount = Math.abs(roundingEntry.amount);
                        }
                        await ledgerStore.put(roundingEntry);
                    }
                }

                const paidRevenue = roundToCurrency(revenueAmount * paymentRatio);
                const unpaidRevenue = roundToCurrency(revenueAmount - paidRevenue);

                if (paidRevenue > 0) {
                    const revenueEntry: LedgerEntry = {
                        id: `LG-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: sale.date,
                        description: `POS Sale Revenue #${sale.id}`,
                        debitAccountId: gl.cashDrawerAccount,
                        creditAccountId: gl.defaultSalesAccount,
                        amount: Number(paidRevenue.toFixed(2)),
                        referenceId: sale.id,
                        reconciled: false,
                        customerId: sale.customerId,
                        customerName: sale.customerName
                    };
                    await ledgerStore.put(revenueEntry);
                }

                if (unpaidRevenue > 0) {
                    const revenueEntry: LedgerEntry = {
                        id: `LG-REV-AR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: sale.date,
                        description: `POS Sale Revenue (AR) #${sale.id}`,
                        debitAccountId: gl.accountsReceivable,
                        creditAccountId: gl.defaultSalesAccount,
                        amount: Number(unpaidRevenue.toFixed(2)),
                        referenceId: sale.id,
                        reconciled: false,
                        customerId: sale.customerId,
                        customerName: sale.customerName
                    };
                    await ledgerStore.put(revenueEntry);
                }

                if (shouldDeduct) {
                    const cogsTotal = await calculateItemsCost(
                        sale.items || [],
                        inventory,
                        (item) => item.parentId || item.id
                    );
                    if (cogsTotal > 0) {
                        const cogsEntry: LedgerEntry = {
                            id: `LG-COGS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `COGS - Sale #${sale.id}`,
                            debitAccountId: gl.defaultCOGSAccount,
                            creditAccountId: gl.defaultInventoryAccount,
                            amount: Number(cogsTotal.toFixed(2)),
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                        await ledgerStore.put(cogsEntry);
                    }
                }

                if (outstandingAmount > 0 && sale.customerId) {
                    const customer = await customerStore.get(sale.customerId);
                    if (customer) {
                        customer.balance = toMoney((customer.balance || 0) + outstandingAmount);
                        await customerStore.put(customer);
                    }
                }

                // If sale has specific payments, reflect retained amounts in GL.
                for (const payment of normalizedPayments) {
                    if (payment.retained <= 0) continue;

                    let targetDebitAccount = gl.cashDrawerAccount;
                    if (payment.accountId) {
                        targetDebitAccount = payment.accountId;
                    } else {
                        if (payment.method === 'Card' || payment.method === 'Bank Transfer') targetDebitAccount = gl.bankAccount;
                        if (payment.method === 'Mobile Money') targetDebitAccount = gl.mobileMoneyAccount;
                        if (payment.method === 'Wallet') targetDebitAccount = gl.customerWalletAccount;
                    }

                    const payEntry: LedgerEntry = {
                        id: `LG-PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: sale.date,
                        description: `Payment [${payment.method}] - Sale #${sale.id}`,
                        debitAccountId: targetDebitAccount,
                        creditAccountId: gl.cashDrawerAccount, // Clear temporary cash debit from revenue entry
                        amount: payment.retained,
                        referenceId: sale.id,
                        reconciled: false,
                        customerId: sale.customerId,
                        customerName: sale.customerName
                    };
                    await ledgerStore.put(payEntry);

                    // Automatic transfer to Main Ledger for cash payments
                    if (payment.method === 'Cash') {
                        const transferEntry: LedgerEntry = {
                            id: `LG-TRANSFER-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: sale.date,
                            description: `Auto-transfer to Main Ledger - Sale #${sale.id}`,
                            debitAccountId: gl.bankAccount,
                            creditAccountId: gl.cashDrawerAccount,
                            amount: payment.retained,
                            referenceId: sale.id,
                            reconciled: false,
                            customerId: sale.customerId,
                            customerName: sale.customerName
                        };
                        await ledgerStore.put(transferEntry);
                    }
                }

                if (walletDepositAmount > 0 && sale.customerId && sale.customerId !== 'walk-in') {
                    const customer = await customerStore.get(sale.customerId);
                    if (customer) {
                        customer.walletBalance = toMoney((customer.walletBalance || 0) + walletDepositAmount);
                        await customerStore.put(customer);

                        const walletTx: WalletTransaction = {
                            id: `WLT-POS-${Date.now()}`,
                            customerId: sale.customerId,
                            amount: walletDepositAmount,
                            type: 'Deposit',
                            date: sale.date,
                            description: `Wallet deposit from POS Sale #${sale.id}`
                        };
                        await walletStore.put(walletTx);
                    }

                    const walletLedgerEntry: LedgerEntry = {
                        id: `LG-WLT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: sale.date,
                        description: `POS wallet deposit - Sale #${sale.id}`,
                        debitAccountId: gl.cashDrawerAccount,
                        creditAccountId: gl.customerDepositAccount,
                        amount: walletDepositAmount,
                        referenceId: sale.id,
                        reconciled: false,
                        customerId: sale.customerId,
                        customerName: sale.customerName
                    };
                    await ledgerStore.put(walletLedgerEntry);
                }

                // 5. Create Customer Payment Records
                const allPayments = await customerPaymentsStore.getAll();
                let tempPayments = [...allPayments];

                for (const payment of normalizedPayments) {
                    const nextId = generateNextId('RCPT', tempPayments);
                    const snapshot = calculateCustomerPaymentSnapshot({
                        amountTendered: payment.tendered,
                        appliedInvoices: [{
                            invoiceId: sale.id,
                            allocationAmount: payment.retained,
                            outstandingAmount: payment.retained
                        }],
                        excessHandling: payment.excess > 0
                            ? (excessHandling === 'Wallet' ? 'Wallet' : 'Change')
                            : undefined,
                        paymentPurpose: 'POS_PAYMENT',
                        paymentDate: sale.date,
                        customerName: sale.customerName
                    });

                    const custPayment: CustomerPayment = {
                        id: nextId,
                        date: sale.date,
                        customerId: sale.customerId || 'WALK-IN',
                        customerName: sale.customerName || 'Walk-in Customer',
                        amount: payment.retained,
                        paymentMethod: payment.method,
                        accountId: payment.accountId,
                        reference: sale.id,
                        notes: `POS Sale #${sale.id} - ${payment.method}${payment.excess > 0 ? ` (Tendered ${payment.tendered})` : ''}`,
                        allocations: [],
                        status: 'Cleared',
                        reconciled: false,
                        excessHandling: payment.excess > 0 ? (excessHandling === 'Wallet' ? 'Wallet' : 'Change') : undefined,
                        excessAmount: payment.excess > 0 && excessHandling === 'Wallet' ? payment.excess : undefined,
                        receiptSnapshot: snapshot,
                        invoiceTotal: snapshot.invoiceTotalAtPosting,
                        paymentStatus: snapshot.paymentStatus,
                        balanceDue: snapshot.balanceDueAfterPayment,
                        overpaymentAmount: snapshot.walletDeposit,
                        walletDeposit: snapshot.walletDeposit,
                        changeGiven: snapshot.changeGiven,
                        amountApplied: snapshot.amountApplied,
                        amountRetained: snapshot.amountRetained,
                        calculationVersion: snapshot.calculationVersion
                    };

                    await customerPaymentsStore.put(custPayment);
                    tempPayments.push(custPayment);
                }

                // 6. Mirror POS payments to Banking accounts (if linked)
                const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                let bankTransactions = await bankTransactionsStore.getAll();

                const recordBankDeposit = async (
                    amount: number,
                    method: string,
                    accountId: string | undefined,
                    reference: string,
                    description: string
                ) => {
                    if (!amount || amount <= 0) return;
                    const bankAccount = resolveBankAccountForPayment(bankAccounts, {
                        accountId,
                        paymentMethod: method
                    });
                    if (!bankAccount) return;

                    const existing = bankTransactions.find(tx =>
                        tx.bankAccountId === bankAccount.id &&
                        tx.reference === reference &&
                        tx.type === 'Deposit'
                    );
                    if (existing) return;

                    const bankTx: BankTransaction = {
                        id: generateNextId('TXN', bankTransactions),
                        date: sale.date,
                        amount: amount,
                        type: 'Deposit',
                        description,
                        reference,
                        bankAccountId: bankAccount.id,
                        counterparty: sale.customerName ? { name: sale.customerName } : undefined,
                        category: 'Income',
                        reconciled: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    await bankTransactionsStore.put(bankTx);
                    bankTransactions = [...bankTransactions, bankTx];

                    const nextBalance = calculateBankBalance(bankTransactions, bankAccount.id);
                    await bankAccountsStore.put({
                        ...bankAccount,
                        balance: roundToCurrency(nextBalance),
                        availableBalance: roundToCurrency(nextBalance),
                        updatedAt: new Date().toISOString()
                    });
                };

                for (const payment of normalizedPayments) {
                    if (payment.method === 'Wallet' || payment.method === 'Loyalty' || payment.method === 'Credit') continue;
                    await recordBankDeposit(
                        Number(payment.retained || 0),
                        payment.method,
                        payment.accountId,
                        payment.reference,
                        payment.description
                    );
                }

                // Create Invoice record for POS sales to appear in general invoice list
                const invoicePaid = Math.max(0, Math.min(totalRetained, saleTotal));
                const invoiceStatus: Invoice['status'] =
                    invoicePaid >= saleTotal ? 'Paid' : (invoicePaid > 0 ? 'Partial' : 'Unpaid');
                const existingInvoices = await invoicesStore.getAll();
                const hasInvoiceIdConflict = existingInvoices.some(
                    (existing: any) => String(existing?.id || '') === String(sale.id)
                );
                let invoiceId = hasInvoiceIdConflict ? '' : String(sale.id);
                if (!hasInvoiceIdConflict) {
                    try {
                        assertInvoiceNumberFormat(invoiceId, getCompanyConfig(), 'invoice');
                    } catch {
                        invoiceId = '';
                    }
                }
                if (!invoiceId) {
                    // Avoid nested/non-transactional async work inside an active IDB transaction.
                    // Calling document-number service here can commit this tx early, causing
                    // "TransactionInactiveError: The transaction has finished" on later puts.
                    invoiceId = generateNextId('INV', existingInvoices as any[]);
                }

                const invoice: Invoice = {
                    id: invoiceId,
                    date: sale.date,
                    dueDate: sale.date, // POS sales are immediate, due immediately
                    customerId: sale.customerId,
                    customerName: sale.customerName || 'Walk-in Customer',
                    totalAmount: sale.totalAmount,
                    paidAmount: invoicePaid,
                    status: invoiceStatus,
                    items: sale.items,
                    subAccountName: sale.subAccountName,
                    notes: `POS Sale - Source: ${sale.source || 'POS'}`,
                    reference: sale.id,
                    warehouseId: sale.warehouseId,
                    originalPrice: sale.originalPrice,
                    roundedPrice: sale.roundedPrice,
                    roundingDifference: sale.roundingDifference,
                    roundingMethod: sale.roundingMethod,
                    applyRounding: sale.applyRounding,
                    adjustmentTotal: sale.adjustmentTotal,
                    adjustmentSnapshots: sale.adjustmentSnapshots,
                    consumptionSnapshots: sale.consumptionSnapshots,
                    isPriceLocked: sale.isPriceLocked,
                    transactionAdjustments: sale.transactionAdjustments,
                    adjustmentSummary: sale.adjustmentSummary
                };
                await invoicesStore.put(invoice);

                return { success: true, id: sale.id };
            }
        );
    },

    async deleteSalesExchange(id: string) {
        // Enforce "No deletion" policy by converting delete to cancel if it's pending, 
        // or just blocking it if it's already processed.
        return dbService.executeAtomicOperation(
            ['salesExchanges'],
            async (tx) => {
                const store = tx.objectStore('salesExchanges');
                const exchange = await store.get(id);
                if (!exchange) throw new Error("Exchange not found");

                if (exchange.status === 'Approved' || exchange.status === 'Completed') {
                    throw new Error("Cannot delete/cancel an exchange that has already been approved or completed.");
                }

                exchange.status = 'Cancelled';
                await store.put(exchange);
            }
        );
    },

    async cancelSalesExchange(id: string, reason: string = "Cancelled by user") {
        return dbService.executeAtomicOperation(
            ['salesExchanges'],
            async (tx) => {
                const store = tx.objectStore('salesExchanges');
                const exchange = await store.get(id);
                if (!exchange) throw new Error("Exchange not found");

                if (exchange.status === 'Approved' || exchange.status === 'Completed' || exchange.status === 'approved' || exchange.status === 'completed') {
                    throw new Error("Cannot cancel an exchange that has already been approved or completed.");
                }

                exchange.status = 'Cancelled';
                exchange.cancel_reason = reason;
                exchange.cancelled_at = new Date().toISOString();
                await store.put(exchange);
            }
        );
    },

    async bulkCancelSalesExchanges(ids: string[], reason: string = "Bulk cancelled by user") {
        return dbService.executeAtomicOperation(
            ['salesExchanges'],
            async (tx) => {
                const store = tx.objectStore('salesExchanges');
                const results = { cancelled: 0, failed: 0, errors: [] as string[] };

                for (const id of ids) {
                    try {
                        const exchange = await store.get(id);
                        if (!exchange) {
                            results.failed++;
                            results.errors.push(`Exchange ${id} not found`);
                            continue;
                        }

                        if (exchange.status === 'Approved' || exchange.status === 'Completed' || exchange.status === 'approved' || exchange.status === 'completed') {
                            results.failed++;
                            results.errors.push(`Exchange ${id} already processed`);
                            continue;
                        }

                        exchange.status = 'Cancelled';
                        exchange.cancel_reason = reason;
                        exchange.cancelled_at = new Date().toISOString();
                        await store.put(exchange);
                        results.cancelled++;
                    } catch (err: any) {
                        results.failed++;
                        results.errors.push(`Error cancelling ${id}: ${err.message}`);
                    }
                }
                return results;
            }
        );
    },

    async processRefund(refund: any) {
        return dbService.executeAtomicOperation(
            ['sales', 'inventory', 'ledger', 'customers', 'vatTransactions'],
            async (tx) => {
                const salesStore = tx.objectStore('sales');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const vatStore = tx.objectStore('vatTransactions');

                // 1. Save refund record (using sales store for now)
                await salesStore.put(refund);

                // 2. Return to inventory
                for (const item of refund.items) {
                    if (item.type !== 'Service') {
                        const targetItemId = item.itemId || item.id;
                        if (!targetItemId) continue;
                        const invItem = await inventoryStore.get(targetItemId);
                        if (invItem) {
                            invItem.stock = (invItem.stock || 0) + item.quantity;
                            await inventoryStore.put(invItem);
                        }
                    }
                }

                const refundCogsTotal = await calculateItemsCost(
                    refund.items || [],
                    inventoryStore,
                    (item) => item.itemId || item.id
                );

                if (refundCogsTotal > 0) {
                    const gl = getGLConfig();
                    const cogsReversal: LedgerEntry = {
                        id: `LG-COGS-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: refund.date,
                        description: `COGS Reversal - Refund #${refund.saleId || refund.id}`,
                        debitAccountId: gl.defaultInventoryAccount,
                        creditAccountId: gl.defaultCOGSAccount,
                        amount: Number(refundCogsTotal.toFixed(2)),
                        referenceId: refund.id,
                        reconciled: false,
                        customerId: refund.customerId,
                        customerName: refund.customerName
                    };
                    await ledgerStore.put(cogsReversal);
                }

                // 3. Update Customer Balance if applicable
                if (refund.customerId) {
                    const customer = await customerStore.get(refund.customerId);
                    if (customer) {
                        customer.balance = (customer.balance || 0) - refund.totalAmount;
                        await customerStore.put(customer);
                    }
                }

                // 4. Ledger Entry for Refund
                const gl = getGLConfig();
                const vatConfig = getVatConfig();
                const totalAmount = Number(refund.totalAmount || refund.refundAmount || 0);

                let targetCreditAccount = gl.cashDrawerAccount;
                if (refund.accountId) {
                    targetCreditAccount = refund.accountId;
                } else if (refund.refundMethod === 'Mobile Money') {
                    targetCreditAccount = gl.mobileMoneyAccount;
                } else if (refund.refundMethod === 'Bank Transfer' || refund.refundMethod === 'Card') {
                    targetCreditAccount = gl.bankAccount;
                }

                let revenueReturnAmount = totalAmount;
                let taxReturnAmount = 0;
                let marketAdjustmentReturnAmount = 0; // Need to fetch original sale to know this, but for now assuming proportional if not stored

                // If we can fetch the original sale, we should reverse VAT and Market Adjustments proportionally
                if (refund.saleId) {
                    const originalSale = await salesStore.get(refund.saleId);
                    if (originalSale) {
                        const originalTotal = originalSale.totalAmount;
                        const ratio = totalAmount / originalTotal;

                        const adjustmentTotal = originalSale.adjustmentTotal || originalSale.marketAdjustmentApplied || 0;
                        if (adjustmentTotal > 0) {
                            marketAdjustmentReturnAmount = adjustmentTotal * ratio;
                            revenueReturnAmount -= marketAdjustmentReturnAmount;
                        }

                        // VAT Reversal
                        if (vatConfig?.enabled && vatConfig.outputTaxAccount) {
                            const rate = vatConfig.rate || 17.5;
                            // Calculate tax component of the refund amount
                            taxReturnAmount = totalAmount - (totalAmount / (1 + rate / 100));
                            revenueReturnAmount -= taxReturnAmount;

                            // Create Negative VAT Transaction (Input/Credit Note)
                            const vatTx: VatTransaction = {
                                id: `VAT-REF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                date: refund.date,
                                type: 'Input', // Treated as Input to reduce liability, or negative Output
                                amount: Number(taxReturnAmount.toFixed(2)),
                                taxableAmount: Number(revenueReturnAmount.toFixed(2)),
                                rate: rate,
                                referenceId: refund.id,
                                referenceType: 'Invoice', // Credit Note
                                description: `VAT Reversal - Refund #${refund.id} for Sale #${refund.saleId}`,
                                isFiled: false,
                                customerName: refund.customerName
                            };
                            await vatStore.put(vatTx);

                            // Debit VAT Account (Reduce Liability)
                            const taxEntry: LedgerEntry = {
                                id: `LG-TAX-REF-${Date.now()}`,
                                date: refund.date,
                                description: `VAT Reversal - Refund #${refund.id}`,
                                debitAccountId: vatConfig.outputTaxAccount,
                                creditAccountId: targetCreditAccount,
                                amount: Number(taxReturnAmount.toFixed(2)),
                                referenceId: refund.id,
                                reconciled: false,
                                customerId: refund.customerId,
                                customerName: refund.customerName
                            };
                            await ledgerStore.put(taxEntry);
                        }

                        // Market Adjustment Reversal
                        if (marketAdjustmentReturnAmount > 0 && vatConfig?.marketAdjustmentAccount) {
                            const marketEntry: LedgerEntry = {
                                id: `LG-MKT-REF-${Date.now()}`,
                                date: refund.date,
                                description: `Market Adjustment Reversal - Refund #${refund.id}`,
                                debitAccountId: vatConfig.marketAdjustmentAccount,
                                creditAccountId: targetCreditAccount,
                                amount: Number(marketAdjustmentReturnAmount.toFixed(2)),
                                referenceId: refund.id,
                                reconciled: false,
                                customerId: refund.customerId,
                                customerName: refund.customerName
                            };
                            await ledgerStore.put(marketEntry);
                        }
                    }
                }

                // Debit Revenue Return (Net Amount)
                const revenueReturnEntry: LedgerEntry = {
                    id: `LG-REF-REV-${Date.now()}`,
                    date: refund.date,
                    description: `Refund Revenue Return - Sale #${refund.saleId || refund.id}`,
                    debitAccountId: gl.salesReturnAccount || gl.defaultSalesAccount,
                    creditAccountId: targetCreditAccount,
                    amount: Number(revenueReturnAmount.toFixed(2)),
                    referenceId: refund.id,
                    reconciled: false,
                    customerId: refund.customerId,
                    customerName: refund.customerName
                };
                await ledgerStore.put(revenueReturnEntry);

                return { success: true };
            }
        );
    },

    async processQuotation(quotation: any) {
        return dbService.executeAtomicOperation(
            ['quotations'],
            async (tx) => {
                const store = tx.objectStore('quotations');
                const issuedDate = quotation.date || new Date().toISOString();
                const quotationPaymentTerms = 'Net 7';
                const quotationDueDate = calculateDueDate(issuedDate, quotationPaymentTerms);
                quotation.date = issuedDate;
                quotation.paymentTerms = quotationPaymentTerms;
                quotation.dueDate = quotationDueDate;
                quotation.validUntil = quotationDueDate;
                await store.put(quotation);
                return { success: true };
            }
        );
    },

    async approveQuotation(id: string) {
        return dbService.executeAtomicOperation(
            ['quotations'],
            async (tx) => {
                const store = tx.objectStore('quotations');
                const quotation = await store.get(id);
                if (!quotation) throw new Error("Quotation not found");
                quotation.status = 'Approved';
                quotation.isPriceLocked = true; // Lock price once approved
                await store.put(quotation);
                return { success: true };
            }
        );
    },

    async processQuotationRevision(originalId: string, revision: any) {
        return dbService.executeAtomicOperation(
            ['quotations'],
            async (tx) => {
                const store = tx.objectStore('quotations');

                // Update original quotation status
                const original = await store.get(originalId);
                if (original) {
                    original.status = 'Revised';
                    await store.put(original);
                }

                // Save new revision
                await store.put(revision);
                return { success: true };
            }
        );
    },

    async processRecurringInvoice(invoice: Invoice, subId: string, updatedSub: any) {
        return dbService.executeAtomicOperation(
            ['invoices', 'subscriptions', 'ledger', 'customers', 'inventory', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'customerPayments', 'bankAccounts', 'bankTransactions'],
            async (tx) => {
                const invoiceStore = tx.objectStore('invoices');
                const subStore = tx.objectStore('subscriptions' as any); // cast as any if store name differs
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const inventoryStore = tx.objectStore('inventory');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');
                const customerPaymentsStore = tx.objectStore('customerPayments');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                // Pre-fetch data for adjustment processing
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                // Enforce invoice terms policy before persistence.
                const issuedDate = invoice.date || new Date().toISOString();
                invoice.date = issuedDate;
                let effectivePaymentTerms = String(invoice.paymentTerms || '').trim();
                if (!effectivePaymentTerms && invoice.customerId) {
                    const customer = await customerStore.get(invoice.customerId);
                    if (customer) {
                        effectivePaymentTerms = resolveCustomerPaymentTerms({
                            customer,
                            subAccountName: invoice.subAccountName,
                            transactionType: 'invoice',
                            preserveCustomTerms: true
                        });
                    }
                }

                if (effectivePaymentTerms) {
                    invoice.paymentTerms = effectivePaymentTerms;
                    invoice.dueDate = calculateDueDate(issuedDate, effectivePaymentTerms);
                } else if (!invoice.dueDate) {
                    invoice.dueDate = issuedDate;
                }

                assertInvoiceNumberFormat(invoice.id, getCompanyConfig(), 'invoice');

                // 1. Save Invoice
                await invoiceStore.put(invoice);

                // 2. Update Subscription
                await subStore.put(updatedSub);

                // 3. Update Inventory (Gated)
                const shouldDeduct = updatedSub.status === 'Active'; // For recurring, we deduct if the sub is active when firing
                if (shouldDeduct) {
                    await this._executeDeductInventory(inventoryStore, invoice.items, invoice.consumptionSnapshots || []);
                }

                // 4. Process Market Adjustments using shared helper
                const adjustmentResult = await this._processMarketAdjustments(
                    invoice.items,
                    inventory,
                    bomTemplates,
                    marketAdjustments,
                    invoice.id,
                    'invoice',
                    inventoryStore
                );

                // Store adjustment data on invoice
                invoice.adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                    ? adjustmentResult.adjustmentSnapshots
                    : invoice.adjustmentSnapshots;
                invoice.adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                    ? adjustmentResult.adjustmentTotal
                    : invoice.adjustmentTotal;
                invoice.transactionAdjustments = adjustmentResult.adjustmentTransactions;
                invoice.adjustmentSummary = adjustmentResult.adjustmentSummary;

                // Backward compatibility: store profitAdjustment from snapshots on invoice
                try {
                    const profitInv = extractProfitMargin(invoice as any);
                    (invoice as any).profitAdjustment = profitInv;
                } catch (e) {
                    // ignore
                }

                // Save adjustment transactions to the store
                for (const adjTx of adjustmentResult.adjustmentTransactions) {
                    await marketAdjustmentTransactionsStore.put(adjTx);
                }

                // Normalize paid amount and status before final save
                const totalAmount = Number(invoice.totalAmount || 0);
                const rawPaidAmount = Number(invoice.paidAmount || 0);
                const paidAmount = Math.max(0, Math.min(rawPaidAmount, totalAmount));
                invoice.paidAmount = paidAmount;

                if (invoice.status !== 'Draft' && invoice.status !== 'Cancelled') {
                    if (paidAmount >= totalAmount && totalAmount > 0) {
                        invoice.status = 'Paid';
                    } else if (paidAmount > 0) {
                        invoice.status = 'Partial';
                    } else if (invoice.status === 'Paid' || invoice.status === 'Partial') {
                        invoice.status = 'Unpaid';
                    }
                }

                // Update invoice with adjustment data
                await invoiceStore.put(invoice);

                // 5. Update Customer Balance (only outstanding amount)
                if (invoice.customerId) {
                    const customer = await customerStore.get(invoice.customerId);
                    if (customer) {
                        const outstanding = Math.max(0, totalAmount - paidAmount);
                        customer.balance = (customer.balance || 0) + outstanding;
                        await customerStore.put(customer);
                    }
                }

                // 6. Ledger Entry
                const gl = getGLConfig();

                // Debit AR
                const arEntry: LedgerEntry = {
                    id: `LG-REC-AR-${Date.now()}`,
                    date: invoice.date,
                    description: `Recurring Invoice #${invoice.id}`,
                    debitAccountId: gl.accountsReceivable,
                    creditAccountId: gl.defaultSalesAccount,
                    amount: totalAmount,
                    referenceId: invoice.id,
                    reconciled: false,
                    customerId: invoice.customerId,
                    customerName: invoice.customerName
                };
                await ledgerStore.put(arEntry);

                // 7. If invoice is paid/partially paid on creation, create payment records
                if (paidAmount > 0) {
                    const allPayments = await customerPaymentsStore.getAll();
                    const paymentId = generateNextId('RCPT', allPayments);
                    const paymentMethod = (invoice as any).paymentMethod || (invoice as any).payment_method || 'Bank Transfer';
                    const paymentAccountId = (invoice as any).accountId;
                    const snapshot = calculateCustomerPaymentSnapshot({
                        amountTendered: paidAmount,
                        appliedInvoices: [{
                            invoiceId: invoice.id,
                            allocationAmount: paidAmount,
                            outstandingAmount: paidAmount
                        }],
                        paymentPurpose: 'INVOICE_PAYMENT',
                        paymentDate: invoice.date,
                        customerName: invoice.customerName
                    });

                    const custPayment: CustomerPayment = {
                        id: paymentId,
                        date: invoice.date,
                        customerId: invoice.customerId || invoice.customerName,
                        customerName: invoice.customerName,
                        amount: paidAmount,
                        paymentMethod,
                        accountId: paymentAccountId,
                        reference: invoice.id,
                        notes: `Recurring invoice payment for #${invoice.id}`,
                        allocations: [{ invoiceId: invoice.id, amount: paidAmount }],
                        status: 'Cleared',
                        reconciled: false,
                        receiptSnapshot: snapshot,
                        invoiceTotal: snapshot.invoiceTotalAtPosting,
                        paymentStatus: snapshot.paymentStatus,
                        balanceDue: snapshot.balanceDueAfterPayment,
                        overpaymentAmount: snapshot.walletDeposit,
                        walletDeposit: snapshot.walletDeposit,
                        changeGiven: snapshot.changeGiven,
                        amountApplied: snapshot.amountApplied,
                        amountRetained: snapshot.amountRetained,
                        calculationVersion: snapshot.calculationVersion
                    };
                    await customerPaymentsStore.put(custPayment);

                    let targetDebitAccount = gl.bankAccount;
                    if (paymentAccountId) {
                        targetDebitAccount = paymentAccountId;
                    } else {
                        if (paymentMethod === 'Cash') targetDebitAccount = gl.cashDrawerAccount;
                        if (paymentMethod === 'Mobile Money') targetDebitAccount = gl.mobileMoneyAccount;
                        if (paymentMethod === 'Wallet') targetDebitAccount = gl.customerWalletAccount;
                    }

                    const payEntry: LedgerEntry = {
                        id: `LG-REC-PAY-${Date.now()}`,
                        date: invoice.date,
                        description: `Payment for Recurring Invoice #${invoice.id}`,
                        debitAccountId: targetDebitAccount,
                        creditAccountId: gl.accountsReceivable,
                        amount: paidAmount,
                        referenceId: paymentId,
                        reconciled: false,
                        customerId: invoice.customerId,
                        customerName: invoice.customerName
                    };
                    await ledgerStore.put(payEntry);

                    const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                    let bankTransactions = await bankTransactionsStore.getAll();
                    const bankAccount = resolveBankAccountForPayment(bankAccounts, {
                        accountId: paymentAccountId,
                        paymentMethod
                    });
                    if (bankAccount) {
                        const reference = `REC-${invoice.id}-${paymentId}`;
                        const existing = bankTransactions.find(tx =>
                            tx.bankAccountId === bankAccount.id &&
                            tx.reference === reference &&
                            tx.type === 'Deposit'
                        );

                        if (!existing) {
                            const bankTx: BankTransaction = {
                                id: generateNextId('TXN', bankTransactions),
                                date: invoice.date,
                                amount: paidAmount,
                                type: 'Deposit',
                                description: `Recurring Invoice Payment #${invoice.id}`,
                                reference,
                                bankAccountId: bankAccount.id,
                                counterparty: invoice.customerName ? { name: invoice.customerName } : undefined,
                                category: 'Income',
                                reconciled: false,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                            await bankTransactionsStore.put(bankTx);
                            bankTransactions = [...bankTransactions, bankTx];

                            const nextBalance = calculateBankBalance(bankTransactions, bankAccount.id);
                            await bankAccountsStore.put({
                                ...bankAccount,
                                balance: roundToCurrency(nextBalance),
                                availableBalance: roundToCurrency(nextBalance),
                                updatedAt: new Date().toISOString()
                            });
                        }
                    }
                }

                return { success: true };
            }
        );
    },

    async updateSale(sale: Sale) {
        return dbService.executeAtomicOperation(
            ['sales'],
            async (tx) => {
                const store = tx.objectStore('sales');
                await store.put(sale);
                return { success: true };
            }
        );
    },

    async updateCustomerPayment(payment: CustomerPayment) {
        return dbService.executeAtomicOperation(
            ['customerPayments'],
            async (tx) => {
                const store = tx.objectStore('customerPayments');
                const existing = await store.get(payment.id);
                if (!existing) throw new Error('Payment not found');

                const hasFinancialMutation =
                    Number(existing.amount || 0) !== Number(payment.amount || 0) ||
                    (existing.customerId || '') !== (payment.customerId || '') ||
                    (existing.paymentMethod || '') !== (payment.paymentMethod || '') ||
                    (existing.accountId || '') !== (payment.accountId || '') ||
                    (existing.excessHandling || '') !== (payment.excessHandling || '') ||
                    JSON.stringify(existing.allocations || []) !== JSON.stringify(payment.allocations || []);

                if (hasFinancialMutation) {
                    throw new Error(
                        'Financial fields are immutable after posting. Void and re-post payment for financial corrections.'
                    );
                }

                const metadataOnlyUpdate: CustomerPayment = {
                    ...existing,
                    reference: payment.reference,
                    notes: payment.notes,
                    status: payment.status,
                    reconciled: payment.reconciled,
                    bankCharges: payment.bankCharges,
                    subAccountName: payment.subAccountName
                };

                await store.put(metadataOnlyUpdate);
                return { success: true };
            }
        );
    },

    async postJournalEntry(entries: Omit<LedgerEntry, 'id' | 'date'>[]) {
        return dbService.executeAtomicOperation(
            ['ledger'],
            async (tx) => {
                const store = tx.objectStore('ledger');
                const date = new Date().toISOString();

                for (const entry of entries) {
                    const newEntry: LedgerEntry = {
                        ...entry,
                        id: `LG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date,
                        reconciled: entry.reconciled || false
                    };
                    await store.put(newEntry);
                }
                return { success: true };
            }
        );
    },

    async processInvoice(invoice: Invoice, performedBy?: string) {
        return dbService.executeAtomicOperation(
            ['invoices', 'inventory', 'ledger', 'customers', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'customerPayments', 'bankAccounts', 'bankTransactions', 'inventoryTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'invoice', invoice.id, (invoice as any).idempotencyKey);

                const invoiceStore = tx.objectStore('invoices');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');
                const customerPaymentsStore = tx.objectStore('customerPayments');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');
                const inventoryTransactionsStore = tx.objectStore('inventoryTransactions');

                // Pre-fetch data for adjustment processing
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                const issuedDate = invoice.date || new Date().toISOString();
                invoice.date = issuedDate;
                let effectivePaymentTerms = String(invoice.paymentTerms || '').trim();
                if (!effectivePaymentTerms && invoice.customerId) {
                    const customer = await customerStore.get(invoice.customerId);
                    if (customer) {
                        effectivePaymentTerms = resolveCustomerPaymentTerms({
                            customer,
                            subAccountName: invoice.subAccountName,
                            transactionType: 'invoice',
                            preserveCustomTerms: true
                        });
                    }
                }

                if (effectivePaymentTerms) {
                    invoice.paymentTerms = effectivePaymentTerms;
                    invoice.dueDate = calculateDueDate(issuedDate, effectivePaymentTerms);
                } else if (!invoice.dueDate) {
                    invoice.dueDate = issuedDate;
                }

                assertInvoiceNumberFormat(invoice.id, getCompanyConfig(), 'invoice');

                // 1. Save Invoice
                await invoiceStore.put(invoice);

                // 2. Update Inventory (Gated)
                const shouldDeduct = invoice.status === 'Paid' || invoice.status === 'Partial' || invoice.status === 'Unpaid'; // Unpaid in Invoice terms is 'Posted'
                if (shouldDeduct) {
                    await this._executeDeductInventory(
                        inventoryStore,
                        inventoryTransactionsStore,
                        invoice.items,
                        invoice.consumptionSnapshots || [],
                        'Invoice',
                        invoice.id,
                        performedBy || 'System',
                        inventory
                    );
                }

                // 3. Process Market Adjustments using shared helper
                const adjustmentResult = await this._processMarketAdjustments(
                    invoice.items,
                    inventory,
                    bomTemplates,
                    marketAdjustments,
                    invoice.id,
                    'invoice',
                    inventoryStore
                );

                // Store adjustment data on invoice
                invoice.adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                    ? adjustmentResult.adjustmentSnapshots
                    : invoice.adjustmentSnapshots;
                invoice.adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                    ? adjustmentResult.adjustmentTotal
                    : invoice.adjustmentTotal;
                invoice.transactionAdjustments = adjustmentResult.adjustmentTransactions;
                invoice.adjustmentSummary = adjustmentResult.adjustmentSummary;

                // Save adjustment transactions to the store
                for (const adjTx of adjustmentResult.adjustmentTransactions) {
                    await marketAdjustmentTransactionsStore.put(adjTx);
                }

                // Normalize paid amount and status before final save
                const totalAmount = Number(invoice.totalAmount || 0);
                const rawPaidAmount = Number(invoice.paidAmount || 0);
                const paidAmount = Math.max(0, Math.min(rawPaidAmount, totalAmount));
                invoice.paidAmount = paidAmount;

                if (invoice.status !== 'Draft' && invoice.status !== 'Cancelled') {
                    if (paidAmount >= totalAmount && totalAmount > 0) {
                        invoice.status = 'Paid';
                    } else if (paidAmount > 0) {
                        invoice.status = 'Partial';
                    } else if (invoice.status === 'Paid' || invoice.status === 'Partial') {
                        invoice.status = 'Unpaid';
                    }
                }

                // Update invoice with adjustment data
                await invoiceStore.put(invoice);

                if (shouldDeduct) {
                    const cogsTotal = await calculateItemsCost(
                        invoice.items || [],
                        inventory,
                        (item) => item.parentId || item.id
                    );
                    if (cogsTotal > 0) {
                        const gl = getGLConfig();
                        const cogsEntry: LedgerEntry = {
                            id: `LG-COGS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: invoice.date,
                            description: `COGS - Invoice #${invoice.id}`,
                            debitAccountId: gl.defaultCOGSAccount,
                            creditAccountId: gl.defaultInventoryAccount,
                            amount: Number(cogsTotal.toFixed(2)),
                            referenceId: invoice.id,
                            reconciled: false,
                            customerId: invoice.customerId,
                            customerName: invoice.customerName
                        };
                        await ledgerStore.put(cogsEntry);
                    }
                }

                // 4. Update Customer Balance (only outstanding amount)
                const customer = await customerStore.get(invoice.customerId);
                if (customer) {
                    const outstanding = Math.max(0, totalAmount - paidAmount);
                    customer.balance = (customer.balance || 0) + outstanding;
                    await customerStore.put(customer);
                }

                // 5. Create Ledger Entry
                const gl = getGLConfig();

                // Debit AR
                const arEntry: LedgerEntry = {
                    id: `LG-INV-AR-${Date.now()}`,
                    date: invoice.date,
                    description: `Invoice #${invoice.id}`,
                    debitAccountId: gl.accountsReceivable,
                    creditAccountId: gl.defaultSalesAccount,
                    amount: totalAmount,
                    referenceId: invoice.id,
                    reconciled: false,
                    customerId: invoice.customerId,
                    customerName: invoice.customerName
                };
                await ledgerStore.put(arEntry);

                // 6. If invoice is paid/partially paid on creation, create payment records
                if (paidAmount > 0) {
                    const allPayments = await customerPaymentsStore.getAll();
                    const paymentId = generateNextId('RCPT', allPayments);
                    const paymentMethod = (invoice as any).paymentMethod || (invoice as any).payment_method || 'Cash';
                    const paymentAccountId = (invoice as any).accountId;
                    const snapshot = calculateCustomerPaymentSnapshot({
                        amountTendered: paidAmount,
                        appliedInvoices: [{
                            invoiceId: invoice.id,
                            allocationAmount: paidAmount,
                            outstandingAmount: paidAmount
                        }],
                        paymentPurpose: 'INVOICE_PAYMENT',
                        paymentDate: invoice.date,
                        customerName: invoice.customerName
                    });

                    const custPayment: CustomerPayment = {
                        id: paymentId,
                        date: invoice.date,
                        customerId: invoice.customerId || invoice.customerName,
                        customerName: invoice.customerName,
                        amount: paidAmount,
                        paymentMethod,
                        accountId: paymentAccountId,
                        reference: invoice.id,
                        notes: `Invoice payment for #${invoice.id}`,
                        allocations: [{ invoiceId: invoice.id, amount: paidAmount }],
                        status: 'Cleared',
                        reconciled: false,
                        receiptSnapshot: snapshot,
                        invoiceTotal: snapshot.invoiceTotalAtPosting,
                        paymentStatus: snapshot.paymentStatus,
                        balanceDue: snapshot.balanceDueAfterPayment,
                        overpaymentAmount: snapshot.walletDeposit,
                        walletDeposit: snapshot.walletDeposit,
                        changeGiven: snapshot.changeGiven,
                        amountApplied: snapshot.amountApplied,
                        amountRetained: snapshot.amountRetained,
                        calculationVersion: snapshot.calculationVersion
                    };
                    await customerPaymentsStore.put(custPayment);

                    let targetDebitAccount = gl.cashDrawerAccount;
                    if (paymentAccountId) {
                        targetDebitAccount = paymentAccountId;
                    } else {
                        if (paymentMethod === 'Card' || paymentMethod === 'Bank Transfer') targetDebitAccount = gl.bankAccount;
                        if (paymentMethod === 'Mobile Money') targetDebitAccount = gl.mobileMoneyAccount;
                        if (paymentMethod === 'Wallet') targetDebitAccount = gl.customerWalletAccount;
                    }

                    const payEntry: LedgerEntry = {
                        id: `LG-INV-PAY-${Date.now()}`,
                        date: invoice.date,
                        description: `Payment for Invoice #${invoice.id}`,
                        debitAccountId: targetDebitAccount,
                        creditAccountId: gl.accountsReceivable,
                        amount: paidAmount,
                        referenceId: paymentId,
                        reconciled: false,
                        customerId: invoice.customerId,
                        customerName: invoice.customerName
                    };
                    await ledgerStore.put(payEntry);

                    const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                    let bankTransactions = await bankTransactionsStore.getAll();
                    const bankAccount = resolveBankAccountForPayment(bankAccounts, {
                        accountId: paymentAccountId,
                        paymentMethod
                    });
                    if (bankAccount) {
                        const reference = `INV-${invoice.id}-${paymentId}`;
                        const existing = bankTransactions.find(tx =>
                            tx.bankAccountId === bankAccount.id &&
                            tx.reference === reference &&
                            tx.type === 'Deposit'
                        );

                        if (!existing) {
                            const bankTx: BankTransaction = {
                                id: generateNextId('TXN', bankTransactions),
                                date: invoice.date,
                                amount: paidAmount,
                                type: 'Deposit',
                                description: `Invoice Payment #${invoice.id}`,
                                reference,
                                bankAccountId: bankAccount.id,
                                counterparty: invoice.customerName ? { name: invoice.customerName } : undefined,
                                category: 'Income',
                                reconciled: false,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                            await bankTransactionsStore.put(bankTx);
                            bankTransactions = [...bankTransactions, bankTx];

                            const nextBalance = calculateBankBalance(bankTransactions, bankAccount.id);
                            await bankAccountsStore.put({
                                ...bankAccount,
                                balance: roundToCurrency(nextBalance),
                                availableBalance: roundToCurrency(nextBalance),
                                updatedAt: new Date().toISOString()
                            });
                        }
                    }
                }

                return { success: true, id: invoice.id };
            }
        );
    },

    async convertQuotationToInvoice(quotationId: string, invoiceData: Invoice) {
        return dbService.executeAtomicOperation(
            ['quotations', 'invoices', 'inventory', 'ledger', 'customers', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'inventoryTransactions'],
            async (tx) => {
                const quotationStore = tx.objectStore('quotations');
                const invoiceStore = tx.objectStore('invoices');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');
                const inventoryTransactionsStore = tx.objectStore('inventoryTransactions');

                // Pre-fetch data for adjustment processing
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                // 1. Update Quotation status
                const quotation = await quotationStore.get(quotationId);
                if (!quotation) throw new Error("Quotation not found");
                quotation.status = 'Converted';
                quotation.isPriceLocked = true; // Lock price on conversion

                // Add conversion note to quotation
                const timestamp = new Date().toLocaleString();
                const conversionNote = `Converted to [Invoice] #[${invoiceData.id}] on [${timestamp}] and price locked.`;
                quotation.notes = quotation.notes ? `${quotation.notes}\n${conversionNote}` : conversionNote;

                await quotationStore.put(quotation);

                // 2. Save Invoice
                invoiceData.isPriceLocked = true; // Ensure invoice price is locked
                (invoiceData as any).isConverted = true;
                (invoiceData as any).quotationId = quotation.id;
                (invoiceData as any).conversionDetails = {
                    sourceType: 'Quotation',
                    sourceNumber: quotation.id,
                    date: timestamp,
                    acceptedBy: quotation.customerName || invoiceData.customerName || 'System'
                };
                // Add conversion note to invoice
                invoiceData.notes = invoiceData.notes ?
                    `${invoiceData.notes}\nConverted from [Quotation] #[${quotationId}] on [${timestamp}] - Price Locked.` :
                    `Converted from [Quotation] #[${quotationId}] on [${timestamp}] - Price Locked.`;
                const issuedDate = invoiceData.date || new Date().toISOString();
                invoiceData.date = issuedDate;
                let effectivePaymentTerms = String(invoiceData.paymentTerms || '').trim();
                if (!effectivePaymentTerms && invoiceData.customerId) {
                    const customer = await customerStore.get(invoiceData.customerId);
                    if (customer) {
                        effectivePaymentTerms = resolveCustomerPaymentTerms({
                            customer,
                            subAccountName: invoiceData.subAccountName,
                            transactionType: 'invoice',
                            preserveCustomTerms: true
                        });
                    }
                }
                if (effectivePaymentTerms) {
                    invoiceData.paymentTerms = effectivePaymentTerms;
                    invoiceData.dueDate = calculateDueDate(issuedDate, effectivePaymentTerms);
                } else if (!invoiceData.dueDate) {
                    invoiceData.dueDate = issuedDate;
                }

                // 3. Update Inventory (Gated)
                // Convert Quotation to Invoice usually implies it's ready for fulfillment or already delivered
                await this._executeDeductInventory(
                    inventoryStore,
                    inventoryTransactionsStore,
                    invoiceData.items,
                    invoiceData.consumptionSnapshots || [],
                    'Invoice',
                    invoiceData.id,
                    'System',
                    inventory
                );

                // 4. Process Market Adjustments using shared helper
                const adjustmentResult = await this._processMarketAdjustments(
                    invoiceData.items,
                    inventory,
                    bomTemplates,
                    marketAdjustments,
                    invoiceData.id,
                    'invoice',
                    inventoryStore
                );

                // Store adjustment data on invoice
                invoiceData.adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                    ? adjustmentResult.adjustmentSnapshots
                    : invoiceData.adjustmentSnapshots;
                invoiceData.adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                    ? adjustmentResult.adjustmentTotal
                    : invoiceData.adjustmentTotal;
                invoiceData.transactionAdjustments = adjustmentResult.adjustmentTransactions;
                invoiceData.adjustmentSummary = adjustmentResult.adjustmentSummary;

                // Save adjustment transactions to the store
                for (const adjTx of adjustmentResult.adjustmentTransactions) {
                    await marketAdjustmentTransactionsStore.put(adjTx);
                }

                await invoiceStore.put(invoiceData);

                const cogsTotal = await calculateItemsCost(
                    invoiceData.items || [],
                    inventory,
                    (item) => item.parentId || item.id
                );
                if (cogsTotal > 0) {
                    const gl = getGLConfig();
                    const cogsEntry: LedgerEntry = {
                        id: `LG-COGS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: invoiceData.date,
                        description: `COGS - Invoice #${invoiceData.id}`,
                        debitAccountId: gl.defaultCOGSAccount,
                        creditAccountId: gl.defaultInventoryAccount,
                        amount: Number(cogsTotal.toFixed(2)),
                        referenceId: invoiceData.id,
                        reconciled: false,
                        customerId: invoiceData.customerId,
                        customerName: invoiceData.customerName
                    };
                    await ledgerStore.put(cogsEntry);
                }

                // 5. Update Customer Balance
                if (invoiceData.customerId) {
                    const customer = await customerStore.get(invoiceData.customerId);
                    if (customer) {
                        customer.balance = (customer.balance || 0) + invoiceData.totalAmount;
                        await customerStore.put(customer);
                    }
                }

                // 6. Create Ledger Entry
                const gl = getGLConfig();
                const totalAmount = Number(invoiceData.totalAmount);

                // Debit AR
                const arEntry: LedgerEntry = {
                    id: `LG-QTN-INV-AR-${Date.now()}`,
                    date: invoiceData.date,
                    description: `Invoice #${invoiceData.id} from QTN #${quotationId}`,
                    debitAccountId: gl.accountsReceivable,
                    creditAccountId: gl.defaultSalesAccount,
                    amount: totalAmount,
                    referenceId: invoiceData.id,
                    reconciled: false,
                    customerId: invoiceData.customerId,
                    customerName: invoiceData.customerName
                };
                await ledgerStore.put(arEntry);

                return { success: true, id: invoiceData.id };
            }
        );
    },

    async convertQuotationToWorkOrder(quotationId: string, workOrderData: WorkOrder) {
        return dbService.executeAtomicOperation(
            ['quotations', 'workOrders'],
            async (tx) => {
                const quotationStore = tx.objectStore('quotations');
                const workOrderStore = tx.objectStore('workOrders');

                // 1. Update Quotation status
                const quotation = await quotationStore.get(quotationId);
                if (!quotation) throw new Error("Quotation not found");
                quotation.status = 'Converted';

                // Add conversion note
                const timestamp = new Date().toLocaleString();
                const conversionNote = `Converted to [WorkOrder] #[${workOrderData.id}] on [${timestamp}] as accepted by [System]`;
                quotation.notes = quotation.notes ? `${quotation.notes}\n${conversionNote}` : conversionNote;

                await quotationStore.put(quotation);

                // 2. Save Work Order
                workOrderData.notes = workOrderData.notes ?
                    `${workOrderData.notes}\nConverted from [Quotation] #[${quotationId}] on [${timestamp}] as accepted by [System]` :
                    `Converted from [Quotation] #[${quotationId}] on [${timestamp}] as accepted by [System]`;
                await workOrderStore.put(workOrderData);

                return { success: true, id: workOrderData.id };
            }
        );
    },

    async convertJobOrderToInvoice(jobOrderId: string, invoiceData: Invoice) {
        return dbService.executeAtomicOperation(
            ['jobOrders', 'invoices', 'inventory', 'ledger', 'customers', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions'],
            async (tx) => {
                const jobOrderStore = tx.objectStore('jobOrders');
                const invoiceStore = tx.objectStore('invoices');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');

                // Pre-fetch data for adjustment processing
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                // 1. Update Job Order status
                const jobOrder = await jobOrderStore.get(jobOrderId);
                if (!jobOrder) throw new Error("Job Order not found");
                jobOrder.status = 'Completed';

                // Add conversion note
                const timestamp = new Date().toLocaleString();
                const conversionNote = `Converted to [Invoice] #[${invoiceData.id}] on [${timestamp}] as accepted by [System]`;
                jobOrder.notes = jobOrder.notes ? `${jobOrder.notes}\n${conversionNote}` : conversionNote;

                await jobOrderStore.put(jobOrder);

                // 2. Save Invoice
                invoiceData.notes = invoiceData.notes ?
                    `${invoiceData.notes}\nConverted from [JobOrder] #[${jobOrderId}] on [${timestamp}] as accepted by [System]` :
                    `Converted from [JobOrder] #[${jobOrderId}] on [${timestamp}] as accepted by [System]`;

                // 3. Update Inventory (if applicable)
                for (const item of invoiceData.items) {
                    const invItem = await resolveInventoryRecord(item.id, inventory, inventoryStore);
                    if (invItem) {
                        invItem.stock = (invItem.stock || 0) - item.quantity;
                        await inventoryStore.put(invItem);
                    }
                }

                // 4. Process Market Adjustments using shared helper
                const adjustmentResult = await this._processMarketAdjustments(
                    invoiceData.items,
                    inventory,
                    bomTemplates,
                    marketAdjustments,
                    invoiceData.id,
                    'invoice',
                    inventoryStore
                );

                // Store adjustment data on invoice
                invoiceData.adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                    ? adjustmentResult.adjustmentSnapshots
                    : invoiceData.adjustmentSnapshots;
                invoiceData.adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                    ? adjustmentResult.adjustmentTotal
                    : invoiceData.adjustmentTotal;
                invoiceData.transactionAdjustments = adjustmentResult.adjustmentTransactions;
                invoiceData.adjustmentSummary = adjustmentResult.adjustmentSummary;

                // Save adjustment transactions to the store
                for (const adjTx of adjustmentResult.adjustmentTransactions) {
                    await marketAdjustmentTransactionsStore.put(adjTx);
                }

                await invoiceStore.put(invoiceData);

                // 5. Update Customer Balance
                if (invoiceData.customerId) {
                    const customer = await customerStore.get(invoiceData.customerId);
                    if (customer) {
                        customer.balance = (customer.balance || 0) + invoiceData.totalAmount;
                        await customerStore.put(customer);
                    }
                }

                // 6. Create Ledger Entry
                const gl = getGLConfig();
                const totalAmount = Number(invoiceData.totalAmount);

                // Debit AR
                const arEntry: LedgerEntry = {
                    id: `LG-JO-INV-AR-${Date.now()}`,
                    date: invoiceData.date,
                    description: `Invoice #${invoiceData.id} (from Job Order #${jobOrderId})`,
                    debitAccountId: gl.accountsReceivable,
                    creditAccountId: gl.defaultSalesAccount,
                    amount: totalAmount,
                    referenceId: invoiceData.id,
                    reconciled: false,
                    customerId: invoiceData.customerId,
                    customerName: invoiceData.customerName
                };
                await ledgerStore.put(arEntry);

                return { success: true, id: invoiceData.id };
            }
        );
    },

    async addCustomerPayment(payment: CustomerPayment) {
        return dbService.executeAtomicOperation(
            ['customerPayments', 'invoices', 'customers', 'ledger', 'walletTransactions', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'customer_payment', payment.id, (payment as any).idempotencyKey);

                const paymentStore = tx.objectStore('customerPayments');
                const invoiceStore = tx.objectStore('invoices');
                const customerStore = tx.objectStore('customers');
                const ledgerStore = tx.objectStore('ledger');
                const walletStore = tx.objectStore('walletTransactions');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const customerId = payment.customerId || '';
                const paymentAmount = toMoney(payment.amount);
                const requestedAllocations = (payment.allocations || []).filter(a => Number(a.amount || 0) > 0);

                // 1. Validate allocations against live outstanding balances.
                const validatedInvoiceAllocations: (CustomerReceiptInvoiceInput & { invoice: Invoice })[] = [];
                for (const allocation of requestedAllocations) {
                    const invoice = await invoiceStore.get(allocation.invoiceId);
                    if (!invoice) {
                        throw new Error(`Cannot allocate payment to missing invoice ${allocation.invoiceId}.`);
                    }

                    const outstanding = toMoney(Math.max(0, (invoice.totalAmount || 0) - (invoice.paidAmount || 0)));
                    const allocationAmount = toMoney(allocation.amount);
                    if (allocationAmount - outstanding > 0.01) {
                        throw new Error(
                            `Allocation for invoice ${allocation.invoiceId} exceeds outstanding balance (${allocationAmount} > ${outstanding}).`
                        );
                    }

                    validatedInvoiceAllocations.push({
                        invoiceId: allocation.invoiceId,
                        allocationAmount,
                        outstandingAmount: outstanding,
                        invoice
                    });
                }

                const totalAllocated = toMoney(
                    validatedInvoiceAllocations.reduce((sum, allocation) => sum + allocation.allocationAmount, 0)
                );
                if (totalAllocated - paymentAmount > 0.01) {
                    throw new Error(
                        `Invalid payment: total allocations (${totalAllocated}) exceed payment amount (${paymentAmount}).`
                    );
                }

                const notes = (payment.notes || '').toLowerCase();
                const paymentPurpose = notes.includes('examination invoice')
                    ? 'EXAM_PAYMENT'
                    : (validatedInvoiceAllocations.length === 0
                        ? (payment.excessHandling === 'Wallet' ? 'WALLET_TOPUP' : 'UNALLOCATED_PAYMENT')
                        : 'INVOICE_PAYMENT');

                // 2. Calculate immutable receipt snapshot for posting-time facts.
                const snapshot = calculateCustomerPaymentSnapshot({
                    amountTendered: paymentAmount,
                    appliedInvoices: validatedInvoiceAllocations.map(allocation => ({
                        invoiceId: allocation.invoiceId,
                        allocationAmount: allocation.allocationAmount,
                        outstandingAmount: allocation.outstandingAmount
                    })),
                    excessHandling: payment.excessHandling,
                    paymentPurpose,
                    paymentDate: payment.date,
                    customerName: payment.customerName
                });

                // 3. Save payment with compatibility fields.
                const auditedPayment: CustomerPayment = {
                    ...payment,
                    customerId,
                    amount: paymentAmount,
                    allocations: validatedInvoiceAllocations.map(allocation => ({
                        invoiceId: allocation.invoiceId,
                        amount: allocation.allocationAmount
                    })),
                    receiptSnapshot: snapshot,
                    invoiceTotal: snapshot.invoiceTotalAtPosting,
                    paymentStatus: snapshot.paymentStatus,
                    balanceDue: snapshot.balanceDueAfterPayment,
                    overpaymentAmount: snapshot.walletDeposit,
                    walletDeposit: snapshot.walletDeposit,
                    changeGiven: snapshot.changeGiven,
                    amountApplied: snapshot.amountApplied,
                    amountRetained: snapshot.amountRetained,
                    excessAmount: snapshot.walletDeposit > 0 ? snapshot.walletDeposit : undefined,
                    calculationVersion: snapshot.calculationVersion
                };
                await paymentStore.put(auditedPayment);

                // 4. Update Invoices
                for (const allocation of validatedInvoiceAllocations) {
                    const invoice = allocation.invoice;
                    invoice.paidAmount = toMoney((invoice.paidAmount || 0) + allocation.allocationAmount);

                    if (invoice.paidAmount >= invoice.totalAmount) {
                        invoice.status = 'Paid';
                    } else if (invoice.paidAmount > 0) {
                        invoice.status = 'Partial';
                    }
                    await invoiceStore.put(invoice);
                }

                // 5. Update Customer Balance
                const customer = customerId ? await customerStore.get(customerId) : null;
                if (customer) {
                    // AR is reduced only by amount applied to invoices.
                    customer.balance = Math.max(0, toMoney((customer.balance || 0) - snapshot.amountApplied));
                    await customerStore.put(customer);
                }

                // 6. Handle wallet only when explicitly selected.
                if (snapshot.walletDeposit > 0 && payment.excessHandling === 'Wallet' && customerId) {
                    const walletTx: WalletTransaction = {
                        id: `WLT-PAY-${Date.now()}`,
                        customerId,
                        amount: snapshot.walletDeposit,
                        type: 'Deposit',
                        date: payment.date,
                        description: `Overpayment from payment ${payment.id}`
                    };
                    await walletStore.put(walletTx);

                    if (customer) {
                        customer.walletBalance = toMoney((customer.walletBalance || 0) + snapshot.walletDeposit);
                        await customerStore.put(customer);
                    }
                }

                // 7. Create Ledger entry for retained cash (ignore pure change-only records).
                const gl = getGLConfig();
                let targetDebitAccount = gl.cashDrawerAccount;

                if (payment.accountId) {
                    targetDebitAccount = payment.accountId;
                } else {
                    if (payment.paymentMethod === 'Card' || payment.paymentMethod === 'Bank Transfer') targetDebitAccount = gl.bankAccount;
                    if (payment.paymentMethod === 'Mobile Money') targetDebitAccount = gl.mobileMoneyAccount;
                    if (payment.paymentMethod === 'Wallet') targetDebitAccount = gl.customerWalletAccount;
                }

                if (snapshot.amountRetained > 0) {
                    const creditAccountId = paymentPurpose === 'WALLET_TOPUP'
                        ? gl.customerDepositAccount
                        : gl.accountsReceivable;

                    const ledgerEntry: LedgerEntry = {
                        id: `LG-PAY-${Date.now()}`,
                        date: payment.date,
                        description: `Payment #${payment.id} from ${payment.customerName} - Status: ${snapshot.paymentStatus}`,
                        debitAccountId: targetDebitAccount,
                        creditAccountId,
                        amount: snapshot.amountRetained,
                        referenceId: payment.id,
                        reconciled: false,
                        customerId: customerId || payment.customerId,
                        customerName: payment.customerName
                    };
                    await ledgerStore.put(ledgerEntry);
                }

                // 8. Mirror to Banking (if a linked bank account exists)
                const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                const bankAccount = resolveBankAccountForPayment(bankAccounts, payment);
                if (bankAccount && snapshot.amountRetained > 0) {
                    const allBankTransactions = await bankTransactionsStore.getAll();
                    const existing = allBankTransactions.find(tx =>
                        tx.bankAccountId === bankAccount.id &&
                        tx.reference === payment.id &&
                        tx.type === 'Deposit'
                    );

                    if (!existing) {
                        const bankTx: BankTransaction = {
                            id: generateNextId('TXN', allBankTransactions),
                            date: payment.date,
                            amount: snapshot.amountRetained,
                            type: 'Deposit',
                            description: `Customer Payment #${payment.id}`,
                            reference: payment.id,
                            bankAccountId: bankAccount.id,
                            counterparty: payment.customerName ? { name: payment.customerName } : undefined,
                            category: 'Income',
                            reconciled: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };

                        await bankTransactionsStore.put(bankTx);

                        const nextBalance = calculateBankBalance(
                            [...allBankTransactions, bankTx],
                            bankAccount.id
                        );

                        await bankAccountsStore.put({
                            ...bankAccount,
                            balance: roundToCurrency(nextBalance),
                            availableBalance: roundToCurrency(nextBalance),
                            updatedAt: new Date().toISOString()
                        });
                    }
                }

                return { success: true };
            }
        );
    },

    async voidCustomerPayment(paymentId: string, reason: string) {
        return dbService.executeAtomicOperation(
            ['customerPayments', 'invoices', 'customers', 'ledger', 'walletTransactions', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'customer_payment_void', paymentId);

                const paymentStore = tx.objectStore('customerPayments');
                const invoiceStore = tx.objectStore('invoices');
                const customerStore = tx.objectStore('customers');
                const ledgerStore = tx.objectStore('ledger');
                const walletStore = tx.objectStore('walletTransactions');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const payment = await paymentStore.get(paymentId);
                if (!payment) throw new Error("Payment not found");

                // 1. Reverse Invoices
                for (const allocation of payment.allocations) {
                    const invoice = await invoiceStore.get(allocation.invoiceId);
                    if (invoice) {
                        invoice.paidAmount = (invoice.paidAmount || 0) - allocation.amount;
                        if (invoice.paidAmount <= 0) {
                            invoice.status = 'Unpaid';
                        } else {
                            invoice.status = 'Partial';
                        }
                        await invoiceStore.put(invoice);
                    }
                }

                // 2. Reverse Customer Balance
                const amountApplied = toMoney(
                    payment.amountApplied ??
                    payment.receiptSnapshot?.amountApplied ??
                    (payment.allocations || []).reduce((sum: number, allocation: any) => sum + Number(allocation.amount || 0), 0)
                );
                const customer = await customerStore.get(payment.customerId);
                if (customer) {
                    customer.balance = toMoney((customer.balance || 0) + amountApplied);
                    await customerStore.put(customer);
                }

                // 3. Reverse Wallet (if wallet deposit was posted)
                const walletDeposit = toMoney(
                    payment.walletDeposit ??
                    payment.receiptSnapshot?.walletDeposit ??
                    payment.overpaymentAmount ??
                    payment.excessAmount ??
                    0
                );
                if (walletDeposit > 0 && payment.excessHandling === 'Wallet') {
                    const walletTx: WalletTransaction = {
                        id: `WLT-REV-${Date.now()}`,
                        customerId: payment.customerId,
                        amount: walletDeposit,
                        type: 'Deduction',
                        date: new Date().toISOString(),
                        description: `REVERSAL: Excess from payment ${payment.id}`
                    };
                    await walletStore.put(walletTx);

                    if (customer) {
                        customer.walletBalance = toMoney((customer.walletBalance || 0) - walletDeposit);
                        await customerStore.put(customer);
                    }
                }

                // 4. Create Reversal Ledger Entry
                const gl = getGLConfig();
                const retainedAmount = toMoney(
                    payment.amountRetained ??
                    payment.receiptSnapshot?.amountRetained ??
                    payment.amount
                );
                let originalDebitAccount = gl.cashDrawerAccount;
                if (payment.accountId) {
                    originalDebitAccount = payment.accountId;
                } else {
                    if (payment.paymentMethod === 'Card' || payment.paymentMethod === 'Bank Transfer') originalDebitAccount = gl.bankAccount;
                    if (payment.paymentMethod === 'Mobile Money') originalDebitAccount = gl.mobileMoneyAccount;
                    if (payment.paymentMethod === 'Wallet') originalDebitAccount = gl.customerWalletAccount;
                }
                const originalCreditAccount = payment.receiptSnapshot?.paymentPurpose === 'WALLET_TOPUP'
                    ? gl.customerDepositAccount
                    : (gl.accountsReceivable || '1100');
                const reversal: LedgerEntry = {
                    id: `LG-REV-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `VOID: Payment #${paymentId} - ${reason}`,
                    debitAccountId: originalCreditAccount,
                    creditAccountId: originalDebitAccount,
                    amount: retainedAmount,
                    referenceId: paymentId,
                    reconciled: false,
                    customerId: payment.customerId,
                    customerName: payment.customerName
                };
                await ledgerStore.put(reversal);

                // 5. Update Payment Status
                payment.status = 'Voided';
                payment.voidReason = reason;
                await paymentStore.put(payment);

                // 6. Mirror reversal to Banking (if linked bank account exists)
                const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                const bankAccount = resolveBankAccountForPayment(bankAccounts, payment);
                if (bankAccount) {
                    const allBankTransactions = await bankTransactionsStore.getAll();
                    const reversalRef = `VOID-${paymentId}`;
                    const existingReversal = allBankTransactions.find(tx =>
                        tx.bankAccountId === bankAccount.id &&
                        tx.reference === reversalRef &&
                        tx.type === 'Withdrawal'
                    );

                    if (!existingReversal) {
                        const bankTx: BankTransaction = {
                            id: generateNextId('TXN', allBankTransactions),
                            date: new Date().toISOString(),
                            amount: retainedAmount,
                            type: 'Withdrawal',
                            description: `Reversal for Payment #${paymentId}`,
                            reference: reversalRef,
                            bankAccountId: bankAccount.id,
                            counterparty: payment.customerName ? { name: payment.customerName } : undefined,
                            category: 'Income',
                            reconciled: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };

                        await bankTransactionsStore.put(bankTx);

                        const nextBalance = calculateBankBalance(
                            [...allBankTransactions, bankTx],
                            bankAccount.id
                        );

                        await bankAccountsStore.put({
                            ...bankAccount,
                            balance: roundToCurrency(nextBalance),
                            availableBalance: roundToCurrency(nextBalance),
                            updatedAt: new Date().toISOString()
                        });
                    }
                }

                return { success: true };
            }
        );
    },

    async saveCustomer(customer: Customer, oldCustomer?: Customer) {
        return dbService.executeAtomicOperation(
            ['customers'],
            async (tx) => {
                const store = tx.objectStore('customers');
                await store.put(customer);
                return { success: true };
            }
        );
    },

    async updateInvoice(invoice: Invoice) {
        return dbService.executeAtomicOperation(
            ['invoices'],
            async (tx) => {
                const store = tx.objectStore('invoices');
                await store.put(invoice);
                return { success: true };
            }
        );
    },

    async voidInvoice(id: string, reason: string) {
        return dbService.executeAtomicOperation(
            ['invoices', 'inventory', 'ledger', 'customers', 'customerPayments', 'bankAccounts', 'bankTransactions', 'walletTransactions'],
            async (tx) => {
                const invoiceStore = tx.objectStore('invoices');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const paymentStore = tx.objectStore('customerPayments');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');
                const walletStore = tx.objectStore('walletTransactions');

                const invoice = await invoiceStore.get(id);
                if (!invoice) throw new Error("Invoice not found");

                // 1. Reverse Inventory
                for (const item of invoice.items) {
                    const invItem = await inventoryStore.get(item.id);
                    if (invItem) {
                        invItem.stock = (invItem.stock || 0) + item.quantity;
                        await inventoryStore.put(invItem);
                    }
                }

                // 2. Reverse Customer Balance
                const customer = await customerStore.get(invoice.customerId);
                if (customer) {
                    const outstanding = Math.max(0, (invoice.totalAmount || 0) - (invoice.paidAmount || 0));
                    customer.balance = toMoney((customer.balance || 0) - outstanding);
                    await customerStore.put(customer);
                }

                const allPayments = await paymentStore.getAll();
                const relatedPayments = allPayments.filter((payment: CustomerPayment) => {
                    if (payment.status === 'Voided') return false;
                    if (payment.reference === id) return true;
                    return (payment.allocations || []).some(a => a.invoiceId === id);
                });

                const gl = getGLConfig();

                for (const payment of relatedPayments) {
                    const retainedAmount = toMoney(
                        (payment as any).amountRetained ??
                        payment.receiptSnapshot?.amountRetained ??
                        payment.amount
                    );
                    const walletDeposit = toMoney(
                        payment.walletDeposit ??
                        payment.receiptSnapshot?.walletDeposit ??
                        payment.overpaymentAmount ??
                        payment.excessAmount ??
                        0
                    );

                    if (walletDeposit > 0 && payment.excessHandling === 'Wallet' && payment.customerId) {
                        const walletTx: WalletTransaction = {
                            id: `WLT-REV-${Date.now()}`,
                            customerId: payment.customerId,
                            amount: walletDeposit,
                            type: 'Deduction',
                            date: new Date().toISOString(),
                            description: `REVERSAL: Excess from payment ${payment.id}`
                        };
                        await walletStore.put(walletTx);

                        if (customer) {
                            customer.walletBalance = toMoney((customer.walletBalance || 0) - walletDeposit);
                            await customerStore.put(customer);
                        }
                    }

                    let originalDebitAccount = gl.cashDrawerAccount;
                    if (payment.accountId) {
                        originalDebitAccount = payment.accountId;
                    } else {
                        if (payment.paymentMethod === 'Card' || payment.paymentMethod === 'Bank Transfer') originalDebitAccount = gl.bankAccount;
                        if (payment.paymentMethod === 'Mobile Money') originalDebitAccount = gl.mobileMoneyAccount;
                        if (payment.paymentMethod === 'Wallet') originalDebitAccount = gl.customerWalletAccount;
                    }
                    const originalCreditAccount = payment.receiptSnapshot?.paymentPurpose === 'WALLET_TOPUP'
                        ? gl.customerDepositAccount
                        : (gl.accountsReceivable || '1100');

                    if (retainedAmount > 0) {
                        const reversal: LedgerEntry = {
                            id: `LG-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: new Date().toISOString(),
                            description: `VOID: Payment #${payment.id} - Invoice ${id} voided`,
                            debitAccountId: originalCreditAccount,
                            creditAccountId: originalDebitAccount,
                            amount: retainedAmount,
                            referenceId: payment.id,
                            reconciled: false,
                            customerId: payment.customerId,
                            customerName: payment.customerName
                        };
                        await ledgerStore.put(reversal);
                    }

                    const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                    const bankAccount = resolveBankAccountForPayment(bankAccounts, payment);
                    if (bankAccount && retainedAmount > 0) {
                        const allBankTransactions = await bankTransactionsStore.getAll();
                        const reversalRef = `VOID-${payment.id}`;
                        const existingReversal = allBankTransactions.find(tx =>
                            tx.bankAccountId === bankAccount.id &&
                            tx.reference === reversalRef &&
                            tx.type === 'Withdrawal'
                        );

                        if (!existingReversal) {
                            const bankTx: BankTransaction = {
                                id: generateNextId('TXN', allBankTransactions),
                                date: new Date().toISOString(),
                                amount: retainedAmount,
                                type: 'Withdrawal',
                                description: `Reversal for Payment #${payment.id}`,
                                reference: reversalRef,
                                bankAccountId: bankAccount.id,
                                counterparty: payment.customerName ? { name: payment.customerName } : undefined,
                                category: 'Income',
                                reconciled: false,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };

                            await bankTransactionsStore.put(bankTx);

                            const nextBalance = calculateBankBalance(
                                [...allBankTransactions, bankTx],
                                bankAccount.id
                            );

                            await bankAccountsStore.put({
                                ...bankAccount,
                                balance: roundToCurrency(nextBalance),
                                availableBalance: roundToCurrency(nextBalance),
                                updatedAt: new Date().toISOString()
                            });
                        }
                    }

                    payment.status = 'Voided';
                    (payment as any).voidReason = reason;
                    await paymentStore.put(payment);
                }

                // 3. Reverse Ledger Entries (Find existing ones for this invoice)
                const allLedger = await ledgerStore.getAll();
                const relatedEntries = allLedger.filter(l => l.referenceId === id);
                for (const entry of relatedEntries) {
                    const reversal: LedgerEntry = {
                        ...entry,
                        id: `LG-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: new Date().toISOString(),
                        description: `REVERSAL: ${entry.description}`,
                        debitAccountId: entry.creditAccountId,
                        creditAccountId: entry.debitAccountId,
                        amount: entry.amount,
                        reconciled: false
                    };
                    await ledgerStore.put(reversal);
                }

                // 4. Update Invoice Status
                invoice.status = 'Cancelled';
                invoice.voidReason = reason;
                invoice.paidAmount = 0;
                await invoiceStore.put(invoice);

                return { success: true };
            }
        );
    },

    async voidSale(id: string, reason: string) {
        return dbService.executeAtomicOperation(
            ['sales', 'inventory', 'ledger', 'customers', 'customerPayments', 'bankAccounts', 'bankTransactions', 'walletTransactions', 'inventoryTransactions'],
            async (tx) => {
                const salesStore = tx.objectStore('sales');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const paymentStore = tx.objectStore('customerPayments');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');
                const walletStore = tx.objectStore('walletTransactions');
                const inventoryTransactionsStore = tx.objectStore('inventoryTransactions');

                const sale = await salesStore.get(id);
                if (!sale) throw new Error("Sale not found");
                if (sale.status === 'Voided') throw new Error("Sale already voided");

                const gl = getGLConfig();

                // 1. Reverse Inventory (restore stock)
                for (const item of sale.items || []) {
                    const invItem = await inventoryStore.get(item.id);
                    if (invItem && item.type !== 'Service') {
                        const previousQuantity = invItem.stock || 0;
                        const newQuantity = previousQuantity + item.quantity;
                        invItem.stock = newQuantity;
                        await inventoryStore.put(invItem);

                        // Create inventory reversal transaction record
                        const transaction = {
                            id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            itemId: item.id,
                            type: 'IN',
                            quantity: item.quantity,
                            previousQuantity,
                            newQuantity,
                            unitCost: invItem.cost || 0,
                            totalCost: item.quantity * (invItem.cost || 0),
                            reference: 'SALE_VOID',
                            referenceId: id,
                            reason: `Void: ${reason}`,
                            performedBy: 'System',
                            timestamp: new Date().toISOString()
                        };
                        await inventoryTransactionsStore.put(transaction);
                    }
                }

                // 2. Reverse Customer Balance if there was outstanding amount
                if (sale.customerId && sale.customerId !== 'walk-in') {
                    const customer = await customerStore.get(sale.customerId);
                    if (customer) {
                        const totalAmount = sale.totalAmount || sale.total || 0;
                        const paidAmount = sale.paidAmount || 0;
                        const outstanding = Math.max(0, totalAmount - paidAmount);
                        if (outstanding > 0) {
                            customer.balance = toMoney((customer.balance || 0) - outstanding);
                            await customerStore.put(customer);
                        }

                        // Reverse wallet deposits if any
                        if (sale.walletDeposit > 0) {
                            customer.walletBalance = toMoney((customer.walletBalance || 0) - sale.walletDeposit);
                            await customerStore.put(customer);

                            const walletTx: WalletTransaction = {
                                id: `WLT-REV-${Date.now()}`,
                                customerId: sale.customerId,
                                amount: sale.walletDeposit,
                                type: 'Deduction',
                                date: new Date().toISOString(),
                                description: `REVERSAL: Void Sale #${sale.id}`
                            };
                            await walletStore.put(walletTx);
                        }
                    }
                }

                // 3. Void related payments
                const allPayments = await paymentStore.getAll();
                const relatedPayments = allPayments.filter((payment: CustomerPayment) => {
                    if (payment.status === 'Voided') return false;
                    if (payment.reference === id) return true;
                    return (payment.allocations || []).some(a => a.invoiceId === id || a.saleId === id);
                });

                for (const payment of relatedPayments) {
                    const retainedAmount = toMoney(
                        (payment as any).amountRetained ??
                        payment.receiptSnapshot?.amountRetained ??
                        payment.amount
                    );

                    if (retainedAmount > 0) {
                        // Reverse payment ledger entry
                        let originalDebitAccount = gl.cashDrawerAccount;
                        if (payment.accountId) {
                            originalDebitAccount = payment.accountId;
                        } else {
                            if (payment.paymentMethod === 'Card' || payment.paymentMethod === 'Bank Transfer') originalDebitAccount = gl.bankAccount;
                            if (payment.paymentMethod === 'Mobile Money') originalDebitAccount = gl.mobileMoneyAccount;
                            if (payment.paymentMethod === 'Wallet') originalDebitAccount = gl.customerWalletAccount;
                        }

                        const reversal: LedgerEntry = {
                            id: `LG-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: new Date().toISOString(),
                            description: `VOID: Payment #${payment.id} - Sale ${id} voided`,
                            debitAccountId: gl.defaultSalesAccount,
                            creditAccountId: originalDebitAccount,
                            amount: retainedAmount,
                            referenceId: payment.id,
                            reconciled: false,
                            customerId: payment.customerId,
                            customerName: payment.customerName
                        };
                        await ledgerStore.put(reversal);

                        // Reverse bank transaction
                        const bankAccounts = await ensureBankAccounts(bankAccountsStore);
                        const bankAccount = resolveBankAccountForPayment(bankAccounts, payment);
                        if (bankAccount) {
                            const allBankTransactions = await bankTransactionsStore.getAll();
                            const reversalRef = `VOID-${payment.id}`;
                            const existingReversal = allBankTransactions.find(tx =>
                                tx.bankAccountId === bankAccount.id &&
                                tx.reference === reversalRef &&
                                tx.type === 'Withdrawal'
                            );

                            if (!existingReversal) {
                                const bankTx: BankTransaction = {
                                    id: generateNextId('TXN', allBankTransactions),
                                    date: new Date().toISOString(),
                                    amount: retainedAmount,
                                    type: 'Withdrawal',
                                    description: `Reversal for Payment #${payment.id}`,
                                    reference: reversalRef,
                                    bankAccountId: bankAccount.id,
                                    counterparty: payment.customerName ? { name: payment.customerName } : undefined,
                                    category: 'Income',
                                    reconciled: false,
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                };

                                await bankTransactionsStore.put(bankTx);

                                const nextBalance = calculateBankBalance(
                                    [...allBankTransactions, bankTx],
                                    bankAccount.id
                                );

                                await bankAccountsStore.put({
                                    ...bankAccount,
                                    balance: roundToCurrency(nextBalance),
                                    availableBalance: roundToCurrency(nextBalance),
                                    updatedAt: new Date().toISOString()
                                });
                            }
                        }
                    }

                    payment.status = 'Voided';
                    (payment as any).voidReason = reason;
                    await paymentStore.put(payment);
                }

                // 4. Reverse COGS entry
                const cogsTotal = await calculateItemsCost(sale.items || [], inventoryStore, (item) => item.parentId || item.id);
                if (cogsTotal > 0) {
                    const cogsReversal: LedgerEntry = {
                        id: `LG-COGS-REV-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `COGS Reversal - Void Sale #${sale.id}`,
                        debitAccountId: gl.defaultInventoryAccount,
                        creditAccountId: gl.defaultCOGSAccount,
                        amount: cogsTotal,
                        referenceId: id,
                        reconciled: false,
                        customerId: sale.customerId,
                        customerName: sale.customerName
                    };
                    await ledgerStore.put(cogsReversal);
                }

                // 5. Reverse all other ledger entries for this sale
                const allLedger = await ledgerStore.getAll();
                const relatedEntries = allLedger.filter(l => l.referenceId === id && !l.description?.includes('COGS'));
                for (const entry of relatedEntries) {
                    const reversal: LedgerEntry = {
                        ...entry,
                        id: `LG-REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: new Date().toISOString(),
                        description: `REVERSAL: ${entry.description}`,
                        debitAccountId: entry.creditAccountId,
                        creditAccountId: entry.debitAccountId,
                        amount: entry.amount,
                        reconciled: false
                    };
                    await ledgerStore.put(reversal);
                }

                // 6. Update Sale Status
                sale.status = 'Voided';
                (sale as any).voidReason = reason;
                (sale as any).voidedAt = new Date().toISOString();
                await salesStore.put(sale);

                return { success: true };
            }
        );
    },

    async syncInventoryValuation(accountId: string, physicalValue: number, currentLedgerBalance: number) {
        return dbService.executeAtomicOperation(
            ['ledger'],
            async (tx) => {
                const ledgerStore = tx.objectStore('ledger');
                const diff = physicalValue - currentLedgerBalance;

                if (Math.abs(diff) > 0.01) {
                    const gl = getGLConfig();
                    const entry: LedgerEntry = {
                        id: `LG-SYNC-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Inventory Valuation Sync: Physical(${physicalValue}) vs Ledger(${currentLedgerBalance})`,
                        debitAccountId: diff > 0 ? accountId : (gl.defaultCOGSAccount || '5000'),
                        creditAccountId: diff > 0 ? (gl.defaultCOGSAccount || '5000') : accountId,
                        amount: Math.abs(diff),
                        referenceId: 'SYNC-INV',
                        reconciled: true
                    };
                    await ledgerStore.put(entry);
                }
                return { success: true };
            }
        );
    },

    async addExpense(expense: Expense) {
        return dbService.executeAtomicOperation(
            ['expenses', 'ledger', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'expense', expense.id, (expense as any).idempotencyKey);

                const expenseStore = tx.objectStore('expenses');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const normalizedExpense: Expense = {
                    ...expense,
                    status: 'Paid'
                };
                await expenseStore.put(normalizedExpense);

                const gl = getGLConfig();
                const totalAmount = Number(normalizedExpense.amount);
                const expenseEntry: LedgerEntry = {
                    id: `LG-EXP-MAIN-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `Expense: ${normalizedExpense.description}`,
                    debitAccountId: gl.defaultExpenseAccount || '5000',
                    creditAccountId: normalizedExpense.accountId || gl.bankAccount || '1050',
                    amount: totalAmount,
                    referenceId: normalizedExpense.id,
                    reconciled: false
                };
                await ledgerStore.put(expenseEntry);

                const settlementAccountId = normalizedExpense.accountId || gl.bankAccount || '1050';
                const settlementMethod = settlementAccountId === gl.cashDrawerAccount
                    ? 'Cash'
                    : settlementAccountId === gl.mobileMoneyAccount
                        ? 'Mobile Money'
                        : 'Bank Transfer';

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: normalizedExpense.date || new Date().toISOString(),
                    amount: totalAmount,
                    type: 'Withdrawal',
                    description: `Expense: ${normalizedExpense.description}`,
                    reference: `EXP-${normalizedExpense.id}`,
                    accountId: settlementAccountId,
                    paymentMethod: settlementMethod,
                    category: 'Expense'
                });

                return { success: true };
            }
        );
    },

    async approveExpense(id: string) {
        return dbService.executeAtomicOperation(
            ['expenses', 'ledger', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'expense_approval', id);

                const expenseStore = tx.objectStore('expenses');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const expense = await expenseStore.get(id);
                if (!expense) throw new Error("Expense not found");

                const existingEntries = await ledgerStore.getAll();
                const alreadyPosted = existingEntries.some((entry: LedgerEntry) => entry.referenceId === expense.id);

                if (alreadyPosted) {
                    expense.status = expense.status === 'Pending Approval' ? 'Approved' : expense.status;
                    await expenseStore.put(expense);
                    return { success: true, alreadyPosted: true };
                }

                expense.status = 'Approved';
                await expenseStore.put(expense);

                // Create Ledger Entry
                const gl = getGLConfig();
                const totalAmount = Number(expense.amount);

                // Debit Expense Account, Credit Payment Account
                const expenseEntry: LedgerEntry = {
                    id: `LG-EXP-MAIN-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `Expense: ${expense.description}`,
                    debitAccountId: gl.defaultExpenseAccount || '5000',
                    creditAccountId: expense.accountId || gl.bankAccount || '1050',
                    amount: totalAmount,
                    referenceId: expense.id,
                    reconciled: false
                };
                await ledgerStore.put(expenseEntry);

                const settlementAccountId = expense.accountId || gl.bankAccount || '1050';
                const settlementMethod = settlementAccountId === gl.cashDrawerAccount
                    ? 'Cash'
                    : settlementAccountId === gl.mobileMoneyAccount
                        ? 'Mobile Money'
                        : 'Bank Transfer';

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: expense.date || new Date().toISOString(),
                    amount: totalAmount,
                    type: 'Withdrawal',
                    description: `Expense: ${expense.description}`,
                    reference: `EXP-${expense.id}`,
                    accountId: settlementAccountId,
                    paymentMethod: settlementMethod,
                    category: 'Expense'
                });

                return { success: true };
            }
        );
    },

    async addIncome(income: Income) {
        return dbService.executeAtomicOperation(
            ['income', 'ledger', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'income', income.id, (income as any).idempotencyKey);

                const incomeStore = tx.objectStore('income');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                await incomeStore.put(income);

                // Create Ledger Entry
                const gl = getGLConfig();
                const entry: LedgerEntry = {
                    id: `LG-INC-${Date.now()}`,
                    date: income.date,
                    description: `Income: ${income.description}`,
                    debitAccountId: income.accountId || gl.bankAccount || '1050',
                    creditAccountId: gl.otherIncomeAccount || '4900',
                    amount: income.amount,
                    referenceId: income.id,
                    reconciled: false
                };
                await ledgerStore.put(entry);

                const settlementAccountId = income.accountId || gl.bankAccount || '1050';
                const settlementMethod = settlementAccountId === gl.cashDrawerAccount
                    ? 'Cash'
                    : settlementAccountId === gl.mobileMoneyAccount
                        ? 'Mobile Money'
                        : 'Bank Transfer';

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: income.date,
                    amount: income.amount,
                    type: 'Deposit',
                    description: `Income: ${income.description}`,
                    reference: `INC-${income.id}`,
                    accountId: settlementAccountId,
                    paymentMethod: settlementMethod,
                    category: 'Income'
                });

                return { success: true };
            }
        );
    },

    async executeTransfer(transfer: Transfer) {
        return dbService.executeAtomicOperation(
            ['transfers', 'ledger', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'transfer', transfer.id, (transfer as any).idempotencyKey);

                const transferStore = tx.objectStore('transfers');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                await transferStore.put(transfer);

                // Create Ledger Entry
                const entry: LedgerEntry = {
                    id: `LG-TRF-${Date.now()}`,
                    date: transfer.date,
                    description: `Internal Transfer: ${transfer.description || ''}`,
                    debitAccountId: transfer.toAccountId,
                    creditAccountId: transfer.fromAccountId,
                    amount: transfer.amount,
                    referenceId: transfer.id,
                    reconciled: true
                };
                await ledgerStore.put(entry);

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: transfer.date,
                    amount: transfer.amount,
                    type: 'Withdrawal',
                    description: `Transfer out: ${transfer.description || transfer.id}`,
                    reference: `TRF-OUT-${transfer.id}`,
                    accountId: transfer.fromAccountId,
                    paymentMethod: transfer.fromAccountId === '1000' ? 'Cash' : 'Bank Transfer',
                    category: 'Transfer'
                });

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: transfer.date,
                    amount: transfer.amount,
                    type: 'Deposit',
                    description: `Transfer in: ${transfer.description || transfer.id}`,
                    reference: `TRF-IN-${transfer.id}`,
                    accountId: transfer.toAccountId,
                    paymentMethod: transfer.toAccountId === '1000' ? 'Cash' : 'Bank Transfer',
                    category: 'Transfer'
                });

                return { success: true };
            }
        );
    },

    async applyLateFeeToInvoice(invoiceId: string, fee: number) {
        return dbService.executeAtomicOperation(
            ['invoices', 'ledger'],
            async (tx) => {
                const invoiceStore = tx.objectStore('invoices');
                const ledgerStore = tx.objectStore('ledger');

                const invoice = await invoiceStore.get(invoiceId);
                if (!invoice) throw new Error("Invoice not found");

                invoice.totalAmount += fee;
                await invoiceStore.put(invoice);

                const gl = getGLConfig();
                const entry: LedgerEntry = {
                    id: `LG-FEE-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `Late Fee for Invoice #${invoice.id}`,
                    debitAccountId: gl.accountsReceivable || '1100',
                    creditAccountId: gl.otherIncomeAccount || '4900',
                    amount: fee,
                    referenceId: invoice.id,
                    reconciled: false,
                    customerId: invoice.customerId,
                    customerName: invoice.customerName
                };
                await ledgerStore.put(entry);

                return { success: true };
            }
        );
    },

    async processGoodsReceipt(grn: GoodsReceipt, performedBy?: string) {
        return dbService.executeAtomicOperation(
            ['inventory', 'goodsReceipts', 'purchases', 'ledger', 'suppliers', 'inventoryTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'goods_receipt', grn.id, (grn as any).idempotencyKey);

                const inventoryStore = tx.objectStore('inventory');
                const grnStore = tx.objectStore('goodsReceipts');
                const purchaseStore = tx.objectStore('purchases');
                const ledgerStore = tx.objectStore('ledger');
                const supplierStore = tx.objectStore('suppliers');
                const inventoryTransactionsStore = tx.objectStore('inventoryTransactions');

                const gl = getGLConfig();
                let totalValue = 0;

                // 1. Update Inventory Stock and Cost (before saving GRN to get accurate totalValue)
                const timestamp = new Date().toISOString();
                for (const item of grn.items) {
                    const invItem = await inventoryStore.get(item.itemId);
                    if (invItem) {
                        const oldStock = invItem.stock || 0;
                        const newStock = oldStock + item.quantityReceived;

                        // Weighted Average Cost calculation
                        const oldCost = invItem.cost || 0;
                        const newCost = ((oldCost * oldStock) + (item.cost * item.quantityReceived)) / newStock;

                        invItem.stock = newStock;
                        invItem.cost = newCost;
                        await inventoryStore.put(invItem);

                        totalValue += item.cost * item.quantityReceived;

                        // Create inventory transaction audit trail
                        const transaction = {
                            id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            itemId: item.itemId,
                            type: 'IN',
                            quantity: item.quantityReceived,
                            previousQuantity: oldStock,
                            newQuantity: newStock,
                            unitCost: item.cost,
                            totalCost: item.cost * item.quantityReceived,
                            reference: 'GRN',
                            referenceId: grn.id,
                            reason: `Goods Receipt from ${grn.supplierName || 'Supplier'}`,
                            performedBy: performedBy || 'System',
                            timestamp
                        };
                        await inventoryTransactionsStore.put(transaction);
                    }
                }

                // 2. Update Purchase Order status if linked
                let relatedPurchase: Purchase | null = null;
                let poAmount = 0;
                if (grn.purchaseOrderId) {
                    const po = await purchaseStore.get(grn.purchaseOrderId);
                    if (po) {
                        relatedPurchase = po;
                        poAmount = po.total || po.totalAmount || 0;

                        // Reverse the PO AP entry since we're now recording actual GRN
                        if (po.status === 'Approved') {
                            // Reverse PO AP entry
                            const poReversal: LedgerEntry = {
                                id: `LG-GRN-POREV-${Date.now()}`,
                                date: grn.date,
                                description: `PO Reversal on GRN - ${po.id}`,
                                debitAccountId: gl.accountsPayable || '2000',
                                creditAccountId: gl.defaultInventoryAccount || '1200',
                                amount: poAmount,
                                referenceId: grn.id,
                                reconciled: false,
                                supplierId: po.supplierId
                            };
                            await ledgerStore.put(poReversal);

                            // Adjust supplier balance (remove PO amount)
                            if (po.supplierId) {
                                const supplier = await supplierStore.get(po.supplierId);
                                if (supplier) {
                                    supplier.balance = (supplier.balance || 0) - poAmount;
                                    await supplierStore.put(supplier);
                                }
                            }
                        }

                        // Update PO status
                        po.status = 'Received';
                        if (!po.paymentStatus || po.paymentStatus === 'Cancelled' || po.paymentStatus === 'Approved') {
                            po.paymentStatus = (po.paidAmount || 0) > 0 ? 'Partial' : 'Unpaid';
                        }
                        await purchaseStore.put(po);
                    }
                }

                // 3. Save GRN
                await grnStore.put(grn);

                // 4. Create Actual GRN Ledger Entry
                const totalAmount = totalValue;

                // Debit Inventory, Credit AP
                const inventoryEntry: LedgerEntry = {
                    id: `LG-GRN-INV-${Date.now()}`,
                    date: grn.date,
                    description: `Goods Receipt #${grn.id}${relatedPurchase ? ` (PO: ${relatedPurchase.id})` : ''}`,
                    debitAccountId: gl.defaultInventoryAccount || '1200',
                    creditAccountId: gl.accountsPayable || '2000',
                    amount: totalAmount,
                    referenceId: grn.id,
                    reconciled: false,
                    supplierId: grn.supplierId || relatedPurchase?.supplierId
                };
                await ledgerStore.put(inventoryEntry);

                // 5. Update Supplier Balance with actual GRN amount
                const supplierId = grn.supplierId || relatedPurchase?.supplierId;
                if (supplierId) {
                    const supplier = await supplierStore.get(supplierId);
                    if (supplier) {
                        supplier.balance = (supplier.balance || 0) + totalAmount;
                        await supplierStore.put(supplier);
                    }
                }

                // 6. Handle variance if GRN amount differs from PO amount
                if (relatedPurchase && Math.abs(totalAmount - poAmount) > 0.01) {
                    const variance = totalAmount - poAmount;
                    const varianceEntry: LedgerEntry = {
                        id: `LG-GRN-VAR-${Date.now()}`,
                        date: grn.date,
                        description: `GRN Variance - ${grn.id} (Actual: ${totalAmount.toFixed(2)} vs PO: ${poAmount.toFixed(2)})`,
                        debitAccountId: variance > 0 ? (gl.defaultCOGSAccount || '5000') : gl.accountsPayable,
                        creditAccountId: variance > 0 ? gl.accountsPayable : (gl.defaultCOGSAccount || '5000'),
                        amount: Math.abs(variance),
                        referenceId: grn.id,
                        reconciled: false,
                        supplierId: supplierId
                    };
                    await ledgerStore.put(varianceEntry);
                }

                return { success: true, poReversed: !!relatedPurchase, variance: relatedPurchase ? totalAmount - poAmount : 0 };
            }
        );
    },

    async adjustStock(params: { itemId: string, qtyChange: number, reason: string, warehouseId: string, notes?: string, variantId?: string }) {
        return dbService.executeAtomicOperation(
            ['inventory', 'ledger'],
            async (tx) => {
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');

                const item = await inventoryStore.get(params.itemId);
                if (!item) throw new Error("Item not found");

                let adjustmentCost = item.cost || 0;

                if (params.variantId && item.variants) {
                    const variantIndex = item.variants.findIndex(v => v.id === params.variantId);
                    if (variantIndex !== -1) {
                        item.variants[variantIndex].stock = (item.variants[variantIndex].stock || 0) + params.qtyChange;
                        adjustmentCost = item.variants[variantIndex].cost || item.cost || 0;
                    }
                }

                item.stock = (item.stock || 0) + params.qtyChange;
                await inventoryStore.put(item);

                // If it's a significant adjustment, log to ledger
                if (Math.abs(params.qtyChange * adjustmentCost) > 0) {
                    const gl = getGLConfig();
                    const entry: LedgerEntry = {
                        id: `LG-ADJ-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Stock Adjustment: ${params.reason} (${params.notes || ''})`,
                        debitAccountId: params.qtyChange > 0 ? (gl.defaultInventoryAccount || '1200') : (gl.defaultCOGSAccount || '5000'),
                        creditAccountId: params.qtyChange > 0 ? (gl.defaultCOGSAccount || '5000') : (gl.defaultInventoryAccount || '1200'),
                        amount: Math.abs(params.qtyChange * adjustmentCost),
                        referenceId: params.itemId,
                        reconciled: false
                    };
                    await ledgerStore.put(entry);
                }

                return { success: true };
            }
        );
    },

    async updateReservedStock(itemId: string, reservedChange: number, variantId?: string) {
        return dbService.executeAtomicOperation(
            ['inventory'],
            async (tx) => {
                const store = tx.objectStore('inventory');
                const item = await store.get(itemId);
                if (!item) throw new Error("Item not found");

                if (variantId && item.variants) {
                    const variantIndex = item.variants.findIndex(v => v.id === variantId);
                    if (variantIndex !== -1) {
                        item.variants[variantIndex].reserved = (item.variants[variantIndex].reserved || 0) + reservedChange;
                    }
                }

                item.reserved = (item.reserved || 0) + reservedChange;
                await store.put(item);
                return { success: true };
            }
        );
    },

    async transferStock(itemId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number) {
        // In this simplified local DB, we just track total stock per item.
        // A real system would track stock per warehouse.
        return { success: true };
    },

    async processPurchaseOrder(purchase: Purchase) {
        return dbService.executeAtomicOperation(
            ['purchases'],
            async (tx) => {
                const store = tx.objectStore('purchases');
                await store.put(purchase);
                return { success: true };
            }
        );
    },

    async approvePurchaseOrder(id: string) {
        return dbService.executeAtomicOperation(
            ['purchases', 'ledger', 'suppliers', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'purchase_order_approval', id);

                const purchaseStore = tx.objectStore('purchases');
                const ledgerStore = tx.objectStore('ledger');
                const supplierStore = tx.objectStore('suppliers');

                const purchase = await purchaseStore.get(id);
                if (!purchase) throw new Error("Purchase order not found");
                if (purchase.status === 'Approved') throw new Error("Purchase order already approved");
                if (purchase.status === 'Cancelled') throw new Error("Cannot approve cancelled purchase order");

                const gl = getGLConfig();
                const totalAmount = purchase.total || purchase.totalAmount || 0;

                // 1. Post AP Ledger Entry for Purchase Order
                // Debit: PO Receiving Account (or Inventory Account if direct)
                // Credit: Accounts Payable
                const apEntry: LedgerEntry = {
                    id: `LG-PO-AP-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `PO Commitment - ${purchase.id}`,
                    debitAccountId: gl.defaultInventoryAccount || '1200',
                    creditAccountId: gl.accountsPayable || '2000',
                    amount: totalAmount,
                    referenceId: purchase.id,
                    reconciled: false,
                    supplierId: purchase.supplierId
                };
                await ledgerStore.put(apEntry);

                // 2. Update Supplier Balance
                if (purchase.supplierId) {
                    const supplier = await supplierStore.get(purchase.supplierId);
                    if (supplier) {
                        supplier.balance = (supplier.balance || 0) + totalAmount;
                        await supplierStore.put(supplier);
                    }
                }

                // 3. Update Purchase Order Status
                purchase.status = 'Approved';
                purchase.paymentStatus = 'Approved';
                purchase.approvedAt = new Date().toISOString();
                await purchaseStore.put(purchase);

                return { success: true, apEntryId: apEntry.id };
            }
        );
    },

    async cancelPurchaseOrder(id: string, reason: string) {
        return dbService.executeAtomicOperation(
            ['purchases', 'ledger', 'suppliers', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'purchase_order_cancel', `${id}:${reason}`);

                const purchaseStore = tx.objectStore('purchases');
                const ledgerStore = tx.objectStore('ledger');
                const supplierStore = tx.objectStore('suppliers');

                const purchase = await purchaseStore.get(id);
                if (!purchase) throw new Error("Purchase order not found");
                if (purchase.status === 'Cancelled') throw new Error("Purchase order already cancelled");
                if (purchase.status === 'Received') throw new Error("Cannot cancel received purchase order");

                const gl = getGLConfig();
                const totalAmount = purchase.total || purchase.totalAmount || 0;

                // 1. Reverse AP Ledger Entry if PO was approved
                if (purchase.status === 'Approved') {
                    const reversalEntry: LedgerEntry = {
                        id: `LG-PO-REV-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `PO Cancellation - ${purchase.id} - ${reason}`,
                        debitAccountId: gl.accountsPayable || '2000',
                        creditAccountId: gl.defaultInventoryAccount || '1200',
                        amount: totalAmount,
                        referenceId: purchase.id,
                        reconciled: false,
                        supplierId: purchase.supplierId
                    };
                    await ledgerStore.put(reversalEntry);

                    // 2. Reverse Supplier Balance
                    if (purchase.supplierId) {
                        const supplier = await supplierStore.get(purchase.supplierId);
                        if (supplier) {
                            supplier.balance = (supplier.balance || 0) - totalAmount;
                            await supplierStore.put(supplier);
                        }
                    }
                }

                // 3. Update Purchase Order Status
                purchase.status = 'Cancelled';
                purchase.paymentStatus = 'Cancelled';
                purchase.cancelledAt = new Date().toISOString();
                purchase.cancelReason = reason;
                await purchaseStore.put(purchase);

                return { success: true };
            }
        );
    },

    async createReplenishmentOrder(itemId: string) {
        return dbService.executeAtomicOperation(
            ['inventory', 'purchases', 'suppliers'],
            async (tx) => {
                const inventoryStore = tx.objectStore('inventory');
                const purchaseStore = tx.objectStore('purchases');

                const item = await inventoryStore.get(itemId);
                if (!item) throw new Error("Item not found");

                const allPurchases = await purchaseStore.getAll();
                const nextId = generateNextId('PO', allPurchases);

                const newPurchase: Purchase = {
                    id: nextId,
                    date: new Date().toISOString(),
                    supplierId: item.preferredSupplierId || 'SUPP-001',
                    items: [{
                        itemId: item.id,
                        name: item.name,
                        quantity: (item.maxStockLevel || 100) - (item.stock || 0),
                        cost: item.cost || 0,
                        receivedQty: 0
                    }],
                    total: ((item.maxStockLevel || 100) - (item.stock || 0)) * (item.cost || 0),
                    status: 'Draft'
                };

                await purchaseStore.put(newPurchase);
                return newPurchase;
            }
        );
    },

    async reconcileInventory(results: { itemId: string; variance: number; warehouseId: string }[], totalVarianceCost: number) {
        return dbService.executeAtomicOperation(
            ['inventory', 'ledger'],
            async (tx) => {
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');

                for (const res of results) {
                    const item = await inventoryStore.get(res.itemId);
                    if (item) {
                        item.stock = (item.stock || 0) + res.variance;
                        await inventoryStore.put(item);
                    }
                }

                if (Math.abs(totalVarianceCost) > 0.01) {
                    const entry: LedgerEntry = {
                        id: `LG-REC-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Inventory Reconciliation Variance`,
                        debitAccountId: totalVarianceCost < 0 ? '5000' : '1200',
                        creditAccountId: totalVarianceCost < 0 ? '1200' : '5000',
                        amount: Math.abs(totalVarianceCost),
                        referenceId: 'RECONCILE',
                        reconciled: true
                    };
                    await ledgerStore.put(entry);
                }

                return { success: true };
            }
        );
    },

    async getCompanyConfig() {
        // Mocking company config for now as it's not in DB schema but used in ProductionContext
        return {
            productionSettings: {
                requireQAApproval: false,
                allowOverproduction: true
            },
            lateFeePolicy: {
                enabled: false,
                type: 'Flat',
                value: 0
            }
        };
    },

    async completeWorkOrder(orderId: string, consumedMaterials: { materialId: string, quantity: number, cost: number }[] = []) {
        return dbService.executeAtomicOperation(
            ['workOrders', 'inventory', 'ledger'],
            async (tx) => {
                const woStore = tx.objectStore('workOrders');
                const invStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');

                const wo = await woStore.get(orderId);
                if (!wo) throw new Error("Work order not found");

                // 1. Update status
                wo.status = 'Completed';
                wo.endDate = new Date().toISOString();
                await woStore.put(wo);

                // 2. Consume Materials (BOM)
                const gl = getGLConfig();
                for (const mat of consumedMaterials) {
                    const item = await invStore.get(mat.materialId);
                    if (item) {
                        item.stock = (item.stock || 0) - mat.quantity;
                        // Release from reserved as well if it was reserved
                        item.reserved = Math.max(0, (item.reserved || 0) - mat.quantity);
                        await invStore.put(item);

                        // Ledger entry for material consumption
                        const entry: LedgerEntry = {
                            id: `LG-CONS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: new Date().toISOString(),
                            description: `Material Consumption: ${item.name} (WO: ${wo.id})`,
                            debitAccountId: gl.defaultCOGSAccount || '5000',
                            creditAccountId: gl.defaultInventoryAccount || '1200',
                            amount: mat.cost,
                            referenceId: wo.id,
                            reconciled: false
                        };
                        await ledgerStore.put(entry);
                    }
                }

                // 3. Add finished product to stock (if it's a stocked item)
                const product = await invStore.get(wo.productId);
                if (product && product.type !== 'Service') {
                    product.stock = (product.stock || 0) + wo.quantityPlanned;
                    await invStore.put(product);
                }

                return { success: true };
            }
        );
    },

    async processWorkOrderCreation(wo: WorkOrder, reservations: { materialId: string, quantity: number }[] = []) {
        return dbService.executeAtomicOperation(
            ['workOrders', 'inventory'],
            async (tx) => {
                const woStore = tx.objectStore('workOrders');
                const invStore = tx.objectStore('inventory');

                // 1. Save Work Order
                await woStore.put(wo);

                // 2. Reserve Materials
                for (const res of reservations) {
                    const item = await invStore.get(res.materialId);
                    if (item) {
                        item.reserved = (item.reserved || 0) + res.quantity;
                        await invStore.put(item);
                    }
                }

                return { success: true };
            }
        );
    },

    async cancelWorkOrder(orderId: string, reservations: { materialId: string, quantity: number }[] = []) {
        return dbService.executeAtomicOperation(
            ['workOrders', 'inventory'],
            async (tx) => {
                const store = tx.objectStore('workOrders');
                const invStore = tx.objectStore('inventory');
                const wo = await store.get(orderId);

                if (wo) {
                    wo.status = 'Cancelled';
                    await store.put(wo);
                }

                // Release reservations if any
                for (const res of reservations) {
                    const item = await invStore.get(res.materialId);
                    if (item) {
                        item.reserved = Math.max(0, (item.reserved || 0) - res.quantity);
                        await invStore.put(item);
                    }
                }

                return { success: true };
            }
        );
    },

    async processProductionWaste(materialId: string, quantity: number, cost: number, referenceId: string, description: string) {
        return dbService.executeAtomicOperation(
            ['inventory', 'ledger'],
            async (tx) => {
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');

                // 1. Update Inventory
                const item = await inventoryStore.get(materialId);
                if (item) {
                    item.stock = (item.stock || 0) - quantity;
                    await inventoryStore.put(item);
                }

                // 2. Create Ledger Entry (Debit COGS/Waste, Credit Inventory)
                const gl = getGLConfig();
                const entry: LedgerEntry = {
                    id: `LG-WST-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: description,
                    debitAccountId: gl.defaultCOGSAccount || '5000',
                    creditAccountId: gl.defaultInventoryAccount || '1200',
                    amount: cost,
                    referenceId: referenceId,
                    reconciled: false
                };
                await ledgerStore.put(entry);

                return { success: true };
            }
        );
    },

    async createOrder(order: Order) {
        return dbService.executeAtomicOperation(
            ['orders', 'inventory', 'ledger', 'customers', 'walletTransactions', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'order', order.id, (order as any).idempotencyKey);

                const orderStore = tx.objectStore('orders');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const walletStore = tx.objectStore('walletTransactions');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                // Pre-fetch data for adjustment processing
                const inventory = await inventoryStore.getAll();
                const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                // 1. Save Order
                await orderStore.put(order);

                // 2. Reserve Stock
                for (const item of order.items) {
                    const invItem = await inventoryStore.get(item.productId);
                    if (invItem) {
                        if ((item as any).variantId && invItem.variants) {
                            const vIdx = invItem.variants.findIndex(v => v.id === (item as any).variantId);
                            if (vIdx !== -1) {
                                invItem.variants[vIdx].reserved = (invItem.variants[vIdx].reserved || 0) + item.quantity;
                            }
                        }
                        invItem.reserved = (invItem.reserved || 0) + item.quantity;
                        await inventoryStore.put(invItem);
                    }
                }

                // 3. Status-based processing
                if (order.status === 'Completed') {
                    // Deduct actual stock immediately if created as Completed
                    for (const item of order.items) {
                        const invItem = await inventoryStore.get(item.productId);
                        if (invItem) {
                            // Rule: Use snapshot quantities for deduction if available
                            const qtyToDeduct = item.productionCostSnapshot?.components?.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0) || item.quantity;

                            if (item.variantId && invItem.variants) {
                                const vIdx = invItem.variants.findIndex(v => v.id === item.variantId);
                                if (vIdx !== -1) {
                                    invItem.variants[vIdx].stock = (invItem.variants[vIdx].stock || 0) - qtyToDeduct;
                                    invItem.variants[vIdx].reserved = Math.max(0, (invItem.variants[vIdx].reserved || 0) - qtyToDeduct);
                                }
                            }
                            invItem.stock = (invItem.stock || 0) - qtyToDeduct;
                            invItem.reserved = Math.max(0, (invItem.reserved || 0) - qtyToDeduct);
                            await inventoryStore.put(invItem);
                        }
                    }

                    const cogsTotal = await calculateItemsCost(
                        order.items || [],
                        inventoryStore,
                        (item) => item.productId
                    );
                    if (cogsTotal > 0) {
                        const gl = getGLConfig();
                        const cogsEntry: LedgerEntry = {
                            id: `LG-COGS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: order.orderDate,
                            description: `COGS - Order #${order.orderNumber}`,
                            debitAccountId: gl.defaultCOGSAccount,
                            creditAccountId: gl.defaultInventoryAccount,
                            amount: Number(cogsTotal.toFixed(2)),
                            referenceId: order.id,
                            reconciled: false,
                            customerId: order.customerId,
                            customerName: order.customerName
                        };
                        await ledgerStore.put(cogsEntry);
                    }

                    // Process Market Adjustments for completed orders
                    // Convert order items to cart items format for the helper
                    const cartItems: any[] = order.items.map(item => ({
                        id: item.productId,
                        name: item.productName,
                        price: item.unitPrice,
                        quantity: item.quantity,
                        type: 'Product',
                        cost: item.productionCostSnapshot?.baseProductionCost || 0,
                        variantId: item.variantId,
                        adjustmentSnapshots: item.adjustmentSnapshots,
                        transactionAdjustmentSnapshots: (item as any).transactionAdjustmentSnapshots
                    }));

                    const adjustmentResult = await this._processMarketAdjustments(
                        cartItems,
                        inventory,
                        bomTemplates,
                        marketAdjustments,
                        order.id,
                        'order',
                        inventoryStore
                    );

                    // Store adjustment data on order
                    (order as any).adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                        ? adjustmentResult.adjustmentSnapshots
                        : (order as any).adjustmentSnapshots;
                    (order as any).adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                        ? adjustmentResult.adjustmentTotal
                        : (order as any).adjustmentTotal;
                    (order as any).transactionAdjustments = adjustmentResult.adjustmentTransactions;
                    (order as any).adjustmentSummary = adjustmentResult.adjustmentSummary;

                    // Save adjustment transactions to the store
                    for (const adjTx of adjustmentResult.adjustmentTransactions) {
                        await marketAdjustmentTransactionsStore.put(adjTx);
                    }

                    // Update order with adjustment data
                    await orderStore.put(order);

                    // Recognize Revenue immediately
                    const revenueEntry: LedgerEntry = {
                        id: `LG-ORD-REV-NEW-${Date.now()}`,
                        date: order.orderDate,
                        description: `Immediate Revenue recognition for Order #${order.orderNumber}`,
                        debitAccountId: '2100', // Customer Deposits (Liability decreases)
                        creditAccountId: '4000', // Sales Revenue (Equity/Revenue increases)
                        amount: order.totalAmount,
                        referenceId: order.id,
                        reconciled: true,
                        customerId: order.customerId,
                        customerName: order.customerName
                    };
                    await ledgerStore.put(revenueEntry);
                }

                // 4. Create Ledger Entry for initial payment and update Wallet if needed
                if (order.paidAmount > 0 && order.payments && order.payments.length > 0) {
                    const lastPayment = order.payments[order.payments.length - 1];
                    const isWallet = lastPayment.paymentMethod === 'Wallet';

                    if (isWallet && order.customerId) {
                        const customer = await customerStore.get(order.customerId);
                        if (customer) {
                            customer.walletBalance = (customer.walletBalance || 0) - order.paidAmount;
                            await customerStore.put(customer);

                            const walletTx: WalletTransaction = {
                                id: `WLT-ORD-${Date.now()}`,
                                customerId: order.customerId,
                                date: new Date().toISOString(),
                                type: 'Deduction',
                                amount: order.paidAmount,
                                description: `Wallet payment for Order #${order.orderNumber}`
                            };
                            await walletStore.put(walletTx);
                        }
                    }

                    const entry: LedgerEntry = {
                        id: `LG-ORD-INIT-${Date.now()}`,
                        date: order.orderDate,
                        description: `Initial payment for Order #${order.orderNumber} via ${lastPayment.paymentMethod}`,
                        debitAccountId: isWallet ? '1210' : '1001', // Wallet or Cash/Bank
                        creditAccountId: '2100', // Customer Deposits
                        amount: order.paidAmount,
                        referenceId: order.id,
                        reconciled: false,
                        customerId: order.customerId,
                        customerName: order.customerName
                    };
                    await ledgerStore.put(entry);

                    if (!isWallet) {
                        await ensureMirroredBankTransaction({
                            bankAccountsStore,
                            bankTransactionsStore,
                            date: order.orderDate,
                            amount: order.paidAmount,
                            type: 'Deposit',
                            description: `Initial payment for Order #${order.orderNumber}`,
                            reference: `ORD-INIT-${order.id}`,
                            accountId: lastPayment.accountId,
                            paymentMethod: lastPayment.paymentMethod,
                            category: 'Income',
                            counterpartyName: order.customerName
                        });
                    }
                }

                return { success: true, id: order.id };
            }
        );
    },

    async recordOrderPayment(orderId: string, payment: OrderPayment) {
        return dbService.executeAtomicOperation(
            ['orders', 'ledger', 'customers', 'walletTransactions', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'order_payment', `${orderId}:${payment.id || payment.paymentDate}:${payment.amountPaid}`);

                const orderStore = tx.objectStore('orders');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const walletStore = tx.objectStore('walletTransactions');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const order = await orderStore.get(orderId);
                if (!order) throw new Error("Order not found");

                // 1. Update Order
                order.payments = [...(order.payments || []), payment];
                order.paidAmount += payment.amountPaid;
                order.remainingBalance = order.totalAmount - order.paidAmount;

                if (order.paidAmount >= order.totalAmount) {
                    // Keep status as Partially Paid if not fulfilled, or update if business logic requires
                    // For now, we follow the rule: status becomes 'Completed' ONLY through fulfillment
                }

                await orderStore.put(order);

                // 2. Wallet Update if needed
                const isWallet = payment.paymentMethod === 'Wallet';
                if (isWallet && order.customerId) {
                    const customer = await customerStore.get(order.customerId);
                    if (customer) {
                        customer.walletBalance = (customer.walletBalance || 0) - payment.amountPaid;
                        await customerStore.put(customer);

                        const walletTx: WalletTransaction = {
                            id: `WLT-ORD-PAY-${Date.now()}`,
                            customerId: order.customerId,
                            date: new Date().toISOString(),
                            type: 'Deduction',
                            amount: payment.amountPaid,
                            description: `Wallet payment for Order #${order.orderNumber}`
                        };
                        await walletStore.put(walletTx);
                    }
                }

                // 3. Ledger Entry
                const gl = getGLConfig();
                let targetDebitAccount = isWallet ? gl.customerWalletAccount : gl.cashDrawerAccount;

                if (payment.accountId) {
                    targetDebitAccount = payment.accountId;
                } else if (!isWallet) {
                    if (payment.paymentMethod === 'Card' || payment.paymentMethod === 'Bank Transfer') targetDebitAccount = gl.bankAccount;
                    if (payment.paymentMethod === 'Mobile Money') targetDebitAccount = gl.mobileMoneyAccount;
                }

                const entry: LedgerEntry = {
                    id: `LG-ORD-PAY-${Date.now()}`,
                    date: payment.paymentDate,
                    description: `Payment for Order #${order.orderNumber} via ${payment.paymentMethod}`,
                    debitAccountId: targetDebitAccount,
                    creditAccountId: gl.customerDeposits || '2100', // Customer Deposits
                    amount: payment.amountPaid,
                    referenceId: order.id,
                    reconciled: false,
                    customerId: order.customerId,
                    customerName: order.customerName
                };
                await ledgerStore.put(entry);

                if (!isWallet) {
                    await ensureMirroredBankTransaction({
                        bankAccountsStore,
                        bankTransactionsStore,
                        date: payment.paymentDate,
                        amount: payment.amountPaid,
                        type: 'Deposit',
                        description: `Payment for Order #${order.orderNumber}`,
                        reference: `ORD-PAY-${order.id}-${payment.id || payment.paymentDate}`,
                        accountId: payment.accountId,
                        paymentMethod: payment.paymentMethod,
                        category: 'Income',
                        counterpartyName: order.customerName
                    });
                }

                return { success: true };
            }
        );
    },

    async updateOrderStatus(orderId: string, status: Order['status']) {
        return dbService.executeAtomicOperation(
            ['orders', 'inventory', 'ledger', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions'],
            async (tx) => {
                const orderStore = tx.objectStore('orders');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const bomTemplatesStore = tx.objectStore('bomTemplates');
                const marketAdjustmentsStore = tx.objectStore('marketAdjustments');
                const marketAdjustmentTransactionsStore = tx.objectStore('marketAdjustmentTransactions');

                const order = await orderStore.get(orderId);
                if (!order) throw new Error("Order not found");

                const oldStatus = order.status;
                order.status = status;

                // Fulfillment logic
                if (status === 'Completed' && oldStatus !== 'Completed') {
                    // 1. Pre-fetch data for adjustment processing
                    const inventory = await inventoryStore.getAll();
                    const bomTemplates: BOMTemplate[] = await bomTemplatesStore.getAll();
                    const marketAdjustments: MarketAdjustment[] = await marketAdjustmentsStore.getAll();

                    // 2. Deduct actual stock, clear reserved
                    for (const item of order.items) {
                        const invItem = await inventoryStore.get(item.productId);
                        if (invItem) {
                            // Rule: Use snapshot quantities for deduction if available
                            const qtyToDeduct = item.productionCostSnapshot?.components?.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0) || item.quantity;

                            if (item.variantId && invItem.variants) {
                                const vIdx = invItem.variants.findIndex(v => v.id === item.variantId);
                                if (vIdx !== -1) {
                                    invItem.variants[vIdx].stock = (invItem.variants[vIdx].stock || 0) - qtyToDeduct;
                                    invItem.variants[vIdx].reserved = Math.max(0, (invItem.variants[vIdx].reserved || 0) - qtyToDeduct);
                                }
                            }
                            invItem.stock = (invItem.stock || 0) - qtyToDeduct;
                            invItem.reserved = Math.max(0, (invItem.reserved || 0) - qtyToDeduct);
                            await inventoryStore.put(invItem);
                        }
                    }

                    const cogsTotal = await calculateItemsCost(
                        order.items || [],
                        inventoryStore,
                        (item) => item.productId
                    );
                    if (cogsTotal > 0) {
                        const gl = getGLConfig();
                        const cogsEntry: LedgerEntry = {
                            id: `LG-COGS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            date: new Date().toISOString(),
                            description: `COGS - Order #${order.orderNumber}`,
                            debitAccountId: gl.defaultCOGSAccount,
                            creditAccountId: gl.defaultInventoryAccount,
                            amount: Number(cogsTotal.toFixed(2)),
                            referenceId: order.id,
                            reconciled: false,
                            customerId: order.customerId,
                            customerName: order.customerName
                        };
                        await ledgerStore.put(cogsEntry);
                    }

                    // 3. Process Market Adjustments for completed orders
                    const cartItems: any[] = order.items.map(item => ({
                        id: item.productId,
                        name: item.productName,
                        price: item.unitPrice,
                        quantity: item.quantity,
                        type: 'Product',
                        cost: item.productionCostSnapshot?.baseProductionCost || 0,
                        variantId: item.variantId,
                        adjustmentSnapshots: item.adjustmentSnapshots,
                        transactionAdjustmentSnapshots: (item as any).transactionAdjustmentSnapshots
                    }));

                    const adjustmentResult = await this._processMarketAdjustments(
                        cartItems,
                        inventory,
                        bomTemplates,
                        marketAdjustments,
                        order.id,
                        'order',
                        inventoryStore
                    );

                    // Store adjustment data on order
                    (order as any).adjustmentSnapshots = adjustmentResult.adjustmentSnapshots.length > 0
                        ? adjustmentResult.adjustmentSnapshots
                        : (order as any).adjustmentSnapshots;
                    (order as any).adjustmentTotal = adjustmentResult.adjustmentTotal > 0
                        ? adjustmentResult.adjustmentTotal
                        : (order as any).adjustmentTotal;
                    (order as any).transactionAdjustments = adjustmentResult.adjustmentTransactions;
                    (order as any).adjustmentSummary = adjustmentResult.adjustmentSummary;

                    // Save adjustment transactions to the store
                    for (const adjTx of adjustmentResult.adjustmentTransactions) {
                        await marketAdjustmentTransactionsStore.put(adjTx);
                    }

                    // 4. Recognize Revenue
                    const revenueEntry: LedgerEntry = {
                        id: `LG-ORD-REV-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Revenue recognition for Order #${order.orderNumber}`,
                        debitAccountId: '2100', // Customer Deposits
                        creditAccountId: '4000', // Sales Revenue
                        amount: order.totalAmount,
                        referenceId: order.id,
                        reconciled: true,
                        customerId: order.customerId,
                        customerName: order.customerName
                    };
                    await ledgerStore.put(revenueEntry);
                }

                await orderStore.put(order);
                return { success: true };
            }
        );
    },

    async cancelOrder(orderId: string, reason: string) {
        return dbService.executeAtomicOperation(
            ['orders', 'inventory', 'ledger', 'customers', 'walletTransactions'],
            async (tx) => {
                const orderStore = tx.objectStore('orders');
                const inventoryStore = tx.objectStore('inventory');
                const ledgerStore = tx.objectStore('ledger');
                const customerStore = tx.objectStore('customers');
                const walletStore = tx.objectStore('walletTransactions');

                const order = await orderStore.get(orderId);
                if (!order) throw new Error("Order not found");

                if (order.status === 'Completed') throw new Error("Cannot cancel a completed order");

                // 1. Release Reserved Stock
                for (const item of order.items) {
                    const invItem = await inventoryStore.get(item.productId);
                    if (invItem) {
                        if ((item as any).variantId && invItem.variants) {
                            const vIdx = invItem.variants.findIndex(v => v.id === (item as any).variantId);
                            if (vIdx !== -1) {
                                invItem.variants[vIdx].reserved = Math.max(0, (invItem.variants[vIdx].reserved || 0) - item.quantity);
                            }
                        }
                        invItem.reserved = Math.max(0, (invItem.reserved || 0) - item.quantity);
                        await inventoryStore.put(invItem);
                    }
                }

                // 2. Reverse Payments if any (move to customer wallet)
                if (order.paidAmount > 0) {
                    if (order.customerId) {
                        const customer = await customerStore.get(order.customerId);
                        if (customer) {
                            customer.walletBalance = (customer.walletBalance || 0) + order.paidAmount;
                            await customerStore.put(customer);

                            const walletTx: WalletTransaction = {
                                id: `WLT-CAN-${Date.now()}`,
                                customerId: order.customerId,
                                date: new Date().toISOString(),
                                type: 'Deposit',
                                amount: order.paidAmount,
                                description: `Refund from Cancelled Order #${order.orderNumber}`
                            };
                            await walletStore.put(walletTx);
                        }
                    }

                    const reversal: LedgerEntry = {
                        id: `LG-ORD-CAN-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Order #${order.orderNumber} Cancelled - Payment refunded to Wallet`,
                        debitAccountId: '2100', // Customer Deposits
                        creditAccountId: '1210', // Wallet
                        amount: order.paidAmount,
                        referenceId: order.id,
                        reconciled: false,
                        customerId: order.customerId,
                        customerName: order.customerName
                    };
                    await ledgerStore.put(reversal);
                }

                order.status = 'Cancelled';
                (order as any).cancelReason = reason;
                await orderStore.put(order);

                return { success: true };
            }
        );
    },

    async createSalesExchangeRequest(exchange: Partial<SalesExchange>) {
        return dbService.executeAtomicOperation(
            ['salesExchanges', 'salesExchangeItems'],
            async (tx) => {
                const exchangeStore = tx.objectStore('salesExchanges');

                // Get all exchanges for ID generation
                const allExchanges = await exchangeStore.getAll();
                const nextId = generateNextId('SE', allExchanges);

                const newExchange: SalesExchange = {
                    ...exchange as SalesExchange,
                    id: nextId as any, // Using string ID for simplicity in local DB
                    exchange_number: nextId,
                    exchange_date: new Date().toISOString(),
                    status: 'pending',
                    total_price_difference: exchange.total_price_difference || 0
                };

                await exchangeStore.put(newExchange);
                return { success: true, id: nextId };
            }
        );
    },

    async approveSalesExchange(id: string, comments: string) {
        return dbService.executeAtomicOperation(
            ['salesExchanges', 'reprintJobs', 'salesExchangeApprovals', 'ledger', 'inventory'],
            async (tx) => {
                const exchangeStore = tx.objectStore('salesExchanges');
                const reprintStore = tx.objectStore('reprintJobs');
                const approvalStore = tx.objectStore('salesExchangeApprovals');
                const ledgerStore = tx.objectStore('ledger');
                const inventoryStore = tx.objectStore('inventory');

                const exchange = await exchangeStore.get(id);
                if (!exchange) throw new Error("Exchange not found");
                if (exchange.status !== 'pending') throw new Error("Only pending exchanges can be approved");

                // 1. Update status
                exchange.status = 'approved';
                await exchangeStore.put(exchange);

                // 2. Create Approval Entry
                const approvalId = Date.now().toString();
                const approval: SalesExchangeApproval = {
                    id: approvalId,
                    exchange_id: id as any,
                    approved_by: 'Supervisor', // Should get from context in real app
                    approval_date: new Date().toISOString(),
                    comments,
                    status: 'approved'
                };
                await approvalStore.put(approval);

                // 3. Auto-generate Reprint Jobs and Update Inventory
                if (exchange.items) {
                    for (const item of exchange.items) {
                        // Inventory Adjustments
                        const invItem = await inventoryStore.get(item.product_id);
                        if (invItem) {
                            // Increase stock for returned items (if not damaged beyond use)
                            if (item.qty_returned > 0 && item.condition !== 'damaged') {
                                if ((item as any).variant_id && invItem.variants) {
                                    const vIdx = invItem.variants.findIndex(v => v.id === (item as any).variant_id);
                                    if (vIdx !== -1) {
                                        invItem.variants[vIdx].stock = (invItem.variants[vIdx].stock || 0) + item.qty_returned;
                                    }
                                }
                                invItem.stock = (invItem.stock || 0) + item.qty_returned;
                            }
                            // Decrease stock for replaced items
                            if (item.qty_replaced > 0) {
                                if ((item as any).variant_id && invItem.variants) {
                                    const vIdx = invItem.variants.findIndex(v => v.id === (item as any).variant_id);
                                    if (vIdx !== -1) {
                                        invItem.variants[vIdx].stock = (invItem.variants[vIdx].stock || 0) - item.qty_replaced;
                                    }
                                }
                                invItem.stock = (invItem.stock || 0) - item.qty_replaced;
                            }
                            await inventoryStore.put(invItem);
                        }

                        // Auto-generate Reprint Jobs for items requiring reprint
                        if (item.reprint_required || item.qty_replaced > 0) {
                            const reprintJob: ReprintJob = {
                                id: (Date.now() + Math.floor(Math.random() * 1000)).toString(),
                                exchange_id: id as any,
                                job_description: `Reprint for ${item.product_name} (Exchange ${exchange.exchange_number})`,
                                paper_used: "0",
                                ink_used: "0",
                                finishing_cost: 0,
                                total_reprint_cost: 0,
                                status: 'Pending'
                            };
                            await reprintStore.put(reprintJob);
                        }
                    }
                }

                // 4. Financial adjustment (if price difference exists)
                if (exchange.total_price_difference !== 0) {
                    const entry: LedgerEntry = {
                        id: `LG-EX-${Date.now()}`,
                        date: new Date().toISOString(),
                        description: `Exchange Adjustment for SE #${exchange.exchange_number}`,
                        debitAccountId: exchange.total_price_difference > 0 ? '1001' : '4001',
                        creditAccountId: exchange.total_price_difference > 0 ? '4001' : '1001',
                        amount: Math.abs(exchange.total_price_difference),
                        referenceId: id,
                        reconciled: false,
                        customerId: exchange.customer_id,
                        customerName: exchange.customer_name
                    };
                    await ledgerStore.put(entry);
                }

                return { success: true };
            }
        );
    },

    async recordSupplierPayment(payment: SupplierPayment) {
        return dbService.executeAtomicOperation(
            ['supplierPayments', 'purchases', 'ledger', 'suppliers', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'supplier_payment', payment.id, (payment as any).idempotencyKey);

                const paymentStore = tx.objectStore('supplierPayments');
                const purchaseStore = tx.objectStore('purchases');
                const supplierStore = tx.objectStore('suppliers');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                // 1. Save the payment
                await paymentStore.put(payment);

                // 2. Update linked Purchase Orders
                if (payment.allocations && payment.allocations.length > 0) {
                    for (const allocation of payment.allocations) {
                        const po = await purchaseStore.get(allocation.purchaseId);
                        if (po) {
                            po.paidAmount = (po.paidAmount || 0) + allocation.amount;
                            if (po.paidAmount >= po.total) {
                                po.paymentStatus = 'Paid';
                            } else if (po.paidAmount > 0) {
                                po.paymentStatus = 'Partial';
                            } else {
                                po.paymentStatus = 'Unpaid';
                            }
                            await purchaseStore.put(po);
                        }
                    }
                }

                // 3. Update Supplier Balance
                const supplier = await supplierStore.get(payment.supplierId);
                if (supplier) {
                    supplier.balance = (supplier.balance || 0) - payment.amount;
                    await supplierStore.put(supplier);
                }

                // 4. Ledger Entry
                const gl = getGLConfig();
                let targetCreditAccount = gl.bankAccount;

                if (payment.accountId) {
                    targetCreditAccount = payment.accountId;
                } else {
                    if (payment.paymentMethod === 'Cash') targetCreditAccount = gl.cashDrawerAccount;
                    if (payment.paymentMethod === 'Mobile Money') targetCreditAccount = gl.mobileMoneyAccount;
                    if (payment.paymentMethod === 'Wallet') targetCreditAccount = gl.customerWalletAccount;
                }

                const ledgerEntry: LedgerEntry = {
                    id: `LG-SPAY-${Date.now()}`,
                    date: payment.date,
                    description: `Supplier Payment #${payment.id} to ${payment.supplierId}`,
                    debitAccountId: gl.accountsPayable,
                    creditAccountId: targetCreditAccount,
                    amount: payment.amount,
                    referenceId: payment.id,
                    reconciled: false
                };
                await ledgerStore.put(ledgerEntry);

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: payment.date,
                    amount: payment.amount,
                    type: 'Withdrawal',
                    description: `Supplier Payment #${payment.id}`,
                    reference: `SPAY-${payment.id}`,
                    accountId: targetCreditAccount,
                    paymentMethod: payment.paymentMethod,
                    category: 'Expense',
                    counterpartyName: payment.supplierId
                });

                return { success: true };
            }
        );
    },

    async updateSupplierPayment(payment: SupplierPayment) {
        return dbService.executeAtomicOperation(
            ['supplierPayments'],
            async (tx) => {
                const store = tx.objectStore('supplierPayments');
                await store.put(payment);
                return { success: true };
            }
        );
    },

    async voidSupplierPayment(paymentId: string) {
        return dbService.executeAtomicOperation(
            ['supplierPayments', 'purchases', 'ledger', 'suppliers', 'bankAccounts', 'bankTransactions', 'idempotencyKeys'],
            async (tx) => {
                await reserveIdempotencyKey(tx, 'supplier_payment_void', paymentId);

                const paymentStore = tx.objectStore('supplierPayments');
                const purchaseStore = tx.objectStore('purchases');
                const supplierStore = tx.objectStore('suppliers');
                const ledgerStore = tx.objectStore('ledger');
                const bankAccountsStore = tx.objectStore('bankAccounts');
                const bankTransactionsStore = tx.objectStore('bankTransactions');

                const payment = await paymentStore.get(paymentId);
                if (!payment) throw new Error("Payment not found");

                // 1. Reverse Purchase Orders balances
                if (payment.allocations && payment.allocations.length > 0) {
                    for (const allocation of payment.allocations) {
                        const po = await purchaseStore.get(allocation.purchaseId);
                        if (po) {
                            po.paidAmount = Math.max(0, (po.paidAmount || 0) - allocation.amount);
                            if (po.paidAmount <= 0) {
                                po.paymentStatus = 'Unpaid';
                            } else if (po.paidAmount < po.total) {
                                po.paymentStatus = 'Partial';
                            } else {
                                po.paymentStatus = 'Paid';
                            }
                            await purchaseStore.put(po);
                        }
                    }
                }

                // 2. Reverse Supplier Balance
                const supplier = await supplierStore.get(payment.supplierId);
                if (supplier) {
                    supplier.balance = (supplier.balance || 0) + payment.amount;
                    await supplierStore.put(supplier);
                }

                // 3. Mark Payment as Voided
                payment.status = 'Voided';
                await paymentStore.put(payment);

                // 4. Ledger Entry for Reversal
                const gl = getGLConfig();
                let targetDebitAccount = gl.bankAccount;
                if (payment.paymentMethod === 'Cash') targetDebitAccount = gl.cashDrawerAccount;

                const reversalEntry: LedgerEntry = {
                    id: `LG-SPAY-VOID-${Date.now()}`,
                    date: new Date().toISOString(),
                    description: `REVERSAL: Supplier Payment #${payment.id} voided`,
                    debitAccountId: targetDebitAccount,
                    creditAccountId: gl.accountsPayable,
                    amount: payment.amount,
                    referenceId: payment.id,
                    reconciled: false
                };
                await ledgerStore.put(reversalEntry);

                await ensureMirroredBankTransaction({
                    bankAccountsStore,
                    bankTransactionsStore,
                    date: new Date().toISOString(),
                    amount: payment.amount,
                    type: 'Deposit',
                    description: `Supplier Payment Reversal #${payment.id}`,
                    reference: `SPAY-VOID-${payment.id}`,
                    accountId: targetDebitAccount,
                    paymentMethod: payment.paymentMethod,
                    category: 'Transfer',
                    counterpartyName: payment.supplierId
                });

                return { success: true };
            }
        );
    }
};
