
-- 1) Revoke EXECUTE on all SECURITY DEFINER functions in public from PUBLIC, grant to authenticated
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Make sensitive buckets private
UPDATE storage.buckets SET public = false
 WHERE id IN ('job-resumes','warning-signatures','nutri-visit-signatures');

-- 3) Storage policies for newly private buckets
DROP POLICY IF EXISTS "Job resumes - staff read"   ON storage.objects;
DROP POLICY IF EXISTS "Job resumes - staff write"  ON storage.objects;
CREATE POLICY "Job resumes - staff read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'job-resumes' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)));
CREATE POLICY "Job resumes - staff write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'job-resumes' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)))
WITH CHECK (bucket_id = 'job-resumes' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)));

DROP POLICY IF EXISTS "Warning signatures - staff read"  ON storage.objects;
DROP POLICY IF EXISTS "Warning signatures - staff write" ON storage.objects;
CREATE POLICY "Warning signatures - staff read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'warning-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)));
CREATE POLICY "Warning signatures - staff write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'warning-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)))
WITH CHECK (bucket_id = 'warning-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)));

DROP POLICY IF EXISTS "Nutri visit signatures - staff read"  ON storage.objects;
DROP POLICY IF EXISTS "Nutri visit signatures - staff write" ON storage.objects;
CREATE POLICY "Nutri visit signatures - staff read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'nutri-visit-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'nutritionist'::app_role)));
CREATE POLICY "Nutri visit signatures - staff write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'nutri-visit-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'nutritionist'::app_role)))
WITH CHECK (bucket_id = 'nutri-visit-signatures' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'nutritionist'::app_role)));
