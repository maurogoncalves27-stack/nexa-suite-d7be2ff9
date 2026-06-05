
-- 1) Fix evaluation_scores SELECT to mirror parent evaluations access rules
DROP POLICY IF EXISTS "View evaluation scores" ON public.evaluation_scores;
CREATE POLICY "View evaluation scores"
ON public.evaluation_scores
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.evaluations ev
    JOIN public.employees e ON e.id = ev.employee_id
    WHERE ev.id = evaluation_scores.evaluation_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role)
            AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        OR (ev.status = 'finalized' AND e.user_id = auth.uid())
      )
  )
);

-- 2) Drop overly permissive totem-backgrounds write policies
DROP POLICY IF EXISTS "Totem assets bucket auth delete" ON storage.objects;
DROP POLICY IF EXISTS "Totem assets bucket auth update" ON storage.objects;
DROP POLICY IF EXISTS "Totem assets bucket auth upload" ON storage.objects;

-- 3) Restrict addon-photos write/delete/update to admins and managers
DROP POLICY IF EXISTS "Authenticated delete addon photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update addon photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload addon photos" ON storage.objects;

CREATE POLICY "Admins/managers upload addon photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'addon-photos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admins/managers update addon photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'addon-photos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admins/managers delete addon photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'addon-photos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  )
);

-- 4) Restrict public job-resumes uploads: only allow into a folder that matches
--    an existing job_openings.id (public application flow).
DROP POLICY IF EXISTS "Public can upload resumes" ON storage.objects;

CREATE POLICY "Public can upload resumes to valid openings"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'job-resumes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.job_openings jo
    WHERE jo.id::text = (storage.foldername(name))[1]
  )
);
