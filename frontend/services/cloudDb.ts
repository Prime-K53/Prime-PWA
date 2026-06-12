import { supabase } from './supabaseClient';
import { isSupabaseConfigured } from './cloudMode';

export const STORE_TO_TABLE: Record<string, string> = {
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
  shipments: 'shipments',
  schools: 'schools',
  tasks: 'tasks',
};

const SUPABASE_ENABLED = isSupabaseConfigured();
const FILE_BUCKET = 'prime-erp-files';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const getTable = (storeName: string): string => STORE_TO_TABLE[storeName] || storeName;

let activeCompanyId: string | null = null;

export const setActiveCompanyId = (companyId: string | null | undefined) => {
  activeCompanyId = companyId || null;
};

const getStoredCompanyId = (): string | null => {
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (!raw) return null;
    return JSON.parse(raw).companyId || null;
  } catch {
    return null;
  }
};

const getCompanyId = async (): Promise<string | null> => {
  if (activeCompanyId) return activeCompanyId;

  const storedCompanyId = getStoredCompanyId();
  if (storedCompanyId) {
    activeCompanyId = storedCompanyId;
    return activeCompanyId;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const metadataCompanyId = user?.user_metadata?.company_id;
    if (metadataCompanyId) {
      activeCompanyId = metadataCompanyId;
      return activeCompanyId;
    }

    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.company_id) {
        activeCompanyId = profile.company_id;
        return activeCompanyId;
      }

      const { data: legacyProfile } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (legacyProfile?.company_id) {
        activeCompanyId = legacyProfile.company_id;
        return activeCompanyId;
      }
    }
  } catch {
    return null;
  }

  return null;
};

async function ensureSession(signal?: AbortSignal) {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
  } catch {
    // getSession threw — don't return null yet, try refresh below
  }
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed) return refreshed;
  } catch {
    // Refresh token expired or invalid — fall back to local operations
  }
  return null;
}

const SESSION_TIMEOUT_MS = 20_000;

async function withSession<T>(fn: () => Promise<T>): Promise<T> {
  const session = await ensureSession();
  if (!session) throw new Error('No Supabase session available');
  return fn();
}

