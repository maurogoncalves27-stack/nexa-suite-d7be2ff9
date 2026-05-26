ALTER TABLE public.inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_product_type_check;
ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_product_type_check
  CHECK (product_type = ANY (ARRAY['insumo'::text, 'revenda'::text, 'produzido'::text, 'embalagem'::text]));