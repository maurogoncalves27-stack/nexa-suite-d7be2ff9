
-- 1) outsourced_professionals: impedir self-approve
DROP POLICY IF EXISTS "Terceirizado edita seu próprio cadastro" ON public.outsourced_professionals;

CREATE POLICY "Terceirizado edita seu próprio cadastro"
ON public.outsourced_professionals
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND approval_status IS NOT DISTINCT FROM (
    SELECT approval_status FROM public.outsourced_professionals WHERE id = outsourced_professionals.id
  )
  AND approved_at IS NOT DISTINCT FROM (
    SELECT approved_at FROM public.outsourced_professionals WHERE id = outsourced_professionals.id
  )
  AND approved_by IS NOT DISTINCT FROM (
    SELECT approved_by FROM public.outsourced_professionals WHERE id = outsourced_professionals.id
  )
);

-- 2) job_interview_slots: remover SELECT aberto
DROP POLICY IF EXISTS "Authenticated can view all slots" ON public.job_interview_slots;

-- 3) Storage bucket nutri-oil-disposal-receipts: políticas de escrita
CREATE POLICY "nutri_oil_disposal_receipts_insert"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "nutri_oil_disposal_receipts_update"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
  )
);

CREATE POLICY "nutri_oil_disposal_receipts_delete"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
  )
);
