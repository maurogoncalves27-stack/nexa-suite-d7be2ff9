-- Permite que o colaborador insira o próprio atestado
CREATE POLICY "Employees insert own medical certificates"
ON public.medical_certificates
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = medical_certificates.employee_id
      AND e.user_id = auth.uid()
  )
);

-- Permite que o colaborador faça upload de arquivos no bucket medical-certificates dentro da própria pasta
CREATE POLICY "Employees upload own medical certificate files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-certificates'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
  )
);
