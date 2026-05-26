ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.inventory_products.is_internal IS
  'Produto produzido internamente via ficha de preparo (não comprado em NF-e). Saída de uma recipe via output_product_id.';

CREATE INDEX IF NOT EXISTS idx_recipes_output_product
  ON public.recipes(output_product_id)
  WHERE output_product_id IS NOT NULL;