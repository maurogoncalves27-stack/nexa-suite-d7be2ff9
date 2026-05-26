-- Adicionar scope nas receitas (fabrica ou loja)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'loja'
CHECK (scope IN ('fabrica', 'loja'));

CREATE INDEX IF NOT EXISTS idx_recipes_scope ON public.recipes(scope);

COMMENT ON COLUMN public.recipes.scope IS 'Escopo da ficha técnica: fabrica = produzida apenas na fábrica; loja = produzida apenas nas lojas';