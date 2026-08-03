ALTER TABLE public.recipe_books
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_books_recipe_id ON public.recipe_books(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_books_menu_item_id ON public.recipe_books(menu_item_id);

UPDATE public.recipe_books rb
SET recipe_id = r.id
FROM public.recipes r
WHERE rb.recipe_id IS NULL
  AND public.giana_norm(r.name) = public.giana_norm(COALESCE(rb.source_recipe_name, rb.title));

UPDATE public.recipe_books rb
SET menu_item_id = mi.id
FROM public.menu_items mi
WHERE rb.menu_item_id IS NULL
  AND rb.recipe_id IS NOT NULL
  AND mi.recipe_id = rb.recipe_id;

UPDATE public.recipe_books rb
SET menu_item_id = mi.id
FROM public.menu_items mi
WHERE rb.menu_item_id IS NULL
  AND public.giana_norm(mi.name) = public.giana_norm(COALESCE(rb.source_recipe_name, rb.title));