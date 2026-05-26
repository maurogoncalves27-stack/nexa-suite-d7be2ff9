
INSERT INTO public.brands (name, slug, is_active, sort_order)
SELECT 'FÁBRICA', 'fabrica', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE slug = 'fabrica');

CREATE TABLE IF NOT EXISTS public.recipe_brands (
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_brands_brand ON public.recipe_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_recipe_brands_recipe ON public.recipe_brands(recipe_id);

ALTER TABLE public.recipe_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recipe_brands"
ON public.recipe_brands FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert recipe_brands"
ON public.recipe_brands FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can delete recipe_brands"
ON public.recipe_brands FOR DELETE
TO authenticated
USING (true);
