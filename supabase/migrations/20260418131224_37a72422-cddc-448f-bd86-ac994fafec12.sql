DROP POLICY IF EXISTS "Assinaturas de advertência são públicas para leitura" ON storage.objects;

CREATE POLICY "Usuários autenticados leem assinaturas de advertência"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'warning-signatures' AND auth.uid() IS NOT NULL);