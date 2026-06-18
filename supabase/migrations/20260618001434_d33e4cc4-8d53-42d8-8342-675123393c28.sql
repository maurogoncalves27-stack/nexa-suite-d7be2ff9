-- Normaliza policies de Storage do NutriControle por bucket/uso

DROP POLICY IF EXISTS "nutricontrol_all_buckets_select" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_all_buckets_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_all_buckets_update" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_all_buckets_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_public_read" ON storage.objects;

DROP POLICY IF EXISTS "nutricontrol_legacy_staff_select" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_legacy_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_legacy_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "nutricontrol_legacy_staff_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_maintenance_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_maintenance_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_maintenance_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_maintenance_photos_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_pest_certificates_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_water_reports_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_visit_signatures_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_visit_signatures_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_visit_signatures_update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_visit_signatures_delete" ON storage.objects;

CREATE POLICY "nutricontrol_legacy_staff_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nutricontrol'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_legacy_staff_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutricontrol'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_legacy_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'nutricontrol'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutricontrol'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_legacy_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nutricontrol'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_maintenance_photos_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'nutri-maintenance-photos');

CREATE POLICY "nutri_maintenance_photos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.is_virtual = false
  )
);

CREATE POLICY "nutri_maintenance_photos_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'nutri-maintenance-photos'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_maintenance_photos_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nutri-maintenance-photos'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_pest_certificates_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'nutri-pest-certificates');

CREATE POLICY "nutri_pest_certificates_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-pest-certificates'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "nutri_pest_certificates_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'nutri-pest-certificates'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutri-pest-certificates'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_pest_certificates_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nutri-pest-certificates'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_water_reports_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'nutri-water-reports');

CREATE POLICY "nutri_water_reports_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-water-reports'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "nutri_water_reports_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'nutri-water-reports'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutri-water-reports'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_water_reports_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nutri-water-reports'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_visit_signatures_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nutri-visit-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_visit_signatures_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nutri-visit-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_visit_signatures_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'nutri-visit-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'nutri-visit-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutri_visit_signatures_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nutri-visit-signatures'
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
  )
);