-- Allow employee to insert documents for themselves
CREATE POLICY "Employees insert own documents"
ON public.employee_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND e.user_id = auth.uid()
  )
);

-- Allow employee to upload to their own folder in employee-documents bucket
CREATE POLICY "Employees upload own employee-documents files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
  )
);