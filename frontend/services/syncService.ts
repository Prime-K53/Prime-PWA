import { supabase } from './supabaseClient';
import { dbService } from './db';
import { cloudDb } from './cloudDb';
import { resolveConflict, mergeRecords } from './syncConflictResolver';

const getCompanyId = (): string | null => {
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (!raw) return null;
    return JSON.parse(raw).companyId || null;
  } catch {
    return null;
  }
};

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const PUSH_INTERVAL_MS = 60000;
let pushTimer: ReturnType<typeof setInterval> | null = null;
let realtimeSubscribed = false;
let realtimeChannels: any[] = [];

const STORE_TO_TABLE: Record<string, string> = {
  inventory: 'products',
  ledger: 'ledger_entries',
  batches: 'production_batches',
  resources: 'production_resources',
  workCenters: 'work_centers',
  workOrders: 'work_orders',
  salesOrders: 'sales_orders',
  userGroups: 'user_groups',
  bomTemplates: 'bom_templates',
  bankAccounts: 'bank_accounts',
  customerPayments: 'customer_payments',
  examinationBatches: 'examination_batches',
  auditLogs: 'audit_logs',
  goodsReceipts: 'goods_receipts',
  supplierPayments: 'supplier_payments',
  resourceAllocations: 'resource_allocations',
  profitMarginSettings: 'profit_margin_settings',
  marketAdjustments: 'market_adjustments',
  materialCategories: 'material_categories',
  warehouseInventory: 'warehouse_inventory',
  materialBatches: 'material_batches',
  inventoryTransactions: 'inventory_transactions',
  materialReservations: 'material_reservations',
  bankTransactions: 'bank_transactions',
  bankStatements: 'bank_statements',
  bankScheduledPayments: 'bank_scheduled_payments',
  bankExchangeRates: 'bank_exchange_rates',
  bankFees: 'bank_fees',
  bankReconciliations: 'bank_reconciliations',
  bankAdjustments: 'bank_adjustments',
  bankCashFlowForecasts: 'bank_cash_flow_forecasts',
  bankAlerts: 'bank_alerts',
  bankCategories: 'bank_categories',
  idempotencyKeys: 'idempotency_keys',
  customerNotificationLogs: 'customer_notification_logs',
  whatsappChats: 'whatsapp_chats',
  whatsappTemplates: 'whatsapp_templates',
  whatsappCampaigns: 'whatsapp_campaigns',
  whatsappAutomations: 'whatsapp_automations',
  vatTransactions: 'vat_transactions',
  vatReturns: 'vat_returns',
  roundingLogs: 'rounding_logs',
  examinationJobs: 'examination_jobs',
  examinationJobSubjects: 'examination_job_subjects',
  examinationInvoiceGroups: 'examination_invoice_groups',
  examinationRecurringProfiles: 'examination_recurring_profiles',
  examinationInventoryDeductions: 'examination_inventory_deductions',
  examinationBatchNotifications: 'examination_batch_notifications',
  smsCampaigns: 'sms_campaigns',
  smsTemplates: 'sms_templates',
  subcontractOrders: 'subcontract_orders',
  maintenanceLogs: 'maintenance_logs',
  jobTickets: 'job_tickets',
  jobTicketSettings: 'job_ticket_settings',
  jobOrders: 'job_orders',
  examJobs: 'examination_jobs',
  examPapers: 'examination_papers',
  examPrintingBatches: 'examination_printing_batches',
  salesExchanges: 'sales_exchanges',
  salesExchangeItems: 'sales_exchange_items',
  reprintJobs: 'reprint_jobs',
  salesExchangeApprovals: 'sales_exchange_approvals',
  marketAdjustmentTransactions: 'market_adjustment_transactions',
  notificationAuditLogs: 'notification_audit_logs',
  classes: 'classes',
  subjects: 'subjects',
  recurringInvoices: 'recurring_invoices',
  scheduledPayments: 'scheduled_payments',
  walletTransactions: 'wallet_transactions',
  deliveryNotes: 'delivery_notes',
  payrollRuns: 'payroll_runs',
};

const TABLES_TO_SYNC = [
  'users', 'userGroups', 'inventory', 'warehouses', 'customers', 'suppliers',
  'sales', 'invoices', 'purchases', 'accounts', 'ledger',
  'settings', 'reminders',
  'workCenters', 'workOrders', 'batches', 'resources',
  'salesOrders', 'quotations', 'orders',
  'jobOrders', 'examJobs', 'salesExchanges', 'reprintJobs',
  'examinationBatches', 'examinationJobs',
  'bomTemplates', 'boms', 'profitMarginSettings', 'marketAdjustments',
  'bankAccounts', 'bankTransactions', 'bankStatements',
  'customerPayments', 'supplierPayments', 'goodsReceipts',
  'recurringInvoices', 'scheduledPayments', 'walletTransactions',
  'deliveryNotes', 'payrollRuns',
  'vatTransactions', 'vatReturns', 'roundingLogs',
];

const getTable = (storeName: string): string => STORE_TO_TABLE[storeName] || storeName;

async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed) return refreshed;
  } catch {
    // Refresh token expired or invalid — skip sync, fall back to local
  }
  return null;
}

/**
 * Pull all data from Supabase into local IndexedDB cache.
 * Called on initial load and when coming back online.
 */
