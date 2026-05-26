ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS book_ingredients JSONB;