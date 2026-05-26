ALTER TABLE public.inventory_products
ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'insumo'
CHECK (product_type IN ('insumo', 'revenda', 'produzido'));

CREATE INDEX IF NOT EXISTS idx_inventory_products_product_type ON public.inventory_products(product_type);

COMMENT ON COLUMN public.inventory_products.product_type IS 'insumo: comprado e usado em receitas; revenda: comprado e vendido direto; produzido: fabricado e vendido';

UPDATE public.inventory_products p
SET product_type = 'produzido'
WHERE EXISTS (SELECT 1 FROM public.recipes r WHERE r.output_product_id = p.id);