DROP POLICY IF EXISTS "nutri_maintenance_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_insert" ON storage.objects;

CREATE POLICY "nutri_maintenance_photos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(objects.name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(objects.name))[1]
      AND s.is_virtual = false
  )
);

CREATE POLICY "nutri_pest_certificates_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-pest-certificates'
  AND (storage.foldername(objects.name))[1] IS NOT NULL
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(objects.name))[1])::uuid)
  )
);

CREATE POLICY "nutri_water_reports_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-water-reports'
  AND (storage.foldername(objects.name))[1] IS NOT NULL
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(objects.name))[1])::uuid)
  )
);