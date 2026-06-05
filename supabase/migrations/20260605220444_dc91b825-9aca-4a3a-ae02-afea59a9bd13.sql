
-- 1. Restrict stores SELECT to stores the user can access (admin/manager get all via user_can_access_store)
DROP POLICY IF EXISTS "Authenticated view stores" ON public.stores;
CREATE POLICY "Users view accessible stores"
ON public.stores FOR SELECT
TO authenticated
USING (public.user_can_access_store(auth.uid(), id));

-- 2. Restrict job-banners bucket writes to admin/manager/hr
DROP POLICY IF EXISTS "Authenticated users can upload job banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update job banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete job banners" ON storage.objects;

CREATE POLICY "Admins/RH upload job banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-banners'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'))
);
CREATE POLICY "Admins/RH update job banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job-banners'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'))
);
CREATE POLICY "Admins/RH delete job banners"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-banners'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'))
);

-- 3. Restrict nutri-maintenance-photos writes to nutritionist/admin/manager
DROP POLICY IF EXISTS "Authenticated upload maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete maintenance photos" ON storage.objects;

CREATE POLICY "Nutri upload maintenance photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND (public.has_role(auth.uid(),'nutritionist') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);
CREATE POLICY "Nutri delete maintenance photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'nutri-maintenance-photos'
  AND (public.has_role(auth.uid(),'nutritionist') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

-- 4. Expire candidate upload tokens after 7 days
CREATE OR REPLACE FUNCTION public.candidate_accepts_uploads(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.job_candidates
    WHERE id = _candidate_id
      AND document_upload_token IS NOT NULL
      AND documents_requested_at IS NOT NULL
      AND COALESCE(document_upload_token_created_at, documents_requested_at) > (now() - interval '7 days')
  );
$function$;
