
CREATE TYPE public.sst_doc_type AS ENUM ('pcmso','pgr','ltcat','ltip','psicossocial_nr1','relatorio_psicossocial','outros');

CREATE TABLE public.sst_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.sst_doc_type NOT NULL,
  cnpj TEXT NOT NULL,
  company_name TEXT NOT NULL,
  emitted_at DATE NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  notes TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_documents TO authenticated;
GRANT ALL ON public.sst_documents TO service_role;
ALTER TABLE public.sst_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SST admin/hr/contab manage" ON public.sst_documents
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
);

CREATE TABLE public.sst_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.sst_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  emitted_at DATE NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  superseded_at TIMESTAMPTZ,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_document_versions TO authenticated;
GRANT ALL ON public.sst_document_versions TO service_role;
ALTER TABLE public.sst_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SST versions admin/hr/contab manage" ON public.sst_document_versions
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
);

CREATE TRIGGER trg_sst_documents_updated
BEFORE UPDATE ON public.sst_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sst_documents_active ON public.sst_documents(is_active, doc_type, cnpj);
CREATE INDEX idx_sst_versions_doc ON public.sst_document_versions(document_id, version_number DESC);

CREATE POLICY "SST bucket read admin/hr/contab" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'sst-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'contabilidade'::app_role)
  )
);

CREATE POLICY "SST bucket insert admin/hr/contab" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sst-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'contabilidade'::app_role)
  )
);

CREATE POLICY "SST bucket update admin/hr/contab" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'sst-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'contabilidade'::app_role)
  )
);

CREATE POLICY "SST bucket delete admin/hr/contab" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'sst-documents' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'contabilidade'::app_role)
  )
);
