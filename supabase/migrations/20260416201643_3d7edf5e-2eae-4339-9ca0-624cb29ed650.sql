ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text;

CREATE UNIQUE INDEX IF NOT EXISTS stores_cnpj_unique ON public.stores (cnpj) WHERE cnpj IS NOT NULL;