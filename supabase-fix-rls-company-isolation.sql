-- ============================================================
-- Prime ERP - Company isolation RLS policies
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Helper function: returns the current user's company_id
-- Uses SECURITY DEFINER so it can read public.users regardless of RLS
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(company_id, '') FROM public.users WHERE id = auth.uid();
$$;

-- 2. Drop old permissive policies
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
    'profit_margin_settings',
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
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can insert %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can update %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can delete %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_select_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_insert_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_update_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_delete_%s" ON public.%I;', t, t);
  END LOOP;
END;
$$;

-- 3. Create company-scoped RLS policies
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
    'profit_margin_settings',
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
  cid TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "rls_%s_select" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "rls_%s_select" ON public.%I FOR SELECT TO authenticated USING (
        company_id = '''' OR company_id IS NULL OR company_id = public.current_company_id()
      );', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "rls_%s_insert" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "rls_%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (
        company_id = '''' OR company_id IS NULL OR company_id = public.current_company_id()
      );', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "rls_%s_update" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "rls_%s_update" ON public.%I FOR UPDATE TO authenticated USING (
        company_id = '''' OR company_id IS NULL OR company_id = public.current_company_id()
      );', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "rls_%s_delete" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "rls_%s_delete" ON public.%I FOR DELETE TO authenticated USING (
        company_id = '''' OR company_id IS NULL OR company_id = public.current_company_id()
      );', t, t);
  END LOOP;
END;
$$;

-- 4. Users table policies (different: users can see their own row, or same company)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_users_select" ON public.users;
DROP POLICY IF EXISTS "rls_users_insert" ON public.users;
DROP POLICY IF EXISTS "rls_users_update" ON public.users;
DROP POLICY IF EXISTS "rls_users_delete" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;

CREATE POLICY "rls_users_select" ON public.users FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR company_id = ''''
  OR company_id IS NULL
  OR company_id = public.current_company_id()
);

CREATE POLICY "rls_users_insert" ON public.users FOR INSERT TO authenticated WITH CHECK (
  id = auth.uid()
);

CREATE POLICY "rls_users_update" ON public.users FOR UPDATE TO authenticated USING (
  id = auth.uid()
  OR (SELECT is_super_admin FROM public.users WHERE id = auth.uid()) = true
);

CREATE POLICY "rls_users_delete" ON public.users FOR DELETE TO authenticated USING (
  id = auth.uid()
  OR (SELECT is_super_admin FROM public.users WHERE id = auth.uid()) = true
);
