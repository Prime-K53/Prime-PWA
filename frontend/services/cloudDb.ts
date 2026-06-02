import { supabase } from './supabaseClient';

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
  productionBatches: 'production_batches',
  productionResources: 'production_resources',
  goodsReceipts: 'goods_receipts',
  supplierPayments: 'supplier_payments',
  resourceAllocations: 'resource_allocations',
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

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const getTable = (storeName: string): string => STORE_TO_TABLE[storeName] || storeName;

const getCompanyId = (): string | null => {
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (!raw) return null;
    return JSON.parse(raw).companyId || null;
  } catch {
    return null;
  }
};

let authPromise: Promise<any> | null = null;

async function ensureSession(signal?: AbortSignal) {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
  } catch {
    return null;
  }
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed) return refreshed;
  } catch {
    // Refresh token expired or invalid — fall back to local operations
  }
  return null;
}

async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
  const session = await Promise.race([
    ensureSession(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
  ]);
  if (!session) return null;
  const result = await Promise.race([
    fn(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
  ]);
  return result;
}

export const cloudDb = {
  isConfigured: () => SUPABASE_ENABLED,

  async getAll<T>(storeName: string): Promise<T[] | null> {
    return withSession(async () => {
      const table = getTable(storeName);
      const companyId = getCompanyId();
      let query = supabase.from(table).select('*');
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      const { data, error } = await query.order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => {
        const { data: jsonData, updated_at, company_id, ...rest } = r;
        return { id: r.id, ...rest, ...(jsonData || {}), _companyId: company_id } as T;
      });
    });
  },

  async get<T>(storeName: string, id: string): Promise<T | null> {
    return withSession(async () => {
      const table = getTable(storeName);
      const companyId = getCompanyId();
      let query = supabase.from(table).select('*').eq('id', id);
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: jsonData, updated_at, company_id, ...rest } = data;
      return { id: data.id, ...rest, ...(jsonData || {}), _companyId: company_id } as T;
    });
  },

  async put<T>(storeName: string, item: T): Promise<string | null> {
    return withSession(async () => {
      const table = getTable(storeName);
      const companyId = getCompanyId();
      const raw = { ...(item as any) };
      delete raw._updatedAt;
      delete raw._cloudSource;
      delete raw._companyId;
      const { id, ...domainData } = raw;
      const record: Record<string, unknown> = {
        id: id || crypto.randomUUID(),
        data: domainData,
        updated_at: new Date().toISOString(),
      };
      if (companyId) {
        record.company_id = companyId;
      }
      const { data, error } = await supabase
        .from(table)
        .upsert(record, { onConflict: 'id', ignoreDuplicates: false })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id || id || null;
    });
  },

  async delete(storeName: string, id: string): Promise<boolean | null> {
    return withSession(async () => {
      const table = getTable(storeName);
      const companyId = getCompanyId();
      let query = supabase.from(table).delete().eq('id', id);
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      const { error } = await query;
      if (error) throw error;
      return true;
    });
  },

  async getSetting<T>(key: string): Promise<T | null> {
    return withSession(async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', key)
        .maybeSingle();
      if (error) throw error;
      return data?.data as T ?? null;
    });
  },

  async saveSetting<T>(key: string, value: T): Promise<void | null> {
    return withSession(async () => {
      const { error } = await supabase
        .from('settings')
        .upsert({ id: key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
    });
  },
};

export default cloudDb;
