
DO $$
DECLARE r RECORD; new_prod_id uuid;
BEGIN
  FOR r IN SELECT id, name, yield_unit FROM public.recipes WHERE scope='fabrica' AND output_product_id IS NULL AND is_active=true LOOP
    INSERT INTO public.inventory_products (name, unit, is_internal, factory_only, product_type, is_active)
    VALUES (r.name, COALESCE(r.yield_unit,'UN'), true, true, 'insumo', true)
    RETURNING id INTO new_prod_id;
    UPDATE public.recipes SET output_product_id = new_prod_id WHERE id = r.id;
  END LOOP;
END$$;
