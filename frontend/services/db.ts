import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import {
    Item, Warehouse, Purchase, Sale, Quotation, JobOrder, CustomerPayment, BillOfMaterial, ProductionBatch, WorkOrder, WorkCenter, ProductionResource, Account, LedgerEntry, Invoice, RecurringInvoice, Expense, Income, ScheduledPayment, WalletTransaction, DeliveryNote, Budget, Transfer, Employee, PayrollRun, Payslip, User, ResourceAllocation, GoodsReceipt, UserRole, SMSCampaign, Subscriber, SMSTemplate, Cheque, Shipment, SubcontractOrder, MaintenanceLog, AuditLogEntry, SystemAlert, Reminder, ExamJob, ExamPaper, ExamPrintingBatch, School, Customer, Supplier, SupplierPayment, Order, PurchaseAllocation, VatTransaction, VatReturn, BOMTemplate, MarketAdjustment, MarketAdjustmentTransaction, UserGroup, MaterialCategory, WarehouseInventory, MaterialBatch, InventoryTransaction, MaterialReservation, RoundingLog, ExaminationJob, ExaminationJobSubject, ExaminationInvoiceGroup, ExaminationRecurringProfile, ExaminationInventoryDeduction, CustomerReceiptSnapshot, ExaminationBatchNotification, NotificationAuditLog, SalesOrder, JobTicket, JobTicketSettings
} from '../types';
import { calculateCustomerPaymentSnapshot } from './receiptCalculationService';
import { resetEnterpriseDatabase } from './dexie/database';
import { isBackedStore, dexieBridge } from './dexie/bridge';
import { settingsBackplane } from './dexie/settings-backplane';
import type { BackedLegacyStoreName } from './dexie/bridge';
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
import { cloudDb } from './cloudDb';
import { isCloudOnlyMode, isSupabaseConfigured, requireCloudSessionMessage } from './cloudMode';

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
    tasks: { key: string; value: any };
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
const DB_VERSION = 33;

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

/* ───────── Multi-tenant company isolation ───────── */
let currentCompanyId = '';

export function setCurrentCompanyId(id: string) {
  currentCompanyId = id || '';
  cloudDb.setActiveCompanyId(currentCompanyId || null);
}

function stampCompanyId<T>(item: T): T {
  if (currentCompanyId && typeof item === 'object' && item !== null) {
    (item as any)._companyId = currentCompanyId;
  }
  return item;
}

async function stampAllRecordsWithCompany(companyId: string): Promise<void> {
  if (!companyId) return;
  const companyStores = STORE_NAMES.filter(s => s !== 'settings' && s !== 'syncOutbox' && s !== 'idempotencyKeys');
  const db = await initDB();
  const tx = db.transaction(companyStores as any, 'readwrite');
  for (const store of companyStores) {
    const objectStore = tx.objectStore(store as any);
    let cursor = await objectStore.openCursor();
    while (cursor) {
      const record = cursor.value as any;
      if (!record._companyId) {
        record._companyId = companyId;
        cursor.update(record);
      }
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function getCurrentCompanyId(): Promise<string> {
  if (currentCompanyId) return currentCompanyId;
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.companyId) {
        currentCompanyId = cfg.companyId;
      }
    }
  } catch { /* ignore */ }
  return currentCompanyId;
}
/* ───────── End multi-tenant ───────── */

const isRecoverableDbConnectionError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    if (error.name === 'VersionError' || error.name === 'InvalidStateError') return true;
    if (error.name === 'AbortError') return true;

    const message = String(error.message || '').toLowerCase();
    return message.includes('database connection is closing')
        || message.includes('connection is closing')
        || message.includes('connection is closed');
};

