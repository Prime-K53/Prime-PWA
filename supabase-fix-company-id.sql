-- ============================================================
-- Prime ERP - Fix ALL missing company_id columns
-- Dynamically finds every table missing company_id and adds it
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.column_name = 'company_id'
      )
  )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id TEXT DEFAULT '''';', rec.table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I(company_id);', rec.table_name, rec.table_name);
    RAISE NOTICE 'Added company_id to %', rec.table_name;
  END LOOP;
END;
$$;
