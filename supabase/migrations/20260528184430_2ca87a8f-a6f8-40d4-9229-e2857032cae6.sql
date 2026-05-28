ALTER TABLE public.employee_documents DROP CONSTRAINT IF EXISTS employee_documents_uploaded_by_fkey;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_created_by_fkey;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_user_id_fkey;
ALTER TABLE public.interview_reschedule_log DROP CONSTRAINT IF EXISTS interview_reschedule_log_rescheduled_by_fkey;
ALTER TABLE public.payroll_advances DROP CONSTRAINT IF EXISTS payroll_advances_created_by_fkey;
ALTER TABLE public.pos_sync_logs DROP CONSTRAINT IF EXISTS pos_sync_logs_triggered_by_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey;
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_created_by_fkey;
ALTER TABLE public.store_terminal_users DROP CONSTRAINT IF EXISTS store_terminal_users_user_id_fkey;
ALTER TABLE public.supplier_approved_categories DROP CONSTRAINT IF EXISTS supplier_approved_categories_approved_by_fkey;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_approved_by_fkey;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_user_id_fkey;
ALTER TABLE public.user_access_overrides DROP CONSTRAINT IF EXISTS user_access_overrides_user_id_fkey;
ALTER TABLE public.user_face_descriptors DROP CONSTRAINT IF EXISTS user_face_descriptors_user_id_fkey;
ALTER TABLE public.user_passkeys DROP CONSTRAINT IF EXISTS user_passkeys_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_tour_progress DROP CONSTRAINT IF EXISTS user_tour_progress_user_id_fkey;

-- Volta o helper para USER (não precisamos mais de ALL agora que FKs problemáticas saíram)
CREATE OR REPLACE FUNCTION public._migration_set_triggers(p_enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF p_enable THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.tablename);
    ELSE
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.tablename);
    END IF;
  END LOOP;
END;
$function$;