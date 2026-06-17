
-- 1) checklist_answers: allow manager/hr/super_user to read
CREATE POLICY "Managers and HR view all checklist answers"
ON public.checklist_answers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
);

-- 2) delivery_jobs: tighten SELECT to admin/manager/hr/super_user only (protect driver PII)
DROP POLICY IF EXISTS "Staff read delivery jobs" ON public.delivery_jobs;
CREATE POLICY "Managers read delivery jobs"
ON public.delivery_jobs
FOR SELECT
TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

-- 3) nutri-oil-disposal storage: scope by store folder
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_select" ON storage.objects;

CREATE POLICY "nutri_oil_disposal_receipts_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "nutri_oil_disposal_receipts_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);
