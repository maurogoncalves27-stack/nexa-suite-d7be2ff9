ALTER TABLE public.recipe_ingredients
ADD COLUMN IF NOT EXISTS is_packaging boolean NOT NULL DEFAULT false;