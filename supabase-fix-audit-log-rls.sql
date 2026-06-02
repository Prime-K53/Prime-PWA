-- ============================================================
-- Prime ERP - Fix audit_logs RLS for unconfirmed email users
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Update current_company_id() to fall back to auth user metadata
--    when the user doesn't have a row in public.users yet
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

-- 2. Ensure audit_logs has RLS enabled
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Drop old audit_logs policies
DROP POLICY IF EXISTS "rls_audit_logs_select" ON public.audit_logs;
DROP POLICY IF EXISTS "rls_audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "rls_audit_logs_update" ON public.audit_logs;
DROP POLICY IF EXISTS "rls_audit_logs_delete" ON public.audit_logs;

-- 4. Audit logs need permissive insert — any authenticated user can log
CREATE POLICY "rls_audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated USING (
    company_id = '' OR company_id IS NULL OR company_id = public.current_company_id()
  );

CREATE POLICY "rls_audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rls_audit_logs_update" ON public.audit_logs
  FOR UPDATE TO authenticated USING (
    company_id = '' OR company_id IS NULL OR company_id = public.current_company_id()
  );

CREATE POLICY "rls_audit_logs_delete" ON public.audit_logs
  FOR DELETE TO authenticated USING (
    company_id = '' OR company_id IS NULL OR company_id = public.current_company_id()
  );
