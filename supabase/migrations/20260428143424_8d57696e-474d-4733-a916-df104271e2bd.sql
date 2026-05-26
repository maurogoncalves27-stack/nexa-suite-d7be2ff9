
-- Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents', 'candidate-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Token público em job_candidates
ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS document_upload_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS document_upload_token_created_at timestamptz DEFAULT now();

-- Garante token nos candidatos existentes
UPDATE public.job_candidates
SET document_upload_token = gen_random_uuid(),
    document_upload_token_created_at = now()
WHERE document_upload_token IS NULL;

-- Tabela de uploads
CREATE TABLE IF NOT EXISTS public.candidate_document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_doc_uploads_candidate ON public.candidate_document_uploads(candidate_id);

ALTER TABLE public.candidate_document_uploads ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER para validar token e retornar candidate_id (uso público)
CREATE OR REPLACE FUNCTION public.candidate_id_from_upload_token(_token uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.job_candidates WHERE document_upload_token = _token LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.candidate_id_from_upload_token(uuid) TO anon, authenticated;

-- Função para retornar dados básicos do candidato a partir do token (público)
CREATE OR REPLACE FUNCTION public.candidate_info_by_upload_token(_token uuid)
RETURNS TABLE(candidate_id uuid, full_name text, requested_documents jsonb, documents_requested_notes text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, requested_documents, documents_requested_notes
  FROM public.job_candidates
  WHERE document_upload_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.candidate_info_by_upload_token(uuid) TO anon, authenticated;

-- RPC para registrar upload via token (público)
CREATE OR REPLACE FUNCTION public.register_candidate_document_upload(
  _token uuid,
  _doc_type text,
  _file_name text,
  _file_path text,
  _mime_type text,
  _size_bytes bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _new_id uuid;
BEGIN
  SELECT id INTO _cid FROM public.job_candidates WHERE document_upload_token = _token LIMIT 1;
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  INSERT INTO public.candidate_document_uploads (candidate_id, doc_type, file_name, file_path, mime_type, size_bytes)
  VALUES (_cid, _doc_type, _file_name, _file_path, _mime_type, _size_bytes)
  RETURNING id INTO _new_id;
  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_candidate_document_upload(uuid, text, text, text, text, bigint) TO anon, authenticated;

-- RLS: equipe interna (admin/manager) pode ver/excluir
CREATE POLICY "Staff view candidate uploads"
ON public.candidate_document_uploads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff delete candidate uploads"
ON public.candidate_document_uploads
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Storage policies para bucket candidate-documents
-- Upload público: pasta com nome do token (validação no app + RPC)
CREATE POLICY "Public upload to candidate-documents by token folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND public.candidate_id_from_upload_token((storage.foldername(name))[1]::uuid) IS NOT NULL
);

CREATE POLICY "Staff read candidate-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Staff delete candidate-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
