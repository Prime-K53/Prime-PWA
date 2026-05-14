import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import {
    Item, Warehouse, Purchase, Sale, Quotation, JobOrder, CustomerPayment, BillOfMaterial, ProductionBatch, WorkOrder, WorkCenter, ProductionResource, Account, LedgerEntry, Invoice, RecurringInvoice, Expense, Income, ScheduledPayment, WalletTransaction, DeliveryNote, Budget, Transfer, Employee, PayrollRun, Payslip, User, ResourceAllocation, GoodsReceipt, UserRole, SMSCampaign, Subscriber, SMSTemplate, Cheque, Shipment, SubcontractOrder, MaintenanceLog, AuditLogEntry, SystemAlert, Reminder, ExamJob, ExamPaper, ExamPrintingBatch, School, Customer, Supplier, SupplierPayment, Order, PurchaseAllocation, VatTransaction, VatReturn, BOMTemplate, MarketAdjustment, MarketAdjustmentTransaction, UserGroup, MaterialCategory, WarehouseInventory, MaterialBatch, InventoryTransaction, MaterialReservation, RoundingLog, ExaminationJob, ExaminationJobSubject, ExaminationInvoiceGroup, ExaminationRecurringProfile, ExaminationInventoryDeduction, CustomerReceiptSnapshot, ExaminationBatchNotification, NotificationAuditLog, SalesOrder, JobTicket, JobTicketSettings
} from '../types';
import { calculateCustomerPaymentSnapshot } from './receiptCalculationService';
import {
    BankAccount,
    BankTransaction,
    BankStatement,
    ScheduledPayment as BankScheduledPayment,
    ExchangeRate,
    BankFee,
    Reconciliation,
    Adjustment,
    CashFlowForecast,
    BankAlert,
    BankCategory
} from '../types/banking';