const resetDbConnection = async (db?: IDBPDatabase<NexusDB> | null) => {
    try {
        db?.close();
    } catch (err) {
        console.warn('[DB] Error closing connection:', err);
    }
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

const RXDB_COLLECTION_BY_STORE: Partial<Record<keyof NexusDB, string>> = {
    inventory: 'products',
    customers: 'customers',
    suppliers: 'suppliers',
    invoices: 'invoices',
    workCenters: 'workCenters',
    resources: 'productionResources',
    auditLogs: 'auditLogs',
    examinationBatchNotifications: 'notifications'
};

const LEGACY_DATABASE_NAMES = [
    'PrimeERP_Final_v3_Clean',
    'PrimeERP_Production_v1',
    'PrimeERP_OfflineFirst',
    'PrimeERP_Examination_v1'
] as const;
const lastRouteHealthAt = new Map<string, number>();

const getRouteDecision = (_storeName: keyof NexusDB) => ({
    id: 'dexie',
    mode: 'dexie' as const,
    readOrder: ['dexie', 'legacy'] as Array<'dexie' | 'legacy' | 'rxdb'>,
    writeTargets: ['dexie'] as Array<'dexie' | 'legacy' | 'rxdb'>,
});

const trackRouteHealthy = async (_storeName: keyof NexusDB | 'settings') => {};

const trackRouteError = async (_storeName: keyof NexusDB | 'settings', _error: unknown, _fallbackReason?: string) => {};

const mergeByIdentifier = <T>(...sources: T[][]): T[] => {
    const keyed = new Map<string, T>();
    const passthrough: T[] = [];

    sources.forEach((rows) => {
        rows.forEach((row) => {
            const candidate = row as any;
            const key = String(candidate?.id ?? candidate?.key ?? '');
            if (!key) {
                passthrough.push(row);
                return;
            }
            if (!keyed.has(key)) {
                keyed.set(key, row);
            }
        });
    });

    return [...keyed.values(), ...passthrough];
};

const extractLegacySettingValue = <T>(value: any): T | undefined => {
    if (value === undefined || value === null) {
        return value as T | undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return value as T;
    }

    if ('value' in value && Object.keys(value).every((key) => key === 'id' || key === 'value')) {
        return value.value as T;
    }

    if ('id' in value) {
        const { id: _unused, ...rest } = value as Record<string, unknown>;
        return rest as T;
    }

    return value as T;
};

const shapeLegacySettingRecord = (key: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const { id: _unused, ...safeValue } = value as Record<string, unknown>;
        return { id: key, ...safeValue };
    }

    return { id: key, value };
};

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
            if (!isCloudOnlyMode()) {
                localStorage.setItem(DATA_CHANGED_EVENT, JSON.stringify(payload));
            }
        }
    } catch (err) {
        console.warn('[DB] Failed to dispatch data change event:', err);
    }
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            if (!dataChangeChannel) {
                dataChangeChannel = new BroadcastChannel(DATA_CHANGED_CHANNEL);
            }
            dataChangeChannel.postMessage(payload);
        }
    } catch (err) {
        console.warn('[DB] Failed to broadcast data change:', err);
    }
};

const getAllFromLegacyStore = async <T>(storeName: keyof NexusDB): Promise<T[]> => withDbRecovery(async (db) => {
    if (!db.objectStoreNames.contains(storeName as any)) {
        console.warn(`Object store "${storeName}" not found in IndexedDB.`);
        return [];
    }
    const all = await db.getAll(storeName as any) as T[];
    const cid = await getCurrentCompanyId();
    if (!cid) return [];
    return all.filter((item: any) => {
        const recordCompany = item?._companyId;
        return !recordCompany || recordCompany === cid;
    });
});

const getFromLegacyStore = async <T>(storeName: keyof NexusDB, id: string): Promise<T | undefined> => withDbRecovery(async (db) => {
    if (!db.objectStoreNames.contains(storeName as any)) {
        console.warn(`Object store "${storeName}" not found in IndexedDB.`);
        return undefined;
    }
    const record = await db.get(storeName as any, id) as T | undefined;
    if (!record) return undefined;
    const cid = await getCurrentCompanyId();
    if (!cid) return undefined;
    const recordCompany = (record as any)?._companyId;
    if (recordCompany && recordCompany !== cid) return undefined;
    return record;
});

const putToLegacyStore = async <T>(storeName: keyof NexusDB, item: T): Promise<string> => withDbRecovery(async (db) => {
    stampCompanyId(item);
    const result = await db.put(storeName as any, item as any);
    return result as string;
});

const deleteFromLegacyStore = async (storeName: keyof NexusDB, id: string): Promise<void> => {
    await withDbRecovery(async (db) => {
        if (!db.objectStoreNames.contains(storeName as any)) {
            return;
        }
        await db.delete(storeName as any, id);
    });
};

const SUPABASE_CONFIGURED = isSupabaseConfigured;

const LOCAL_ONLY_STORES = new Set([
  'syncOutbox', 'files', 'idempotencyKeys',
  'customerNotificationLogs',
  'whatsappChats', 'whatsappTemplates', 'whatsappCampaigns', 'whatsappAutomations',
  'alerts', 'reminders', 'auditLogs'
]);

