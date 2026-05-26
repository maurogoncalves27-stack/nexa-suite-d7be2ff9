ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.recipes
DROP CONSTRAINT IF EXISTS recipes_category_check;

ALTER TABLE public.recipes
ADD CONSTRAINT recipes_category_check
CHECK (category IS NULL OR category IN ('individual','casal','familia'));

CREATE INDEX IF NOT EXISTS idx_recipes_category ON public.recipes(category);