interface NexusDB extends DBSchema {
    inventory: { key: string; value: Item; };
    warehouses: { key: string; value: Warehouse; };
    purchases: { key: string; value: Purchase; };
    sales: { key: string; value: Sale; };
    quotations: { key: string; value: Quotation; };
    jobOrders: { key: string; value: JobOrder; };
    examJobs: { key: string; value: ExamJob; };
    examPapers: { key: string; value: ExamPaper; };
    examPrintingBatches: { key: string; value: ExamPrintingBatch; };
    examinationJobs: { key: string; value: ExaminationJob; };
    examinationJobSubjects: { key: string; value: ExaminationJobSubject; };
    examinationInvoiceGroups: { key: string; value: ExaminationInvoiceGroup; };
    examinationRecurringProfiles: { key: string; value: ExaminationRecurringProfile; };
    examinationInventoryDeductions: { key: string; value: ExaminationInventoryDeduction; };
    examinationBatchNotifications: { key: string; value: ExaminationBatchNotification; };
    examinationBatches: { key: string; value: any; };
    notificationAuditLogs: { key: string; value: NotificationAuditLog; };
    schools: { key: string; value: School; };
    classes: { key: string; value: { id: string; name: string } };
    subjects: { key: string; value: { id: string; name: string; code?: string } };
    customerPayments: { key: string; value: CustomerPayment; };
    boms: { key: string; value: BillOfMaterial; };
    bomTemplates: { key: string; value: BOMTemplate; };
    marketAdjustments: { key: string; value: MarketAdjustment; };
    materialReservations: { key: string; value: MaterialReservation; };
    materialCategories: { key: string; value: MaterialCategory; };
    warehouseInventory: { key: string; value: WarehouseInventory; };
    materialBatches: { key: string; value: MaterialBatch; };
    inventoryTransactions: { key: string; value: InventoryTransaction; };
    marketAdjustmentTransactions: { key: string; value: MarketAdjustmentTransaction; };
    batches: { key: string; value: ProductionBatch; };
    workOrders: { key: string; value: WorkOrder; };
    jobTickets: { key: string; value: JobTicket; };
    jobTicketSettings: { key: string; value: { id: string } & JobTicketSettings; };
    workCenters: { key: string; value: WorkCenter; };
    resources: { key: string; value: ProductionResource; };
    resourceAllocations: { key: string; value: ResourceAllocation; };
    accounts: { key: string; value: Account; };
    ledger: { key: string; value: LedgerEntry; };
    invoices: { key: string; value: Invoice; };
    recurringInvoices: { key: string; value: RecurringInvoice; };
    expenses: { key: string; value: Expense; };
    income: { key: string; value: Income; };
    scheduledPayments: { key: string; value: ScheduledPayment; };
    walletTransactions: { key: string; value: WalletTransaction; };
    deliveryNotes: { key: string; value: DeliveryNote; };
    budgets: { key: string; value: Budget; };
    transfers: { key: string; value: Transfer; };
    cheques: { key: string; value: Cheque; };
    employees: { key: string; value: Employee; };
    payrollRuns: { key: string; value: PayrollRun; };
    payslips: { key: string; value: Payslip; };
    users: { key: string; value: User; };
    userGroups: { key: string; value: UserGroup; };
    goodsReceipts: { key: string; value: GoodsReceipt; };
    smsCampaigns: { key: string; value: SMSCampaign; };
    subscribers: { key: string; value: Subscriber; };
    smsTemplates: { key: string; value: SMSTemplate; };
    shipments: { key: string; value: Shipment; };
    subcontractOrders: { key: string; value: SubcontractOrder; };
    maintenanceLogs: { key: string; value: MaintenanceLog; };
    auditLogs: { key: string; value: AuditLogEntry; };
    alerts: { key: string; value: SystemAlert; };
    reminders: { key: string; value: Reminder; };
    customers: { key: string; value: Customer; };
    suppliers: { key: string; value: Supplier; };
    supplierPayments: { key: string; value: SupplierPayment; };
    orders: { key: string; value: Order; };
    salesOrders: { key: string; value: SalesOrder; };
    salesExchanges: { key: string; value: any; };
    salesExchangeItems: { key: string; value: any; };
    reprintJobs: { key: string; value: any; };
    salesExchangeApprovals: { key: string; value: any; };
    files: { key: string; value: { id: string; blob: Blob; name: string; type: string; created: string } };
    syncOutbox: { key: string; value: { id: string; entityId: string; type: string; payload: any; date: string } };
    vatTransactions: { key: string; value: VatTransaction; };
    vatReturns: { key: string; value: VatReturn; };
    roundingLogs: { key: string; value: RoundingLog; };
    bankAccounts: { key: string; value: BankAccount; };
    bankTransactions: { key: string; value: BankTransaction; };
    bankStatements: { key: string; value: BankStatement; };
    bankScheduledPayments: { key: string; value: BankScheduledPayment; };
    bankExchangeRates: { key: string; value: ExchangeRate; };
    bankFees: { key: string; value: BankFee; };
    bankReconciliations: { key: string; value: Reconciliation; };
    bankAdjustments: { key: string; value: Adjustment; };
    bankCashFlowForecasts: { key: string; value: CashFlowForecast; };
    bankAlerts: { key: string; value: BankAlert; };
    bankCategories: { key: string; value: BankCategory; };
    idempotencyKeys: { key: string; value: { id: string; scope: string; sourceId: string; createdAt: string; metadata?: any } };
    settings: { key: string; value: any; };
    customerNotificationLogs: { key: string; value: any; };
    whatsappChats: { key: string; value: any; };
    whatsappTemplates: { key: string; value: any; };
    whatsappCampaigns: { key: string; value: any; };
    whatsappAutomations: { key: string; value: any; };
}

const DB_NAME = 'PrimeERP_Final_v3_Clean';
// Version bump required so existing IndexedDB instances run upgrade()
// and create newly-added stores such as examinationBatchNotifications
// and notificationAuditLogs.
const DB_VERSION = 32;

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

const isRecoverableDbConnectionError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    if (error.name === 'VersionError' || error.name === 'InvalidStateError') return true;

    const message = String(error.message || '').toLowerCase();
    return message.includes('database connection is closing')
        || message.includes('connection is closing')
        || message.includes('connection is closed');
};

const resetDbConnection = async (db?: IDBPDatabase<NexusDB> | null) => {
    try {
        db?.close();
    } catch { }
    dbPromise = null;
};

