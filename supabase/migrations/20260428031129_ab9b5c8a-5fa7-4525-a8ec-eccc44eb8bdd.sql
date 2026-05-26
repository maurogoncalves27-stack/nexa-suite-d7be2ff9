ALTER TABLE public.inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_product_type_check;
ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_product_type_check
  CHECK (product_type = ANY (ARRAY['insumo'::text, 'revenda'::text, 'produzido'::text, 'embalagem'::text, 'personalizado'::text]));

UPDATE public.inventory_products
SET product_type = 'personalizado'
WHERE is_custom = true AND product_type <> 'personalizado';