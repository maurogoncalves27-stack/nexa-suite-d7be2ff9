DROP POLICY IF EXISTS nutri_maintenance_photos_insert ON storage.objects;

CREATE POLICY nutri_maintenance_photos_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.is_virtual = false
  )
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::public.app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);