const withDbRecovery = async <T>(operation: (db: IDBPDatabase<NexusDB>) => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const db = await initDB();
        try {
            return await operation(db);
        } catch (error) {
            lastError = error;
            if (!isRecoverableDbConnectionError(error) || attempt === 1) {
                throw error;
            }

            console.warn('[DB] Recovering from stale IndexedDB connection, reopening database...');
            await resetDbConnection(db);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('IndexedDB operation failed.');
};

// Handle HMR and page reloads by closing the connection
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (dbPromise) {
            dbPromise.then(db => {
                db.close();
                // Connection closed on page unload
            }).catch(() => { });
        }
    });

    // Handle Vite HMR
    if ((import.meta as any).hot) {
        (import.meta as any).hot.dispose(() => {
            if (dbPromise) {
                dbPromise.then(db => {
                    db.close();
                    // Connection closed due to HMR
                }).catch(() => { });
                dbPromise = null;
            }
        });
    }
}

let fileHandle: FileSystemFileHandle | null = null;
let saveTimer: any = null;
let isSaving = false;
type SyncStatus = 'idle' | 'connected' | 'syncing' | 'error' | 'restricted';
let onSyncStateChange: ((status: SyncStatus) => void) | null = null;
const DATA_CHANGED_EVENT = 'primeerp:data-changed';
const DATA_CHANGED_CHANNEL = 'primeerp-data-sync';
const DB_SOURCE = `db-${Math.random().toString(36).slice(2)}`;
let dataChangeChannel: BroadcastChannel | null = null;

const notifySyncState = (status: SyncStatus) => {
    if (onSyncStateChange) onSyncStateChange(status);
};

const emitDataChange = (stores: string[]) => {
    const payload = {
        type: 'data-changed',
        stores,
        source: DB_SOURCE,
        at: Date.now()
    };
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: payload }));
            localStorage.setItem(DATA_CHANGED_EVENT, JSON.stringify(payload));
        }
    } catch { }
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            if (!dataChangeChannel) {
                dataChangeChannel = new BroadcastChannel(DATA_CHANGED_CHANNEL);
            }
            dataChangeChannel.postMessage(payload);
        }
    } catch { }
};

const STORE_NAMES: (keyof NexusDB)[] = [
    'inventory', 'warehouses', 'purchases', 'sales',
    'quotations', 'jobOrders', 'customerPayments', 'boms', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'batches',
    'workOrders', 'jobTickets', 'jobTicketSettings', 'workCenters', 'resources', 'resourceAllocations',
    'accounts', 'ledger', 'invoices', 'recurringInvoices',
    'expenses', 'income', 'scheduledPayments',
    'walletTransactions', 'deliveryNotes', 'budgets', 'cheques',
    'transfers', 'employees', 'payrollRuns', 'payslips',
    'users', 'userGroups', 'goodsReceipts', 'files',
    'smsCampaigns', 'subscribers', 'smsTemplates', 'shipments',
    'subcontractOrders', 'maintenanceLogs',
    'auditLogs', 'syncOutbox', 'alerts', 'reminders',
    'examJobs', 'examPapers', 'examPrintingBatches',
    'examinationJobs', 'examinationJobSubjects', 'examinationInvoiceGroups', 'examinationRecurringProfiles', 'examinationInventoryDeductions', 'examinationBatchNotifications', 'examinationBatches', 'notificationAuditLogs',
    'schools',
    'classes', 'subjects',
    'customers', 'suppliers', 'supplierPayments',
    'orders', 'materialReservations', 'materialCategories', 'warehouseInventory', 'materialBatches', 'inventoryTransactions',
    'salesExchanges', 'salesExchangeItems', 'reprintJobs', 'salesExchangeApprovals', 'salesOrders',
    'vatTransactions', 'vatReturns', 'roundingLogs',
    'bankAccounts', 'bankTransactions', 'bankStatements', 'bankScheduledPayments',
    'bankExchangeRates', 'bankFees', 'bankReconciliations', 'bankAdjustments',
    'bankCashFlowForecasts', 'bankAlerts', 'bankCategories',
    'idempotencyKeys',
    'settings', 'customerNotificationLogs',
    'whatsappChats', 'whatsappTemplates', 'whatsappCampaigns', 'whatsappAutomations'
];

