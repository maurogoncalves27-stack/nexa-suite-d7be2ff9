ALTER TABLE public.recipe_books
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'loja';

ALTER TABLE public.recipe_books
  DROP CONSTRAINT IF EXISTS recipe_books_scope_check;
ALTER TABLE public.recipe_books
  ADD CONSTRAINT recipe_books_scope_check CHECK (scope IN ('fabrica','loja'));

-- Backfill: se o título casa com uma ficha de fábrica, marca como fábrica
UPDATE public.recipe_books rb
SET scope = 'fabrica'
FROM public.recipes r
WHERE rb.source_recipe_name = r.name
  AND r.scope = 'fabrica'
  AND rb.scope <> 'fabrica';

CREATE INDEX IF NOT EXISTS idx_recipe_books_scope ON public.recipe_books(scope);