export async function pullRemoteChanges(): Promise<{ pulled: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pulled: 0, errors: [] };

  const session = await ensureSession();
  if (!session) return { pulled: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pulled = 0;

  for (const storeName of TABLES_TO_SYNC) {
    const table = getTable(storeName);

    try {
      const companyId = getCompanyId();
      let query = supabase.from(table).select('*');
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      const { data, error } = await query.order('updated_at', { ascending: true });

      if (error) { errors.push(`${storeName}: ${error.message}`); continue; }
      if (!data || data.length === 0) continue;

      for (const record of data) {
        const { data: jsonData, updated_at, ...rest } = record;
        const cloudRecord = { id: record.id, ...rest, ...(jsonData || {}), _cloudSource: true };
        const local = await dbService.get(storeName as any, record.id);
        if (local) {
          const merged = mergeRecords(cloudRecord, local);
          await dbService.put(storeName as any, merged as any);
        } else {
          await dbService.put(storeName as any, cloudRecord as any);
        }
        pulled++;
      }
    } catch (err) {
      errors.push(`${storeName}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  if (pulled > 0) {
    localStorage.setItem('nexus_last_sync_pull', new Date().toISOString());
  }

  return { pulled, errors };
}

/**
 * Push offline-queued mutations from IndexedDB syncOutbox to Supabase.
 * Called when coming back online and periodically.
 */
export async function pushLocalChanges(): Promise<{ pushed: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pushed: 0, errors: [] };

  const session = await ensureSession();
  if (!session) return { pushed: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pushed = 0;

  const outbox = await dbService.getAll<any>('syncOutbox');
  if (outbox.length === 0) return { pushed: 0, errors: [] };

  for (const entry of outbox) {
    try {
      const [storeName, operation] = entry.type.split(':');
      const table = getTable(storeName);

      if (operation === 'delete') {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', entry.entityId);
        if (error) throw error;
      } else {
        const cleanPayload = { ...entry.payload };
        delete cleanPayload._updatedAt;
        delete cleanPayload._cloudSource;
        const companyId = cleanPayload.company_id;
        const { id, ...domainData } = cleanPayload;
        const record: Record<string, unknown> = {
          id: id || entry.entityId,
          data: domainData,
          updated_at: new Date().toISOString(),
        };
        if (companyId) {
          record.company_id = companyId;
        }
        const { error } = await supabase
          .from(table)
          .upsert(record, {
            onConflict: 'id',
            ignoreDuplicates: false,
          });
        if (error) throw error;
      }

      await dbService.delete('syncOutbox', entry.id);
      pushed++;
    } catch (err) {
      errors.push(`${entry.type}/${entry.entityId}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  if (pushed > 0) {
    localStorage.setItem('nexus_last_sync', new Date().toISOString());
  }

  return { pushed, errors };
}

export async function fullSync(): Promise<{ pulled: number; pushed: number; errors: string[] }> {
  const pushResult = await pushLocalChanges();
  const pullResult = await pullRemoteChanges();
  return {
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    errors: [...pushResult.errors, ...pullResult.errors],
  };
}

/**
 * Subscribe to real-time changes from Supabase.
 * When another device makes a change, it's pushed to all connected clients.
 */
function subscribeToRemoteChanges() {
  if (!SUPABASE_ENABLED || realtimeSubscribed) return;
  realtimeSubscribed = true;

  const companyId = getCompanyId();

  for (const storeName of TABLES_TO_SYNC) {
    const table = getTable(storeName);

    try {
      const filter: Record<string, string> = { event: '*', schema: 'public', table };
      if (companyId) {
        filter.filter = `company_id=eq.${companyId}`;
      }
      const channel = supabase
        .channel(`public:${table}`)
        .on(
          'postgres_changes',
          filter,
          async (payload: any) => {
            try {
              if (payload.eventType === 'DELETE') {
                try { await dbService.delete(storeName as any, payload.old.id); } catch {}
              } else if (payload.new) {
                const { data: jsonData, updated_at, ...rest } = payload.new;
                const cloudRecord = { id: payload.new.id, ...rest, ...(jsonData || {}), _cloudSource: true };
                const local = await dbService.get(storeName as any, payload.new.id);
                if (local) {
                  const merged = mergeRecords(cloudRecord, local);
                  await dbService.put(storeName as any, merged as any);
                } else {
                  await dbService.put(storeName as any, cloudRecord as any);
                }
              }
            } catch {
              // best-effort realtime sync
            }
          }
        )
        .subscribe();

      realtimeChannels.push(channel);
    } catch {
      // best-effort subscription setup
    }
  }
}

function unsubscribeFromRemoteChanges() {
  for (const channel of realtimeChannels) {
    try { supabase.removeChannel(channel); } catch { /* skip */ }
  }
  realtimeChannels = [];
  realtimeSubscribed = false;
}

export function startPeriodicSync(intervalMs = PUSH_INTERVAL_MS) {
  if (!SUPABASE_ENABLED) return;
  if (pushTimer) clearInterval(pushTimer);

  subscribeToRemoteChanges();

  pushTimer = setInterval(async () => {
    if (navigator.onLine) {
      const { pushed } = await pushLocalChanges().catch(() => ({ pushed: 0 }));
      if (pushed > 0) {
        console.log(`[Sync] Pushed ${pushed} offline mutations`);
      }
    }
  }, intervalMs);

  // Initial sync on start
  if (navigator.onLine) {
    fullSync().then(result => {
      if (result.pushed > 0 || result.pulled > 0) {
        console.log(`[Sync] Initial sync complete: ${result.pulled} pulled, ${result.pushed} pushed`);
      }
    }).catch(err => console.warn('[Sync] Initial sync failed:', err));
  }
}

export function stopPeriodicSync() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  unsubscribeFromRemoteChanges();
}
