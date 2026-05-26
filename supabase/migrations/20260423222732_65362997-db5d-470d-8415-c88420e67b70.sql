-- =========================================================
-- MÓDULO FISCAL — Fase 1 (cadastro + estrutura de notas)
-- =========================================================

-- 1) Configurações fiscais por loja
CREATE TABLE public.fiscal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL,
  ie TEXT,
  im TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  regime_tributario TEXT NOT NULL DEFAULT 'lucro_presumido'
    CHECK (regime_tributario IN ('simples_nacional','lucro_presumido','lucro_real','mei')),
  -- Endereço fiscal
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf CHAR(2),
  endereco_cep TEXT,
  endereco_codigo_municipio TEXT, -- IBGE
  -- NFC-e
  nfce_serie INTEGER NOT NULL DEFAULT 1,
  nfce_proximo_numero INTEGER NOT NULL DEFAULT 1,
  nfce_csc_id TEXT,    -- ID do CSC (token de homologação)
  nfce_csc_token TEXT, -- token CSC (referenciado, não exposto)
  -- NF-e
  nfe_serie INTEGER NOT NULL DEFAULT 1,
  nfe_proximo_numero INTEGER NOT NULL DEFAULT 1,
  -- Emissor (NFe.io)
  provider TEXT NOT NULL DEFAULT 'nfeio'
    CHECK (provider IN ('nfeio','focusnfe','enotas','plugnotas','manual')),
  provider_company_id TEXT, -- ID da empresa cadastrada no NFe.io
  ambiente TEXT NOT NULL DEFAULT 'homologacao'
    CHECK (ambiente IN ('homologacao','producao')),
  email_envio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

CREATE INDEX idx_fiscal_settings_store ON public.fiscal_settings(store_id);

ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager veem configurações fiscais"
  ON public.fiscal_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager criam configurações fiscais"
  ON public.fiscal_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager editam configurações fiscais"
  ON public.fiscal_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager excluem configurações fiscais"
  ON public.fiscal_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_fiscal_settings_updated
  BEFORE UPDATE ON public.fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Documentos fiscais emitidos
CREATE TABLE public.fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('nfce','nfe','nfe_transferencia')),
  numero INTEGER,
  serie INTEGER,
  chave_acesso TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviando','autorizada','rejeitada','cancelada','denegada','inutilizada')),
  ambiente TEXT NOT NULL DEFAULT 'homologacao'
    CHECK (ambiente IN ('homologacao','producao')),
  data_emissao TIMESTAMPTZ,
  -- Destinatário (opcional p/ NFC-e, obrigatório p/ NF-e)
  dest_cpf_cnpj TEXT,
  dest_nome TEXT,
  dest_email TEXT,
  dest_endereco JSONB,
  -- Loja destino (caso seja transferência entre lojas)
  destino_store_id UUID REFERENCES public.stores(id),
  -- Valores
  valor_produtos NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_frete NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Pagamento
  forma_pagamento TEXT, -- dinheiro, pix, credito, debito, etc
  -- Vínculos opcionais
  pos_sale_id UUID,
  inventory_transfer_id UUID,
  -- Provider
  provider TEXT NOT NULL DEFAULT 'nfeio',
  provider_document_id TEXT, -- ID que o NFe.io devolve
  provider_response JSONB,
  pdf_url TEXT,
  xml_url TEXT,
  -- Cancelamento / rejeição
  motivo_rejeicao TEXT,
  motivo_cancelamento TEXT,
  cancelada_em TIMESTAMPTZ,
  cancelada_por UUID,
  -- Metadados
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fiscal_documents_store ON public.fiscal_documents(store_id);
CREATE INDEX idx_fiscal_documents_status ON public.fiscal_documents(status);
CREATE INDEX idx_fiscal_documents_tipo ON public.fiscal_documents(tipo);
CREATE INDEX idx_fiscal_documents_data ON public.fiscal_documents(data_emissao DESC);
CREATE INDEX idx_fiscal_documents_chave ON public.fiscal_documents(chave_acesso) WHERE chave_acesso IS NOT NULL;

ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager veem documentos fiscais"
  ON public.fiscal_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager criam documentos fiscais"
  ON public.fiscal_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager editam documentos fiscais"
  ON public.fiscal_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager excluem documentos fiscais"
  ON public.fiscal_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_fiscal_documents_updated
  BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Itens dos documentos fiscais
CREATE TABLE public.fiscal_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  -- Snapshot dos dados do produto no momento da emissão
  codigo TEXT,
  descricao TEXT NOT NULL,
  ean TEXT,
  ncm TEXT,
  cest TEXT,
  cfop TEXT NOT NULL,
  cst_csosn TEXT,
  origem TEXT, -- 0..8
  unidade_tributavel TEXT NOT NULL DEFAULT 'UN',
  quantidade NUMERIC(14,4) NOT NULL,
  valor_unitario NUMERIC(14,4) NOT NULL,
  valor_total NUMERIC(14,2) NOT NULL,
  valor_desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Impostos calculados (snapshot)
  icms_aliquota NUMERIC(6,3),
  icms_valor NUMERIC(14,2),
  pis_aliquota NUMERIC(6,3),
  pis_valor NUMERIC(14,2),
  cofins_aliquota NUMERIC(6,3),
  cofins_valor NUMERIC(14,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fiscal_doc_items_doc ON public.fiscal_document_items(document_id);
CREATE INDEX idx_fiscal_doc_items_product ON public.fiscal_document_items(product_id);

ALTER TABLE public.fiscal_document_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager veem itens fiscais"
  ON public.fiscal_document_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager criam itens fiscais"
  ON public.fiscal_document_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager editam itens fiscais"
  ON public.fiscal_document_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/manager excluem itens fiscais"
  ON public.fiscal_document_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 4) Campos fiscais opcionais nos produtos
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS cest TEXT,
  ADD COLUMN IF NOT EXISTS cfop_venda TEXT DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS cfop_transferencia TEXT DEFAULT '5152',
  ADD COLUMN IF NOT EXISTS cst_csosn TEXT,
  ADD COLUMN IF NOT EXISTS origem_mercadoria TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS unidade_tributavel TEXT;