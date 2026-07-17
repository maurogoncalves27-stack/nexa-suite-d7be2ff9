ALTER TABLE public.uniform_items ALTER COLUMN category SET DEFAULT 'superior';
COMMENT ON COLUMN public.uniform_items.category IS 'superior, inferior, calcado, epi, acessorio (vestuario = legado)';