export const initDB = async (): Promise<IDBPDatabase<NexusDB>> => {
    if (dbPromise) return dbPromise;

    // Starting connection

    dbPromise = (async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Database connection timed out(120s). This usually happens if a large migration is running or another tab is blocking the connection. Please close all other tabs and refresh.`));
            }, 120000);
        });

        const openPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
            async upgrade(db, oldVersion, newVersion, transaction) {
                // Upgrading/Creating DB
                for (const store of STORE_NAMES) {
                    if (!db.objectStoreNames.contains(store as any)) {
                        // Creating store
                        db.createObjectStore(store as any, { keyPath: 'id' });
                    }
                }
                // All stores created

                if (oldVersion < 20 && transaction) {
                    await migrateToVersion20(transaction);
                }

                if (oldVersion < 24 && transaction) {
                    await migrateToVersion24(transaction);
                }
            },
            blocked() {
                console.warn('[DB] CONNECTION BLOCKED - Another tab is using an older version of this database.');
                window.dispatchEvent(new CustomEvent('nexus-db-blocked'));
            },
            blocking() {
                console.warn('[DB] CONNECTION BLOCKING - Another tab needs to upgrade. Closing connection...');
                if (dbPromise) {
                    dbPromise.then(db => db.close()).catch(() => { });
                    dbPromise = null;
                }
            },
            terminated() {
                console.error('[DB] CONNECTION TERMINATED UNEXPECTEDLY');
                dbPromise = null;
            }
        });

        try {
            const db = await Promise.race([openPromise, timeoutPromise]);
            // Connection successful

            return db;
        } catch (err) {
            console.error("[DB] Critical Failure:", err);
            dbPromise = null; // Reset promise so next attempt can retry
            throw err;
        }
    })();

    return dbPromise;
};

async function migrateToVersion20(transaction: any) {
    const invoiceStore = transaction.objectStore('invoices');
    let invoices = await invoiceStore.getAll();
    for (const inv of invoices) {
        if (inv.totalAmount < 0) {
            inv.totalAmount = Math.abs(inv.totalAmount);
            await invoiceStore.put(inv);
        }
    }
}

const round2 = (value: number): number =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toIsoSafe = (value?: string): string => {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
};

const inferBackfillPurpose = (payment: CustomerPayment): CustomerReceiptSnapshot['paymentPurpose'] => {
    const note = (payment.notes || '').toLowerCase();
    if (note.includes('exam')) return 'EXAM_PAYMENT';
    if ((payment.reference || '').toUpperCase().startsWith('INV')) return 'INVOICE_PAYMENT';
    if ((payment.reference || '').toUpperCase().startsWith('RCPT')) return 'POS_PAYMENT';
    if ((payment.allocations || []).length > 0) return 'INVOICE_PAYMENT';
    if ((payment.excessHandling === 'Wallet') || Number(payment.walletDeposit || payment.overpaymentAmount || 0) > 0) {
        return 'WALLET_TOPUP';
    }
    return 'UNALLOCATED_PAYMENT';
};

const buildBackfilledReceiptSnapshot = (payment: CustomerPayment): CustomerReceiptSnapshot => {
    const rawAllocations = (payment.allocations || []).map((allocation: any) => ({
        invoiceId: allocation.invoiceId,
        allocationAmount: round2(allocation.amount),
        outstandingAmount: round2(allocation.amount)
    }));

    const legacyChange = round2(
        payment.changeGiven ??
        (payment.excessHandling === 'Change' ? (payment.excessAmount || 0) : 0)
    );
    const legacyWallet = round2(
        payment.walletDeposit ??
        payment.overpaymentAmount ??
        (payment.excessHandling === 'Wallet' ? (payment.excessAmount || 0) : 0)
    );
    const amountTendered = round2(payment.amount || 0);
    let remainingTendered = amountTendered;
    const allocations = rawAllocations.map((allocation: any) => {
        const clampedAmount = round2(Math.max(0, Math.min(allocation.allocationAmount, remainingTendered)));
        remainingTendered = round2(Math.max(0, remainingTendered - clampedAmount));
        return {
            ...allocation,
            allocationAmount: clampedAmount
        };
    }).filter((allocation: any) => allocation.allocationAmount > 0);
    const fallbackAmountApplied = round2(
        payment.amountApplied ??
        allocations.reduce((sum: number, allocation: any) => sum + allocation.allocationAmount, 0)
    );
    const fallbackAmountRetained = round2(
        payment.amountRetained ??
        Math.max(0, amountTendered - legacyChange)
    );

    let calculated: CustomerReceiptSnapshot;
    try {
        calculated = calculateCustomerPaymentSnapshot({
            amountTendered,
            appliedInvoices: allocations,
            excessHandling: legacyWallet > 0 ? 'Wallet' : (legacyChange > 0 ? 'Change' : undefined),
            paymentPurpose: inferBackfillPurpose(payment),
            paymentDate: payment.date,
            customerName: payment.customerName
        });
    } catch {
        const fallbackApplied = round2(Math.min(fallbackAmountApplied, amountTendered));
        const fallbackRetained = round2(Math.max(0, amountTendered - legacyChange));
        const fallbackInvoiceTotal = round2(payment.invoiceTotal ?? fallbackApplied);
        const fallbackBalance = round2(Math.max(0, fallbackInvoiceTotal - fallbackApplied));
        calculated = {
            generatedAt: toIsoSafe(payment.date),
            paymentPurpose: inferBackfillPurpose(payment),
            amountTendered,
            amountApplied: fallbackApplied,
            changeGiven: legacyChange,
            walletDeposit: legacyWallet,
            amountRetained: fallbackRetained,
            invoiceTotalAtPosting: fallbackInvoiceTotal,
            balanceDueAfterPayment: fallbackBalance,
            appliedInvoices: allocations.map((allocation: any) => allocation.invoiceId),
            paymentStatus: legacyWallet > 0 ? 'OVERPAID' : (fallbackBalance > 0 ? 'PARTIALLY PAID' : 'PAID'),
            backfilled: true,
            confidence: 'estimated',
            calculationVersion: 1
        };
    }

    const invoiceTotalAtPosting = round2(
        payment.invoiceTotal ??
        calculated.invoiceTotalAtPosting
    );
    const amountApplied = round2(payment.amountApplied ?? fallbackAmountApplied);
    const balanceDueAfterPayment = round2(
        payment.balanceDue ??
        Math.max(0, invoiceTotalAtPosting - amountApplied)
    );
    const walletDeposit = round2(
        payment.walletDeposit ??
        payment.overpaymentAmount ??
        calculated.walletDeposit
    );
    const changeGiven = round2(payment.changeGiven ?? (walletDeposit > 0 ? 0 : calculated.changeGiven));
    const amountRetained = round2(payment.amountRetained ?? fallbackAmountRetained);
    const paymentStatus = payment.paymentStatus ??
        (walletDeposit > 0
            ? 'OVERPAID'
            : (amountApplied >= invoiceTotalAtPosting - 0.01 ? 'PAID' : 'PARTIALLY PAID'));

    return {
        ...calculated,
        generatedAt: toIsoSafe(payment.date),
        paymentPurpose: inferBackfillPurpose(payment),
        amountApplied,
        changeGiven,
        walletDeposit,
        amountRetained,
        invoiceTotalAtPosting,
        balanceDueAfterPayment,
        paymentStatus,
        appliedInvoices: allocations.map((allocation: any) => allocation.invoiceId),
        backfilled: true,
        confidence: payment.invoiceTotal !== undefined || payment.amountApplied !== undefined ? 'exact' : 'estimated',
        narrative: payment.receiptSnapshot?.narrative,
        calculationVersion: payment.calculationVersion || 1
    };
};

async function migrateToVersion24(transaction: any) {
    const paymentStore = transaction.objectStore('customerPayments');
    const payments: CustomerPayment[] = await paymentStore.getAll();

    for (const payment of payments) {
        const hasSnapshot = !!payment.receiptSnapshot;
        const snapshot = hasSnapshot
            ? {
                ...payment.receiptSnapshot!,
                backfilled: payment.receiptSnapshot?.backfilled ?? false,
                confidence: payment.receiptSnapshot?.confidence || 'exact',
                calculationVersion: payment.receiptSnapshot?.calculationVersion || payment.calculationVersion || 1
            }
            : buildBackfilledReceiptSnapshot(payment);

        const updated: CustomerPayment = {
            ...payment,
            receiptSnapshot: snapshot,
            invoiceTotal: payment.invoiceTotal ?? snapshot.invoiceTotalAtPosting,
            paymentStatus: payment.paymentStatus ?? snapshot.paymentStatus,
            balanceDue: payment.balanceDue ?? snapshot.balanceDueAfterPayment,
            overpaymentAmount: payment.overpaymentAmount ?? snapshot.walletDeposit,
            walletDeposit: payment.walletDeposit ?? snapshot.walletDeposit,
            changeGiven: payment.changeGiven ?? snapshot.changeGiven,
            amountApplied: payment.amountApplied ?? snapshot.amountApplied,
            amountRetained: payment.amountRetained ?? snapshot.amountRetained,
            calculationVersion: payment.calculationVersion ?? snapshot.calculationVersion ?? 1
        };

        await paymentStore.put(updated);
    }
}

export const dbService = {
    // Added initDB to the dbService object to fix property access error in AuthContext
    initDB,

    setSyncListener(cb: (status: SyncStatus) => void) {
        onSyncStateChange = cb;
        cb(fileHandle ? 'connected' : 'idle');
    },

    async executeAtomicOperation<T>(stores: (keyof NexusDB)[], operation: (tx: any) => Promise<T>): Promise<T> {
        return withDbRecovery(async (db) => {
            const tx = db.transaction(stores as any, 'readwrite');
            try {
                const result = await operation(tx);
                await tx.done;
                emitDataChange(stores.map((store) => String(store)));
                return result;
            } catch (err) {
                console.error("Atomic transaction failed. Data rolled back locally.", err);
                if (isRecoverableDbConnectionError(err)) {
                    await resetDbConnection(db);
                }
                throw err;
            }
        });
    },

    async connectToLocalFile(): Promise<boolean> {
        if (!('showSaveFilePicker' in window)) {
            alert("WebUSB/WebFS restricted. Local backup service disabled.");
            return false;
        }
        
        // Extract company name for file naming
        let companyName = 'PrimeBOOKS';
        try {
            const configStr = localStorage.getItem('nexus_company_config');
            if (configStr) {
                const config = JSON.parse(configStr);
                if (config.companyName) {
                    companyName = config.companyName.replace(/[^a-zA-Z0-9_\-]/g, '_');
                }
            }
        } catch (e) {
            // Ignore parse errors, fallback to default
        }

        try {
            fileHandle = await (window as any).showSaveFilePicker({
                suggestedName: `${companyName}_Vault_${new Date().toISOString().split('T')[0]}.db`,
                types: [{ description: 'ERP Backup', accept: { 'application/octet-stream': ['.db'] } }],
            });
            notifySyncState('connected');
            await this.triggerSync(true);
            return true;
        } catch (error: any) {
            console.error("Sync connection cancelled", error);
            notifySyncState('restricted');
            return false;
        }
    },

    async triggerSync(immediate: boolean = false) {
        if (!fileHandle) return;
        if (saveTimer) clearTimeout(saveTimer);

        const delay = immediate ? 0 : 5000;
        notifySyncState('syncing');

        saveTimer = setTimeout(async () => {
            if (isSaving) {
                this.triggerSync();
                return;
            }

            isSaving = true;
            try {
                const blob = await this.exportDatabase();
                const writable = await (fileHandle as any).createWritable();
                await writable.write(blob);
                await writable.close();
                notifySyncState('connected');
                localStorage.setItem('nexus_last_sync', new Date().toISOString());
            } catch (err) {
                console.error("Auto-sync failed:", err);
                notifySyncState('error');
            } finally {
                isSaving = false;
            }
        }, delay);
    },

    async getAll<T>(storeName: keyof NexusDB): Promise<T[]> {
        return withDbRecovery(async (db) => {
            if (!db.objectStoreNames.contains(storeName as any)) {
                console.warn(`Object store "${storeName}" not found in IndexedDB.`);
                return [];
            }
            return db.getAll(storeName as any) as Promise<T[]>;
        });
    },

    async get<T>(storeName: keyof NexusDB, id: string): Promise<T | undefined> {
        return withDbRecovery(async (db) => {
            if (!db.objectStoreNames.contains(storeName as any)) {
                console.warn(`Object store "${storeName}" not found in IndexedDB.`);
                return undefined;
            }
            return db.get(storeName as any, id) as Promise<T | undefined>;
        });
    },

    async put<T>(storeName: keyof NexusDB, item: T): Promise<string> {
        return withDbRecovery(async (db) => {
            if (typeof item === 'object' && item !== null) {
                (item as any)._updatedAt = new Date().toISOString();
            }
            const res = await db.put(storeName as any, item as any);
            this.triggerSync();
            emitDataChange([String(storeName)]);
            return res as string;
        });
    },

    async getSetting<T>(key: string): Promise<T | undefined> {
        try {
            return withDbRecovery(async (db) => {
                if (!db.objectStoreNames.contains('settings')) return undefined;
                return db.get('settings', key);
            });
        } catch (e) {
            console.warn("[DB] Error getting setting:", key, e);
            return undefined;
        }
    },

    async saveSetting<T>(key: string, value: T): Promise<void> {
        await withDbRecovery(async (db) => {
            await db.put('settings', { id: key, ...value as any });
            this.triggerSync();
            emitDataChange(['settings']);
        });
    },

    async factoryReset() {
        const db = await initDB();
        db.close();
        await deleteDB(DB_NAME);
        localStorage.clear();
        dbPromise = null;
    },

    async delete(storeName: keyof NexusDB, id: string): Promise<void> {
        await withDbRecovery(async (db) => {
            await db.delete(storeName as any, id);
            this.triggerSync();
            emitDataChange([String(storeName)]);
        });
    },

    async saveFile(file: File): Promise<string> {
        const id = `FILE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        return withDbRecovery(async (db) => {
            await db.put('files', {
                id,
                blob: file,
                name: file.name,
                type: file.type,
                created: new Date().toISOString()
            });
            return id;
        });
    },

    async getFile(id: string): Promise<string | null> {
        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            if (!fileRecord) return null;
            return URL.createObjectURL(fileRecord.blob);
        });
    },

    async getFileBlob(id: string): Promise<Blob | null> {
        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            return fileRecord?.blob || null;
        });
    },

    async downloadBackupManual() {
        const blob = await this.exportDatabase();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Extract company name for file naming
        let companyName = 'PrimeBOOKS';
        try {
            const configStr = localStorage.getItem('nexus_company_config');
            if (configStr) {
                const config = JSON.parse(configStr);
                if (config.companyName) {
                    companyName = config.companyName.replace(/[^a-zA-Z0-9_\-]/g, '_');
                }
            }
        } catch (e) {
            // Ignore parse errors, fallback to default
        }

        link.download = `${companyName}_Manual_Backup_${new Date().toISOString().split('T')[0]}.db`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
    },

    async exportDatabase(): Promise<Blob> {
        const db = await initDB();
        const exportData: any = {
            meta: { version: DB_VERSION, date: new Date().toISOString(), app: 'Prime ERP' },
            data: {},
            settings: {}
        };

        for (const store of STORE_NAMES) {
            if (db.objectStoreNames.contains(store as any)) {
                exportData.data[store] = await db.getAll(store as any);
            } else {
                exportData.data[store] = [];
            }
        }

        // Export all local storage settings dynamically to ensure nothing is missed
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const val = localStorage.getItem(key);
                if (val !== null && val !== undefined) {
                    exportData.settings[key] = val;
                }
            }
        }

        return new Blob([JSON.stringify(exportData)], { type: 'application/octet-stream' });
    },

    async importDatabase(jsonData: string): Promise<void> {
        const db = await initDB();
        const parsed = JSON.parse(jsonData);

        const tx = db.transaction(db.objectStoreNames, 'readwrite');
        for (const store of STORE_NAMES) {
            if (!db.objectStoreNames.contains(store as any)) continue;
            const objectStore = tx.objectStore(store as any);
            await objectStore.clear();
            const items = parsed.data[store];
            if (Array.isArray(items)) {
                for (const item of items) {
                    await objectStore.put(item);
                }
            }
        }
        await tx.done;

        if (parsed.settings && typeof parsed.settings === 'object') {
            Object.entries(parsed.settings).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    localStorage.setItem(key, value);
                }
            });
        }

        localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
    },

    async checkIntegrity(): Promise<{ healthy: boolean; issues: string[] }> {
        const db = await initDB();
        const issues: string[] = [];

        STORE_NAMES.forEach(store => {
            if (!db.objectStoreNames.contains(store as any)) {
                issues.push(`Missing object store: ${store} `);
            }
        });

        return {
            healthy: issues.length === 0,
            issues
        };
    },

    async performAutoBackup() {
        try {
            const blob = await this.exportDatabase();
            // In a real browser environment, we might save to IndexedDB or a specific "backups" store
            // For this offline-first app, we'll keep a copy in a special 'backups' store if it exists
            // or just log that it's ready.
            localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
            // Auto-backup generated
        } catch (err) {
            console.error("[DB] Auto-backup failed:", err);
        }
    }
};
