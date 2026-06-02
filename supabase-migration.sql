-- ============================================================
-- Prime ERP - Supabase Migration Script
-- Run this in the Supabase SQL Editor after creating your project
-- ============================================================

-- 1. USER PROFILES TABLE (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'User',
  status TEXT NOT NULL DEFAULT 'Active',
  active BOOLEAN NOT NULL DEFAULT true,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  security_level TEXT DEFAULT 'Standard',
  group_ids TEXT[] DEFAULT '{}',
  password TEXT,
  mfa_enabled BOOLEAN DEFAULT false,
  auth_mode TEXT DEFAULT 'supabase',
  avatar_url TEXT,
  phone TEXT,
  company_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create public.users row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb := NEW.raw_user_meta_data;
  username_val text;
  full_name_val text;
  role_val text;
  is_super_val boolean;
  group_ids_val text[];
  final_username text;
BEGIN
  username_val := COALESCE(raw_meta->>'username', split_part(NEW.email, '@', 1), 'user');
  full_name_val := COALESCE(raw_meta->>'full_name', '');
  role_val := COALESCE(raw_meta->>'role', 'User');
  is_super_val := COALESCE((raw_meta->>'is_super_admin')::boolean, false);

  BEGIN
    group_ids_val := ARRAY(SELECT jsonb_array_elements_text(raw_meta->'group_ids'));
  EXCEPTION WHEN OTHERS THEN
    group_ids_val := '{}'::text[];
  END;

  final_username := username_val;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = final_username AND id != NEW.id) THEN
    final_username := final_username || '_' || substr(NEW.id::text, 1, 8);
  END IF;

  BEGIN
    INSERT INTO public.users (id, username, full_name, name, email, role, is_super_admin, group_ids, company_id)
    VALUES (
      NEW.id,
      final_username,
      full_name_val,
      full_name_val,
      NEW.email,
      role_val,
      is_super_val,
      group_ids_val,
      COALESCE(raw_meta->>'company_id', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      email = EXCLUDED.email,
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. GENERIC DATA TABLES (id + JSONB data + timestamps)
-- All domain entities use this pattern for flexibility
-- Uses a DO block to: create table if missing, add data column if missing

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'user_groups', 'company_config', 'products', 'warehouses',
    'customers', 'suppliers', 'sales', 'invoices', 'purchases', 'accounts',
    'ledger_entries', 'audit_logs', 'settings', 'reminders', 'work_centers',
    'work_orders', 'production_batches', 'production_resources',
    'sales_orders', 'quotations', 'customer_payments', 'orders',
    'examination_batches', 'bom_templates', 'bank_accounts',
    'job_orders', 'boms', 'expenses', 'income', 'recurring_invoices',
    'scheduled_payments', 'wallet_transactions', 'delivery_notes',
    'budgets', 'transfers', 'employees', 'payroll_runs', 'payslips',
    'goods_receipts', 'shipments', 'cheques', 'supplier_payments',
    'job_tickets', 'job_ticket_settings', 'resource_allocations',
    'market_adjustments', 'material_categories', 'warehouse_inventory',
    'material_batches', 'inventory_transactions', 'material_reservations',
    'bank_transactions', 'bank_statements', 'vat_transactions', 'vat_returns',
    'rounding_logs', 'schools', 'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'examination_batch_notifications',
    'sms_campaigns', 'sms_templates', 'subscribers', 'subcontract_orders',
    'maintenance_logs', 'alerts', 'tasks',
    'examination_papers', 'examination_printing_batches',
    'sales_exchanges', 'sales_exchange_items', 'reprint_jobs', 'sales_exchange_approvals',
    'market_adjustment_transactions', 'notification_audit_logs',
    'classes', 'subjects',
    'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
    'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
    'bank_alerts', 'bank_categories', 'idempotency_keys',
    'customer_notification_logs',
    'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_automations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id TEXT PRIMARY KEY, company_id TEXT DEFAULT '''', data JSONB NOT NULL DEFAULT ''{}'', updated_at TIMESTAMPTZ DEFAULT NOW());', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT '''';', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT ''{}'';', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();', t);
  END LOOP;
END;
$$;

-- Drop NOT NULL constraints from old-style columns that may conflict with generic data pattern
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('name', 'description', 'permissions', 'created_at', 'active', 'status', 'role')
      AND is_nullable = 'NO'
  )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', rec.table_name, rec.column_name);
  END LOOP;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'users', 'user_groups', 'company_config', 'products', 'warehouses',
    'customers', 'suppliers', 'sales', 'invoices', 'purchases', 'accounts',
    'ledger_entries', 'audit_logs', 'settings', 'reminders', 'work_centers',
    'work_orders', 'production_batches', 'production_resources',
    'sales_orders', 'quotations', 'customer_payments', 'orders',
    'examination_batches', 'bom_templates', 'bank_accounts',
    'job_orders', 'boms', 'expenses', 'income', 'recurring_invoices',
    'scheduled_payments', 'wallet_transactions', 'delivery_notes',
    'budgets', 'transfers', 'employees', 'payroll_runs', 'payslips',
    'goods_receipts', 'shipments', 'cheques', 'supplier_payments',
    'job_tickets', 'job_ticket_settings', 'resource_allocations',
    'market_adjustments', 'material_categories', 'warehouse_inventory',
    'material_batches', 'inventory_transactions', 'material_reservations',
    'bank_transactions', 'bank_statements', 'vat_transactions', 'vat_returns',
    'rounding_logs', 'schools', 'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'examination_batch_notifications',
    'sms_campaigns', 'sms_templates', 'subscribers', 'subcontract_orders',
    'maintenance_logs', 'alerts', 'tasks',
    'examination_papers', 'examination_printing_batches',
    'sales_exchanges', 'sales_exchange_items', 'reprint_jobs', 'sales_exchange_approvals',
    'market_adjustment_transactions', 'notification_audit_logs',
    'classes', 'subjects',
    'bank_scheduled_payments', 'bank_exchange_rates', 'bank_fees',
    'bank_reconciliations', 'bank_adjustments', 'bank_cash_flow_forecasts',
    'bank_alerts', 'bank_categories', 'idempotency_keys',
    'customer_notification_logs',
    'whatsapp_chats', 'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_automations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read %s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "Authenticated users can read %s" ON public.%I FOR SELECT TO authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can insert %s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "Authenticated users can insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can update %s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "Authenticated users can update %s" ON public.%I FOR UPDATE TO authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can delete %s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "Authenticated users can delete %s" ON public.%I FOR DELETE TO authenticated USING (true);', t, t);
  END LOOP;
