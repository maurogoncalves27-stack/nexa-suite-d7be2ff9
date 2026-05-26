
ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Storage policies para assinaturas no bucket employee-documents
-- Pasta: contract-signatures/{user_id}/...
CREATE POLICY "Users can upload their own contract signature"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'contract-signatures'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can read their own contract signature"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'contract-signatures'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);
