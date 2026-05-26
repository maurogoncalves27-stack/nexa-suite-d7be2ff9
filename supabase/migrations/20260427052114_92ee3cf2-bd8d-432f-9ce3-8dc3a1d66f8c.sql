-- Adicionar campos de currículo nas candidaturas públicas
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS resume_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_name TEXT;

-- Bucket público para currículos enviados na página pública de vagas
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-resumes', 'job-resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Qualquer pessoa (anônimo) pode enviar currículo
CREATE POLICY "Public can upload resumes"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'job-resumes');

-- Qualquer pessoa pode ler (bucket público) — para visualização do gestor e candidato
CREATE POLICY "Public can read resumes"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'job-resumes');

-- Equipe autenticada pode remover (limpeza)
CREATE POLICY "Authenticated can delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'job-resumes');