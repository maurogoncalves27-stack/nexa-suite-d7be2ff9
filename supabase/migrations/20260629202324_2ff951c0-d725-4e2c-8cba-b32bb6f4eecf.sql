-- Backfill: cria inventory_products internos para fichas das lojas (scope='loja') ativas que ainda não têm output_product_id, igual ao que foi feito para pre-preparos da fábrica. Isso permite que essas fichas apareçam no seletor de combos.
DO $$
DECLARE
  r RECORD;
  new_prod_id uuid;
BEGIN
  FOR r IN
    SELECT id, name, yield_unit
    FROM public.recipes
    WHERE scope = 'loja'
      AND is_active = true
      AND output_product_id IS NULL
  LOOP
    INSERT INTO public.inventory_products (name, unit, is_internal, factory_only, product_type, is_active)
    VALUES (r.name, COALESCE(r.yield_unit, 'UN'), true, false, 'insumo', true)
    RETURNING id INTO new_prod_id;

    UPDATE public.recipes SET output_product_id = new_prod_id WHERE id = r.id;
  END LOOP;
END $$;