const shouldUseCloud = () => {
  return SUPABASE_CONFIGURED();
};

const writeSyncOutbox = async (entityId: string, type: string, payload: any) => {
  if (!SUPABASE_CONFIGURED()) return;
  try {
    await putToLegacyStore('syncOutbox', {
      id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId,
      type,
      payload,
      date: new Date().toISOString()
    });
  } catch {
    // outbox logging is best-effort
  }
};

const getSettingFromLegacyStore = async <T>(key: string): Promise<T | undefined> => withDbRecovery(async (db) => {
    if (!db.objectStoreNames.contains('settings')) return undefined;
    const value = await db.get('settings', key);
    return extractLegacySettingValue<T>(value);
});

const saveSettingToLegacyStore = async <T>(key: string, value: T): Promise<void> => {
    await withDbRecovery(async (db) => {
        const record = shapeLegacySettingRecord(key, value);
        await db.put('settings', record);
    });
};

const STORE_NAMES: (keyof NexusDB)[] = [
    'inventory', 'warehouses', 'purchases', 'sales',
    'quotations', 'jobOrders', 'customerPayments', 'boms', 'bomTemplates', 'marketAdjustments', 'marketAdjustmentTransactions', 'batches',
    'workOrders', 'jobTickets', 'jobTicketSettings', 'workCenters', 'resources', 'resourceAllocations',
    'accounts', 'ledger', 'invoices', 'recurringInvoices',
    'expenses', 'income', 'scheduledPayments',
    'walletTransactions', 'deliveryNotes', 'budgets', 'cheques',
    'transfers', 'employees', 'payrollRuns', 'payslips', 'tasks',
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
    await new Promise<void>((resolve, reject) => {
        const request = invoiceStore.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const inv = cursor.value;
                if (inv.totalAmount < 0) {
                    inv.totalAmount = Math.abs(inv.totalAmount);
                    cursor.update(inv);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
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
    await new Promise<void>((resolve, reject) => {
        const request = paymentStore.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const payment: CustomerPayment = cursor.value;
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

                cursor.update(updated);
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export const dbService = {
    // Added initDB to the dbService object to fix property access error in AuthContext
    initDB,

    setCurrentCompanyId,
    stampAllRecordsWithCompany,
    getCurrentCompanyId,

    setSyncListener(cb: (status: SyncStatus) => void) {
        onSyncStateChange = cb;
        if (isCloudOnlyMode()) {
            cb('connected');
            return;
        }
        cb(fileHandle ? 'connected' : 'idle');
    },

    async executeAtomicOperation<T>(stores: (keyof NexusDB)[], operation: (tx: any) => Promise<T>): Promise<T> {
        if (isCloudOnlyMode()) {
            const cloudTx = {
                objectStore: (storeName: string) => ({
                    put: (item: any) => this.put(storeName, item),
                    get: (id: string) => this.get(storeName, id),
                    getAll: () => this.getAll(storeName),
                    delete: (id: string) => this.delete(storeName, id),
                }),
                done: Promise.resolve(),
            };
            return operation(cloudTx);
        }
        return withDbRecovery(async (db) => {
            const tx = db.transaction(stores as any, 'readwrite');
            try {
                const result = await operation(tx);
                await tx.done;
                emitDataChange(stores.map((store) => String(store)));
                return result;
            } catch (err) {
                console.error("Atomic transaction failed. Data rolled back locally.", err);
                try { tx.abort(); } catch (_) { /* ignore abort errors */ }
                if (isRecoverableDbConnectionError(err)) {
                    await resetDbConnection(db);
                }
                throw err;
            }
        });
    },

    async connectToLocalFile(): Promise<boolean> {
        if (isCloudOnlyMode()) {
            notifySyncState('restricted');
            return false;
        }
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
        if (isCloudOnlyMode()) return;
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
        if (isCloudOnlyMode() && String(storeName) !== 'syncOutbox') {
            const cloudValues = await cloudDb.getAll<T>(String(storeName));
            return cloudValues || [];
        }

        // Cloud-primary: read from Supabase first when online
        if (shouldUseCloud() && !LOCAL_ONLY_STORES.has(String(storeName))) {
            try {
                const cloudValues = await cloudDb.getAll<T>(String(storeName));
                if (cloudValues !== null && cloudValues.length > 0) {
                    for (const item of cloudValues) {
                        try { await putToLegacyStore(storeName, item as any); } catch { }
                    }
                    return cloudValues;
                }
            } catch (err) {
                console.warn(`[DB] Cloud getAll failed for ${String(storeName)}, falling back to local:`, err);
            }
        }

        const route = getRouteDecision(storeName);
        if (!route || !isBackedStore(String(storeName))) {
            return getAllFromLegacyStore<T>(storeName);
        }

        const sourceStore = storeName as BackedLegacyStoreName;
        let rxRows: T[] = [];
        let legacyRows: T[] = [];

        if (route.readOrder.includes('rxdb')) {
            try {
                rxRows = await dexieBridge.getAll(sourceStore) as T[];
                void trackRouteHealthy(storeName);
            } catch (error) {
                void trackRouteError(storeName, error);
            }
        }

        if (route.readOrder.includes('legacy')) {
            legacyRows = await getAllFromLegacyStore<T>(storeName);
        }

        if (route.readOrder[0] === 'rxdb') {
            return mergeByIdentifier(rxRows, legacyRows);
        }

        return mergeByIdentifier(legacyRows, rxRows);
    },

    async get<T>(storeName: keyof NexusDB, id: string): Promise<T | undefined> {
        if (isCloudOnlyMode() && String(storeName) !== 'syncOutbox') {
            const cloudValue = await cloudDb.get<T>(String(storeName), id);
            return cloudValue ?? undefined;
        }

        // Cloud-primary: read from Supabase first when online
        if (shouldUseCloud() && !LOCAL_ONLY_STORES.has(String(storeName))) {
            try {
                const cloudValue = await cloudDb.get<T>(String(storeName), id);
                if (cloudValue !== null) {
                    await putToLegacyStore(storeName, cloudValue as any);
                    return cloudValue;
                }
            } catch (err) {
                console.warn(`[DB] Cloud read failed for ${String(storeName)}/${id}, falling back to local:`, err);
            }
        }

        const route = getRouteDecision(storeName);
        if (!route || !isBackedStore(String(storeName))) {
            return getFromLegacyStore<T>(storeName, id);
        }

        const sourceStore = storeName as BackedLegacyStoreName;
        for (const source of route.readOrder) {
            if (source === 'rxdb') {
                try {
                    const value = await dexieBridge.get(sourceStore, id) as T | undefined;
                    if (value !== undefined) {
                        void trackRouteHealthy(storeName);
                        return value;
                    }
                } catch (error) {
                    void trackRouteError(storeName, error);
                }
                continue;
            }

            const legacyValue = await getFromLegacyStore<T>(storeName, id);
            if (legacyValue !== undefined) {
                return legacyValue;
            }
        }

        return undefined;
    },

    async put<T>(storeName: keyof NexusDB, item: T): Promise<string> {
        if (typeof item === 'object' && item !== null) {
            (item as any)._updatedAt = new Date().toISOString();
        }

        const isFromCloud = (item as any)?._cloudSource === true;
        if (isCloudOnlyMode() && String(storeName) !== 'syncOutbox') {
            if (isFromCloud) return String((item as any)?.id || '');
            const cloudId = await cloudDb.put(String(storeName), item);
            if (!cloudId) {
                await putToLegacyStore(storeName, item as any);
                return String((item as any)?.id || '');
            }
            emitDataChange([String(storeName)]);
            return cloudId;
        }

        // Cloud-primary: write to Supabase first when online (skip if data is already from cloud)
        if (shouldUseCloud() && !isFromCloud && !LOCAL_ONLY_STORES.has(String(storeName))) {
            try {
                const cloudId = await cloudDb.put(String(storeName), item);
                if (cloudId) {
                    await putToLegacyStore(storeName, { ...(item as any), _cloudSource: undefined });
                    emitDataChange([String(storeName)]);
                    return cloudId;
                }
            } catch (err) {
                console.warn(`[DB] Cloud write failed for ${String(storeName)}, falling back to local:`, err);
            }
        }

        const route = getRouteDecision(storeName);
        if (!route || !isBackedStore(String(storeName))) {
            const result = await putToLegacyStore(storeName, item);
            if (!shouldUseCloud()) {
                writeSyncOutbox(String((item as any)?.id || result), `${String(storeName)}:upsert`, item);
            }
            this.triggerSync();
            emitDataChange([String(storeName)]);
            return result;
        }

        const sourceStore = storeName as BackedLegacyStoreName;
        let resultId = String((item as any)?.id || '');
        let persisted = false;

        if (route.writeTargets.includes('rxdb')) {
            try {
                resultId = await dexieBridge.put(sourceStore, item);
                persisted = true;
                await trackRouteHealthy(storeName);
            } catch (error) {
                await trackRouteError(
                    storeName,
                    error,
                    route.writeTargets.includes('legacy') ? undefined : `Fell back to legacy write for ${String(storeName)}.`
                );
            }
        }

        if (route.writeTargets.includes('legacy') || !persisted) {
            resultId = await putToLegacyStore(storeName, item);
            persisted = true;
        }

        if (!shouldUseCloud()) {
            writeSyncOutbox(resultId, `${String(storeName)}:upsert`, item);
        }
        this.triggerSync();
        emitDataChange([String(storeName)]);
        return resultId;
    },

    async getSetting<T>(key: string): Promise<T | undefined> {
        if (isCloudOnlyMode()) {
            const cloudValue = await cloudDb.getSetting<T>(key);
            return cloudValue ?? undefined;
        }

        // Cloud-primary: read settings from Supabase first when online
        if (shouldUseCloud()) {
            try {
                const cloudValue = await cloudDb.getSetting<T>(key);
                if (cloudValue !== null) {
                    try { await settingsBackplane.setJson(key, cloudValue, { exactKey: true }); } catch { }
                    try { await saveSettingToLegacyStore(key, cloudValue); } catch { }
                    return cloudValue;
                }
            } catch (err) {
                console.warn(`[DB] Cloud getSetting failed for ${key}, falling back to local:`, err);
            }
        }

        try {
            const value = await settingsBackplane.getJson<T>(key, { exactKey: true });
            if (value !== undefined) return value;
            return getSettingFromLegacyStore<T>(key);
        } catch (e) {
            console.warn("[DB] Error getting setting:", key, e);
            return undefined;
        }
    },

    async saveSetting<T>(key: string, value: T): Promise<void> {
        if (isCloudOnlyMode()) {
            const saved = await cloudDb.saveSetting<T>(key, value);
            if (saved === null) {
                throw new Error(requireCloudSessionMessage);
            }
            emitDataChange(['settings']);
            return;
        }

        // Cloud-primary: write settings to Supabase first when online
        if (shouldUseCloud()) {
            try {
                await cloudDb.saveSetting<T>(key, value);
            } catch (err) {
                console.warn(`[DB] Cloud saveSetting failed for ${key}, falling back to local:`, err);
            }
        }

        try {
            await settingsBackplane.setJson(key, value, { exactKey: true });
        } catch (error) {
            console.warn("[DB] Error saving setting:", key, error);
        }
        this.triggerSync();
        emitDataChange(['settings']);
    },

    async factoryReset() {
        if (isCloudOnlyMode()) {
            try {
                sessionStorage.clear();
            } catch {
                // Ignore session storage cleanup failures.
            }
            return;
        }

        const db = await initDB();
        db.close();
        dbPromise = null;

        const [productionModule, examinationModule, offlineModule] = await Promise.all([
            import('./productionDb'),
            import('./examinationDb'),
            import('./offlineDb')
        ]);

        productionModule.getProductionDb()?.close();
        examinationModule.getExaminationDb()?.close();
        await offlineModule.closeOfflineDbConnection?.();

        await resetEnterpriseDatabase().catch(() => undefined);
        await Promise.all(LEGACY_DATABASE_NAMES.map((name) => deleteDB(name).catch(() => undefined)));

        try {
            localStorage.clear();
        } catch {
            const appPrefixes = ['nexus_', 'prime_', 'db_', 'user_', 'auth_', 'finance_', 'sales_'];
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && appPrefixes.some(prefix => key.startsWith(prefix))) {
                    localStorage.removeItem(key);
                }
            }
        }

        try {
            sessionStorage.clear();
        } catch {
            // Ignore session storage cleanup failures.
        }

        dbPromise = null;
    },

    async delete(storeName: keyof NexusDB, id: string): Promise<void> {
        if (isCloudOnlyMode() && String(storeName) !== 'syncOutbox') {
            const cloudResult = await cloudDb.delete(String(storeName), id);
            if (!cloudResult) {
                throw new Error(requireCloudSessionMessage);
            }
            emitDataChange([String(storeName)]);
            return;
        }

        // Cloud-primary: delete from Supabase first when online
        if (shouldUseCloud() && !LOCAL_ONLY_STORES.has(String(storeName))) {
            try {
                const cloudResult = await cloudDb.delete(String(storeName), id);
                if (cloudResult) {
                    await deleteFromLegacyStore(storeName, id);
                    emitDataChange([String(storeName)]);
                    return;
                }
            } catch (err) {
                console.warn(`[DB] Cloud delete failed for ${String(storeName)}/${id}, falling back to local:`, err);
            }
        }

        const route = getRouteDecision(storeName);
        if (!route || !isBackedStore(String(storeName))) {
            await deleteFromLegacyStore(storeName, id);
            if (!shouldUseCloud()) {
                writeSyncOutbox(id, `${String(storeName)}:delete`, { id });
            }
            this.triggerSync();
            emitDataChange([String(storeName)]);
            return;
        }

        const sourceStore = storeName as BackedLegacyStoreName;
        let deleted = false;

        if (route.writeTargets.includes('rxdb')) {
            try {
                await dexieBridge.delete(sourceStore, id);
                deleted = true;
                await trackRouteHealthy(storeName);
            } catch (error) {
                await trackRouteError(
                    storeName,
                    error,
                    route.writeTargets.includes('legacy') ? undefined : `Fell back to legacy delete for ${String(storeName)}.`
                );
            }
        }

        if (route.writeTargets.includes('legacy') || !deleted) {
            await deleteFromLegacyStore(storeName, id);
        }

        if (!shouldUseCloud()) {
            writeSyncOutbox(id, `${String(storeName)}:delete`, { id });
        }
        this.triggerSync();
        emitDataChange([String(storeName)]);
    },

    async saveFile(file: File): Promise<string> {
        if (isCloudOnlyMode()) {
            const fileId = await cloudDb.uploadFile(file);
            if (!fileId) throw new Error(requireCloudSessionMessage);
            return fileId;
        }

        const id = `FILE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
        if (isCloudOnlyMode()) {
            return cloudDb.createSignedFileUrl(id);
        }

        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            if (!fileRecord) return null;
            return URL.createObjectURL(fileRecord.blob);
        });
    },

    async getFileBlob(id: string): Promise<Blob | null> {
        if (isCloudOnlyMode()) {
            return cloudDb.downloadFile(id);
        }

        return withDbRecovery(async (db) => {
            const fileRecord = await db.get('files', id);
            return fileRecord?.blob || null;
        });
    },

    async downloadBackupManual() {
        if (isCloudOnlyMode()) {
            throw new Error('Manual local database backups are disabled in cloud-only mode. Use Supabase backups and exports.');
        }

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
        if (isCloudOnlyMode()) {
            throw new Error('Local database export is disabled in cloud-only mode.');
        }

        const exportData: any = {
            meta: { version: DB_VERSION, date: new Date().toISOString(), app: 'Prime ERP' },
            data: {},
            settings: {}
        };

        for (const store of STORE_NAMES) {
            exportData.data[store] = await this.getAll(store as keyof NexusDB);
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
        if (isCloudOnlyMode()) {
            throw new Error('Local database restore is disabled in cloud-only mode. Import data through Supabase migration tools.');
        }

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

        try {
            localStorage.clear();
        } catch {
            // Ignore local storage clear failures and continue restoring known keys.
        }

        if (parsed.settings && typeof parsed.settings === 'object') {
            Object.entries(parsed.settings).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    localStorage.setItem(key, value);
                }
            });
        }

        await resetEnterpriseDatabase().catch(() => undefined);
        await dexieBridge.ensureReady().catch((error) => {
            console.warn('[DB] RxDB restore rehydration failed:', error);
            return undefined;
        });

        localStorage.setItem('prime_erp_backup_date', new Date().toISOString());
    },

    async checkIntegrity(): Promise<{ healthy: boolean; issues: string[] }> {
        if (isCloudOnlyMode()) {
            return { healthy: true, issues: [] };
        }

        const db = await initDB();
        const issues: string[] = [];

        STORE_NAMES.forEach(store => {
            if (!db.objectStoreNames.contains(store as any)) {
                issues.push(`Missing object store: ${store} `);
            }
        });

        try {
            const { databaseManager } = await import('./dexie/DatabaseManager');
            const health = databaseManager.isHealthy();
            if (!health) {
                issues.push('Enterprise Dexie database reports unhealthy');
            }
        } catch (error) {
            issues.push(`Dexie diagnostics unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    },

    async performAutoBackup() {
        if (isCloudOnlyMode()) return;

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
