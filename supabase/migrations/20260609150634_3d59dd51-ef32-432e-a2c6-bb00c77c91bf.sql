
-- 1) candidate-documents: exigir token válido + janela de 30 dias
DROP POLICY IF EXISTS "Public upload to candidate-documents by token folder" ON storage.objects;

CREATE POLICY "Public upload to candidate-documents by valid token"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND EXISTS (
    SELECT 1 FROM public.job_candidates jc
    WHERE jc.document_upload_token::text = (storage.foldername(name))[1]
      AND jc.document_upload_token_created_at IS NOT NULL
      AND jc.document_upload_token_created_at > now() - interval '30 days'
  )
);

-- 2) job-resumes: apenas vagas públicas e abertas
DROP POLICY IF EXISTS "Public can upload resumes to valid openings" ON storage.objects;

CREATE POLICY "Public can upload resumes to public open openings"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'job-resumes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.job_openings jo
    WHERE jo.id::text = (storage.foldername(objects.name))[1]
      AND jo.is_public = true
      AND jo.status = 'open'
  )
);

-- 3) nutri buckets: restringir escrita a nutricionista/admin/manager
DROP POLICY IF EXISTS nutri_buckets_insert ON storage.objects;
DROP POLICY IF EXISTS nutri_buckets_update ON storage.objects;
DROP POLICY IF EXISTS nutri_buckets_delete ON storage.objects;

CREATE POLICY nutri_buckets_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'])
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY nutri_buckets_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'])
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
)
WITH CHECK (
  bucket_id = ANY (ARRAY['nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'])
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY nutri_buckets_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'])
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);
