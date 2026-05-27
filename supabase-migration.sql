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

  INSERT INTO public.users (id, username, full_name, name, email, role, is_super_admin, group_ids)
  VALUES (
    NEW.id,
    username_val,
    full_name_val,
    full_name_val,
    NEW.email,
    role_val,
    is_super_val,
    group_ids_val
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. USER GROUPS TABLE
CREATE TABLE IF NOT EXISTS public.user_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COMPANY CONFIG TABLE (single row)
CREATE TABLE IF NOT EXISTS public.company_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCTS / INVENTORY
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. WAREHOUSES
CREATE TABLE IF NOT EXISTS public.warehouses (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. SALES
CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PURCHASES
CREATE TABLE IF NOT EXISTS public.purchases (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. ACCOUNTS (Chart of Accounts)
CREATE TABLE IF NOT EXISTS public.accounts (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. LEDGER ENTRIES
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SETTINGS
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. WORK CENTERS
CREATE TABLE IF NOT EXISTS public.work_centers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. WORK ORDERS
CREATE TABLE IF NOT EXISTS public.work_orders (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. PRODUCTION BATCHES
CREATE TABLE IF NOT EXISTS public.production_batches (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. PRODUCTION RESOURCES
CREATE TABLE IF NOT EXISTS public.production_resources (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. SALES ORDERS
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. QUOTATIONS
CREATE TABLE IF NOT EXISTS public.quotations (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. CUSTOMER PAYMENTS
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. EXAMINATION BATCHES
CREATE TABLE IF NOT EXISTS public.examination_batches (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. BOM TEMPLATES
CREATE TABLE IF NOT EXISTS public.bom_templates (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. BANK ACCOUNTS
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all data
CREATE POLICY "Authenticated users can read users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read user_groups"
  ON public.user_groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read company_config"
  ON public.company_config FOR SELECT
  TO authenticated
  USING (true);

-- Generic read policy for all data tables
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products', 'warehouses', 'customers', 'suppliers', 'sales',
    'invoices', 'purchases', 'accounts', 'ledger_entries',
    'audit_logs', 'settings', 'reminders', 'work_centers',
    'work_orders', 'production_batches', 'production_resources',
    'sales_orders', 'quotations', 'customer_payments',
    'examination_batches', 'bom_templates', 'bank_accounts'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated users can read %s" ON public.%I FOR SELECT TO authenticated USING (true);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated users can insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated users can update %s" ON public.%I FOR UPDATE TO authenticated USING (true);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated users can delete %s" ON public.%I FOR DELETE TO authenticated USING (true);',
      t, t
    );
  END LOOP;
END;
$$;

-- Users can only update their own profile row (or admins can update all)
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR (SELECT is_super_admin FROM public.users WHERE id = auth.uid()) = true);

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

-- ============================================================
-- SEED DATA: Default user groups
-- ============================================================
INSERT INTO public.user_groups (id, name, description, permissions) VALUES
  ('GRP-ADMIN', 'Administrators', 'Full system access with all permissions', '{all}'),
  ('GRP-ACCOUNTANT', 'Accountants', 'Financial management, reporting, and ledger access',
   '{dashboard.view,reports.view,ledger.view,ledger.post,banking.manage,sale.process,sale.refund,inventory.view,examination.cost.override}'),
  ('GRP-CASHIER', 'Cashiers', 'Front-end sales and basic inventory viewing',
   '{dashboard.view,sale.process,sale.refund,inventory.view}'),
  ('GRP-OPERATOR', 'Production Operators', 'Production logging and work order execution',
   '{dashboard.view,production.log,inventory.view}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- COMPANY CONFIG: Seed default
-- ============================================================
INSERT INTO public.company_config (id, data) VALUES
  ('default', '{"companyName":"Prime ERP","country":"Malawi","currencySymbol":"K"}')
ON CONFLICT (id) DO NOTHING;
