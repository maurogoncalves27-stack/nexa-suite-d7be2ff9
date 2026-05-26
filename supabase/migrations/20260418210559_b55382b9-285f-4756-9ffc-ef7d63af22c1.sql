-- Tabela principal de documentos customizados
CREATE TABLE public.custom_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versões do documento (cada edição cria nova versão)
CREATE TABLE public.custom_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.custom_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  target_positions TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

-- Assinaturas
CREATE TABLE public.custom_document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.custom_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.custom_document_versions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE (document_id, version_id, user_id)
);

CREATE INDEX idx_cdv_document ON public.custom_document_versions(document_id);
CREATE INDEX idx_cds_document_user ON public.custom_document_signatures(document_id, user_id);

-- Trigger updated_at
CREATE TRIGGER trg_custom_documents_updated_at
  BEFORE UPDATE ON public.custom_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.custom_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_document_signatures ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: posição do colaborador autenticado
CREATE OR REPLACE FUNCTION public.current_user_position()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT position FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Policies custom_documents
CREATE POLICY "Staff manage custom_documents"
  ON public.custom_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employees view documents for their position"
  ON public.custom_documents FOR SELECT
  USING (
    is_active AND EXISTS (
      SELECT 1 FROM public.custom_document_versions v
      WHERE v.document_id = custom_documents.id
        AND v.version_number = custom_documents.current_version
        AND public.current_user_position() = ANY(v.target_positions)
    )
  );

-- Policies versions
CREATE POLICY "Staff manage versions"
  ON public.custom_document_versions FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employees view versions of their docs"
  ON public.custom_document_versions FOR SELECT
  USING (
    public.current_user_position() = ANY(target_positions)
    OR EXISTS (
      SELECT 1 FROM public.custom_document_signatures s
      WHERE s.version_id = custom_document_versions.id AND s.user_id = auth.uid()
    )
  );

-- Policies signatures
CREATE POLICY "Staff view all signatures"
  ON public.custom_document_signatures FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Users view own signatures"
  ON public.custom_document_signatures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own signatures"
  ON public.custom_document_signatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);