-- Habilitar extensão de busca por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabela oficial de CBOs (Classificação Brasileira de Ocupações)
CREATE TABLE IF NOT EXISTS public.cbo_codes (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  synonyms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cbo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read CBO codes"
ON public.cbo_codes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage CBO codes"
ON public.cbo_codes FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Índices de busca textual
CREATE INDEX IF NOT EXISTS idx_cbo_codes_title_trgm
  ON public.cbo_codes USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cbo_codes_synonyms_trgm
  ON public.cbo_codes USING gin (synonyms gin_trgm_ops);

-- Adicionar CBO ao cadastro de cargos
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS cbo_code TEXT REFERENCES public.cbo_codes(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cbo_title TEXT;