-- Fix: handle_new_user trigger function with per-insert exception handling
-- Run this in Supabase SQL Editor to replace the failing trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb := NEW.raw_user_meta_data;
  company_id_val text := COALESCE(raw_meta->>'company_id', gen_random_uuid()::text);
  company_name_val text := COALESCE(raw_meta->>'company_name', 'Prime ERP Company');
  full_name_val text := COALESCE(raw_meta->>'full_name', split_part(NEW.email, '@', 1), 'User');
  role_val text := COALESCE(raw_meta->>'role', 'Sales Staff');
  group_ids_val text[];
BEGIN
  BEGIN group_ids_val := ARRAY(SELECT jsonb_array_elements_text(raw_meta->'group_ids'));
  EXCEPTION WHEN OTHERS THEN group_ids_val := ARRAY[]::text[]; END;

  BEGIN
    INSERT INTO public.companies (id, company_name, email, phone, address, data)
    VALUES (company_id_val, company_name_val,
      NULLIF(raw_meta->>'company_email', ''),
      NULLIF(raw_meta->>'company_phone', ''),
      NULLIF(raw_meta->>'company_address', ''),
      COALESCE(raw_meta->'company_config', '{}'::jsonb) || jsonb_build_object('companyId', company_id_val))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.profiles (user_id, company_id, full_name, role, status, data)
    VALUES (NEW.id, company_id_val, full_name_val, role_val, 'Active',
      jsonb_build_object('username', COALESCE(raw_meta->>'username', split_part(NEW.email, '@', 1)),
        'email', NEW.email, 'group_ids', group_ids_val,
        'is_super_admin', COALESCE((raw_meta->>'is_super_admin')::boolean, false)))
    ON CONFLICT (user_id) DO UPDATE SET
      company_id = EXCLUDED.company_id, full_name = EXCLUDED.full_name,
      role = EXCLUDED.role, data = public.profiles.data || EXCLUDED.data,
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.users (id, username, full_name, name, email, role, is_super_admin, group_ids, company_id)
    VALUES (NEW.id, COALESCE(raw_meta->>'username', split_part(NEW.email, '@', 1)),
      full_name_val, full_name_val, NEW.email, role_val,
      COALESCE((raw_meta->>'is_super_admin')::boolean, false), group_ids_val, company_id_val)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email, company_id = EXCLUDED.company_id, updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
