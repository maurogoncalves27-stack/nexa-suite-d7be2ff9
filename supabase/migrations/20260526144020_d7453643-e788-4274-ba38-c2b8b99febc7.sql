
-- ============================================================
-- 1) daily_revenue — restringir a admin/manager/hr
-- ============================================================
DROP POLICY IF EXISTS "daily_revenue select authenticated" ON public.daily_revenue;
DROP POLICY IF EXISTS "daily_revenue insert authenticated" ON public.daily_revenue;
DROP POLICY IF EXISTS "daily_revenue update authenticated" ON public.daily_revenue;
DROP POLICY IF EXISTS "daily_revenue delete authenticated" ON public.daily_revenue;

CREATE POLICY "daily_revenue staff select"
  ON public.daily_revenue FOR SELECT TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

CREATE POLICY "daily_revenue staff insert"
  ON public.daily_revenue FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

CREATE POLICY "daily_revenue staff update"
  ON public.daily_revenue FOR UPDATE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  )
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

CREATE POLICY "daily_revenue staff delete"
  ON public.daily_revenue FOR DELETE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- ============================================================
-- 2) automation_rule_runs — leitura staff, escrita só service_role
-- ============================================================
DROP POLICY IF EXISTS "Staff can view automation runs" ON public.automation_rule_runs;
DROP POLICY IF EXISTS "Service can insert automation runs" ON public.automation_rule_runs;

CREATE POLICY "Staff can view automation runs"
  ON public.automation_rule_runs FOR SELECT TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );
-- INSERT: sem policy para authenticated → só service_role consegue inserir (via edge functions)

-- ============================================================
-- 3) candidate_message_logs — escrita só service_role
-- ============================================================
DROP POLICY IF EXISTS "Service can insert message logs" ON public.candidate_message_logs;
-- sem policy de INSERT para authenticated → apenas service_role pode gravar

-- ============================================================
-- 4) inventory_supplier_aliases — restringir a admin/manager
-- ============================================================
DROP POLICY IF EXISTS "Aliases visiveis a autenticados" ON public.inventory_supplier_aliases;
DROP POLICY IF EXISTS "Aliases criados por autenticados" ON public.inventory_supplier_aliases;
DROP POLICY IF EXISTS "Aliases atualizaveis por autenticados" ON public.inventory_supplier_aliases;
DROP POLICY IF EXISTS "Aliases removiveis por autenticados" ON public.inventory_supplier_aliases;

CREATE POLICY "supplier_aliases staff select"
  ON public.inventory_supplier_aliases FOR SELECT TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

CREATE POLICY "supplier_aliases staff insert"
  ON public.inventory_supplier_aliases FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "supplier_aliases staff update"
  ON public.inventory_supplier_aliases FOR UPDATE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "supplier_aliases staff delete"
  ON public.inventory_supplier_aliases FOR DELETE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- ============================================================
-- 5) Storage: remover leitura pública de currículos
-- ============================================================
DROP POLICY IF EXISTS "Public can read resumes" ON storage.objects;

-- ============================================================
-- 6) search_path mutável: fixar em todas as funções SECURITY DEFINER do schema public
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;
