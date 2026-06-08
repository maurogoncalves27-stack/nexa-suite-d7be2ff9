
-- 1. checklist-photos: remove unrestricted INSERT policy
DROP POLICY IF EXISTS "Checklist photos uploadable by authenticated" ON storage.objects;

-- 2. petty-cash-receipts: replace unrestricted INSERT with path-ownership check
DROP POLICY IF EXISTS "Authenticated uploads petty cash receipts" ON storage.objects;
CREATE POLICY "Users upload petty cash receipts to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'petty-cash-receipts'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[1]
  )
);

-- 3. warning-signatures: replace unrestricted INSERT with employee-folder check
DROP POLICY IF EXISTS "Usuários autenticados enviam assinaturas de advertência" ON storage.objects;
CREATE POLICY "Users upload warning signatures to own employee folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'warning-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND (e.id)::text = (storage.foldername(name))[1]
    )
  )
);

-- 4. pdv_tef_homologation_runs/steps: restrict writes to admin/manager/super
DROP POLICY IF EXISTS "auth manage homolog runs" ON public.pdv_tef_homologation_runs;
CREATE POLICY "Staff manage homolog runs"
ON public.pdv_tef_homologation_runs FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "auth manage homolog steps" ON public.pdv_tef_homologation_steps;
CREATE POLICY "Staff manage homolog steps"
ON public.pdv_tef_homologation_steps FOR ALL TO authenticated
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