export const cloudDb = {
  isConfigured: () => SUPABASE_ENABLED,
  setActiveCompanyId,

  async getActiveCompanyId(): Promise<string | null> {
    return getCompanyId();
  },

  getRealtimeTables(): string[] {
    return Array.from(new Set([
      ...Object.values(STORE_TO_TABLE),
      'customers',
      'products',
      'sales',
      'invoices',
      'expenses',
      'suppliers',
      'purchase_orders',
      'inventory_movements',
      'companies',
      'profiles',
      'users',
    ]));
  },

  async getCurrentProfile(): Promise<any | null> {
    return withSession(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (profile) {
        setActiveCompanyId(profile.company_id);
        return profile;
      }

      const { data: legacyProfile, error: legacyError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (legacyError) throw legacyError;
      if (legacyProfile?.company_id) setActiveCompanyId(legacyProfile.company_id);
      return legacyProfile;
    });
  },

  async listCompanyProfiles(): Promise<any[] | null> {
    return withSession(async () => {
      const companyId = await getCompanyId();
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });

      if (!error) return data || [];

      const { data: legacyRows, error: legacyError } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });

      if (legacyError) throw legacyError;
      return legacyRows || [];
    });
  },

  async getCompany(companyId?: string | null): Promise<any | null> {
    return withSession(async () => {
      const targetCompanyId = companyId || await getCompanyId();
      if (!targetCompanyId) return null;

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', targetCompanyId)
        .maybeSingle();

      if (!error && data) {
        setActiveCompanyId(data.id);
        return data;
      }

      const { data: legacyConfig, error: legacyError } = await supabase
        .from('company_config')
        .select('*')
        .eq('id', targetCompanyId)
        .maybeSingle();

      if (legacyError) throw legacyError;
      return legacyConfig;
    });
  },

  async upsertCompany(config: Record<string, any>): Promise<string | null> {
    return withSession(async () => {
      const id = config.companyId || config.id || crypto.randomUUID();
      const address = [
        config.address,
        config.addressLine1,
        config.addressLine2,
        config.city,
        config.country,
      ].filter(Boolean).join(', ');

      const { data, error } = await supabase
        .from('companies')
        .upsert({
          id,
          company_name: config.companyName || config.company_name || 'Prime ERP Company',
          registration_number: config.registrationNumber || config.registration_number || null,
          email: config.email || null,
          phone: config.phone || null,
          address: address || null,
          logo_url: config.logoUrl || config.logo_url || null,
          data: { ...config, companyId: id },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select('id')
        .single();

      if (error) throw error;
      setActiveCompanyId(data.id);
      return data.id;
    });
  },

  async upsertProfile(profile: Record<string, any>): Promise<string | null> {
    return withSession(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = profile.user_id || profile.userId || profile.id || user?.id;
      const companyId = profile.company_id || profile.companyId || await getCompanyId();
      if (!userId || !companyId) return null;

      const profileData = { ...profile };
      delete profileData.password;
      delete profileData.confirmPassword;
      delete profileData.profile_id;
      delete profileData.profileId;
      delete profileData.user_id;
      delete profileData.userId;
      delete profileData.company_id;
      delete profileData.companyId;

      const payload = {
        id: profile.profile_id || profile.profileId || crypto.randomUUID(),
        user_id: userId,
        company_id: companyId,
        full_name: profile.full_name || profile.fullName || profile.name || user?.email?.split('@')[0] || 'User',
        role: profile.role || 'Sales Staff',
        status: profile.status || 'Active',
        data: profileData,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('id')
        .single();

      if (error) throw error;
      setActiveCompanyId(companyId);
      return data.id;
    });
  },

  async getAll<T>(storeName: string): Promise<T[] | null> {
    return withSession(async () => {
      const table = getTable(storeName);
      const companyId = await getCompanyId();
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
      const companyId = await getCompanyId();
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
      const companyId = await getCompanyId();
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
      const companyId = await getCompanyId();
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
      const companyId = await getCompanyId();
      let query = supabase
        .from('settings')
        .select('data')
        .eq('id', key);
      if (companyId) query = query.eq('company_id', companyId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data?.data as T ?? null;
    });
  },

  async saveSetting<T>(key: string, value: T): Promise<void | null> {
    return withSession(async () => {
      const companyId = await getCompanyId();
      const record: Record<string, unknown> = {
        id: key,
        data: value,
        updated_at: new Date().toISOString(),
      };
      if (companyId) record.company_id = companyId;
      const { error } = await supabase
        .from('settings')
        .upsert(record, { onConflict: 'id' });
      if (error) throw error;
    });
  },

  async uploadFile(file: File, folder = 'documents'): Promise<string | null> {
    return withSession(async () => {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Cannot upload file without an active company.');

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${companyId}/${folder}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage
        .from(FILE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) throw error;
      return `storage:${FILE_BUCKET}:${path}`;
    });
  },

  async createSignedFileUrl(fileId: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
    return withSession(async () => {
      const match = /^storage:([^:]+):(.+)$/.exec(fileId);
      if (!match) return null;
      const [, bucket, path] = match;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) throw error;
      return data.signedUrl;
    });
  },

  async downloadFile(fileId: string): Promise<Blob | null> {
    return withSession(async () => {
      const match = /^storage:([^:]+):(.+)$/.exec(fileId);
      if (!match) return null;
      const [, bucket, path] = match;
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);

      if (error) throw error;
      return data;
    });
  },

  async deleteCompany(companyId: string): Promise<void> {
    if (!SUPABASE_ENABLED) return;
    await withSession(async () => {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId);
      if (error) throw error;
    });
  },
};

export default cloudDb;
