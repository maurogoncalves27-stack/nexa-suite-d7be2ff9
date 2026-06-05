
DROP POLICY IF EXISTS "Checklist photos readable by authenticated" ON storage.objects;

DROP POLICY IF EXISTS "Store staff read delivery config" ON public.delivery_provider_config;
CREATE POLICY "Store staff read delivery config"
ON public.delivery_provider_config FOR SELECT TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.user_can_access_store(auth.uid(), store_id)
);

DROP POLICY IF EXISTS "Authenticated can delete resumes" ON storage.objects;

DROP POLICY IF EXISTS "nutricontrol authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol authenticated delete" ON storage.objects;

CREATE POLICY "Nutricontrol staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nutricontrol' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
));

CREATE POLICY "Nutricontrol staff insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nutricontrol' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
));

CREATE POLICY "Nutricontrol staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nutricontrol' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
));

CREATE POLICY "Nutricontrol staff delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nutricontrol' AND (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
));

DROP POLICY IF EXISTS "Usuários autenticados leem assinaturas de advertência" ON storage.objects;

CREATE POLICY "Warning signatures - owner read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'warning-signatures'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND (e.id)::text = (storage.foldername(name))[1]
  )
);
