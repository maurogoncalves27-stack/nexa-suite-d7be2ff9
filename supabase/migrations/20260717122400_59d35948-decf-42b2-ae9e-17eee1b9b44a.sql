
CREATE OR REPLACE FUNCTION public.is_valid_candidate_upload_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_candidates jc
    WHERE jc.document_upload_token::text = _token
      AND jc.document_upload_token_created_at IS NOT NULL
      AND jc.document_upload_token_created_at > (now() - interval '30 days')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_candidate_upload_token(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public upload to candidate-documents by valid token" ON storage.objects;

CREATE POLICY "Public upload to candidate-documents by valid token"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND public.is_valid_candidate_upload_token((storage.foldername(name))[1])
);
