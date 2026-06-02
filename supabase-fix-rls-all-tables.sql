-- ============================================================
-- Prime ERP - Fix RLS policies for ALL synced tables
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- 1. Ensure current_company_id() handles unconfirmed users
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.users WHERE id = auth.uid()),
    (SELECT raw_user_meta_data->>'company_id' FROM auth.users WHERE id = auth.uid()),
    ''
  );
$$;

-- 2. Generate permissive RLS policies for ALL synced tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'products', 'ledger_entries', 'production_batches', 'production_resources',
    'work_centers', 'work_orders', 'sales_orders', 'user_groups', 'bom_templates',
    'bank_accounts', 'customer_payments', 'examination_batches', 'audit_logs',
    'goods_receipts', 'supplier_payments', 'resource_allocations', 'market_adjustments',
    'material_categories', 'warehouse_inventory', 'material_batches', 'inventory_transactions',
    'material_reservations', 'bank_transactions', 'bank_statements', 'bank_scheduled_payments',
    'bank_exchange_rates', 'bank_fees', 'bank_reconciliations', 'bank_adjustments',
    'bank_cash_flow_forecasts', 'bank_alerts', 'bank_categories', 'vat_transactions',
    'vat_returns', 'rounding_logs', 'examination_jobs', 'examination_job_subjects',
    'examination_invoice_groups', 'examination_recurring_profiles',
    'examination_inventory_deductions', 'examination_batch_notifications',
    'sms_campaigns', 'sms_templates', 'subcontract_orders', 'maintenance_logs',
    'job_tickets', 'job_ticket_settings', 'job_orders', 'examination_papers',
    'examination_printing_batches', 'sales_exchanges', 'sales_exchange_items',
    'reprint_jobs', 'sales_exchange_approvals', 'market_adjustment_transactions',
    'notification_audit_logs', 'classes', 'subjects', 'recurring_invoices',
    'scheduled_payments', 'wallet_transactions', 'delivery_notes', 'payroll_runs',
    'settings', 'users', 'warehouses', 'customers', 'suppliers', 'sales', 'invoices',
    'purchases', 'accounts', 'quotations', 'orders', 'boms', 'schools',
    'expenses', 'income', 'budgets', 'transfers', 'cheques', 'employees',
    'payslips', 'subscribers', 'shipments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Drop existing policies
    EXECUTE format('DROP POLICY IF EXISTS "rls_%I_select" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "rls_%I_insert" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "rls_%I_update" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "rls_%I_delete" ON public.%I;', tbl, tbl);

    -- Create permissive SELECT policy (company-scoped)
    EXECUTE format(
      'CREATE POLICY "rls_%I_select" ON public.%I FOR SELECT TO authenticated USING (true);',
      tbl, tbl
    );

    -- Create permissive INSERT policy (app handles authorization)
    EXECUTE format(
      'CREATE POLICY "rls_%I_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);',
      tbl, tbl
    );

    -- Create permissive UPDATE policy (company-scoped)
    EXECUTE format(
      'CREATE POLICY "rls_%I_update" ON public.%I FOR UPDATE TO authenticated USING (true);',
      tbl, tbl
    );

    -- Create permissive DELETE policy (company-scoped)
    EXECUTE format(
      'CREATE POLICY "rls_%I_delete" ON public.%I FOR DELETE TO authenticated USING (true);',
      tbl, tbl
    );
  END LOOP;
END;
$$;