END;
$$;

-- Users can only update their own profile row (or admins can update all)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR (SELECT is_super_admin FROM public.users WHERE id = auth.uid()) = true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_products_updated ON public.products(updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_updated ON public.sales(updated_at);
CREATE INDEX IF NOT EXISTS idx_invoices_updated ON public.invoices(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_updated ON public.customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);

-- company_id indexes for multi-tenant queries
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'warehouses', 'customers', 'suppliers', 'sales', 'invoices',
    'purchases', 'accounts', 'ledger_entries', 'audit_logs', 'settings',
    'work_centers', 'work_orders', 'production_batches', 'production_resources',
    'sales_orders', 'quotations', 'customer_payments', 'orders',
    'bank_accounts', 'job_orders', 'boms', 'expenses', 'income',
    'recurring_invoices', 'scheduled_payments', 'wallet_transactions',
    'delivery_notes', 'budgets', 'transfers', 'employees', 'payroll_runs',
    'payslips', 'goods_receipts', 'shipments', 'cheques', 'supplier_payments'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I(company_id);', t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- SEED DATA: Default user groups
-- ============================================================
INSERT INTO public.user_groups (id, data, name, description, permissions) VALUES
  ('GRP-ADMIN', '{"name":"Administrators","description":"Full system access with all permissions","permissions":["all"]}', 'Administrators', 'Full system access with all permissions', '{all}'),
  ('GRP-ACCOUNTANT', '{"name":"Accountants","description":"Financial management, reporting, and ledger access","permissions":["dashboard.view","reports.view","ledger.view","ledger.post","banking.manage","sale.process","sale.refund","inventory.view","examination.cost.override"]}', 'Accountants', 'Financial management, reporting, and ledger access', '{dashboard.view,reports.view,ledger.view,ledger.post,banking.manage,sale.process,sale.refund,inventory.view,examination.cost.override}'),
  ('GRP-CASHIER', '{"name":"Cashiers","description":"Front-end sales and basic inventory viewing","permissions":["dashboard.view","sale.process","sale.refund","inventory.view"]}', 'Cashiers', 'Front-end sales and basic inventory viewing', '{dashboard.view,sale.process,sale.refund,inventory.view}'),
  ('GRP-OPERATOR', '{"name":"Production Operators","description":"Production logging and work order execution","permissions":["dashboard.view","production.log","inventory.view"]}', 'Production Operators', 'Production logging and work order execution', '{dashboard.view,production.log,inventory.view}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- COMPANY CONFIG: Seed default
-- ============================================================
INSERT INTO public.company_config (id, data) VALUES
  ('default', '{"companyName":"Prime ERP","country":"Malawi","currencySymbol":"K"}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REALTIME: Enable for all tables
-- ============================================================
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'users', 'user_groups', 'company_config', 'products', 'warehouses',
    'customers', 'suppliers', 'sales', 'invoices', 'purchases', 'accounts',
    'ledger_entries', 'audit_logs', 'settings', 'reminders', 'work_centers',
    'work_orders', 'production_batches', 'production_resources',
    'sales_orders', 'quotations', 'customer_payments',
    'examination_batches', 'bom_templates', 'bank_accounts',
    'job_orders', 'orders', 'sales_exchanges', 'reprint_jobs',
    'bank_transactions', 'bank_statements', 'goods_receipts',
    'supplier_payments', 'recurring_invoices', 'scheduled_payments',
    'wallet_transactions', 'delivery_notes', 'payroll_runs',
    'vat_transactions', 'vat_returns', 'rounding_logs',
    'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'examination_batch_notifications',
    'sms_campaigns', 'sms_templates', 'subcontract_orders',
    'maintenance_logs', 'job_tickets', 'job_ticket_settings',
    'resource_allocations', 'market_adjustments', 'material_categories',
    'warehouse_inventory', 'material_batches', 'inventory_transactions',
    'material_reservations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    EXCEPTION WHEN OTHERS THEN
      -- Table may already be in publication, ignore
    END;
  END LOOP;
END;
$$;
