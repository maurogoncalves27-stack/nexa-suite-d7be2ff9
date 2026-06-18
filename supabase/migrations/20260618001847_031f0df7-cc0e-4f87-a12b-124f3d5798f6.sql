DROP POLICY IF EXISTS "nutri_maintenance_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_select" ON storage.objects;

CREATE POLICY "nutri_maintenance_photos_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nutri-maintenance-photos'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR (
      (storage.foldername(objects.name))[1] IS NOT NULL
      AND public.user_can_access_store(auth.uid(), ((storage.foldername(objects.name))[1])::uuid)
    )
  )
);

CREATE POLICY "nutri_pest_certificates_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nutri-pest-certificates'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR (
      (storage.foldername(objects.name))[1] IS NOT NULL
      AND public.user_can_access_store(auth.uid(), ((storage.foldername(objects.name))[1])::uuid)
    )
  )
);

CREATE POLICY "nutri_water_reports_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nutri-water-reports'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR (
      (storage.foldername(objects.name))[1] IS NOT NULL
      AND public.user_can_access_store(auth.uid(), ((storage.foldername(objects.name))[1])::uuid)
    )
  )
);