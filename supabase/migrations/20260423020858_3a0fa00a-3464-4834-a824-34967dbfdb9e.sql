CREATE OR REPLACE FUNCTION public.bulk_import_menu_items(_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_item jsonb;
  v_name TEXT;
  v_category TEXT;
  v_description TEXT;
  v_price NUMERIC(14,2);
  v_norm TEXT;
  v_product_id UUID;
  v_recipe_id UUID;
  v_recipes_created INT := 0;
  v_products_created INT := 0;
  v_mappings_created INT := 0;
  v_skipped INT := 0;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para importar cardápio';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RETURN jsonb_build_object('recipes_created', 0, 'products_created', 0, 'mappings_created', 0, 'skipped', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(coalesce(v_item->>'name', ''));
    CONTINUE WHEN v_name = '';
    v_category := nullif(trim(coalesce(v_item->>'category', '')), '');
    v_description := nullif(trim(coalesce(v_item->>'description', '')), '');
    v_price := nullif((v_item->>'price'), '')::numeric;
    v_norm := public.normalize_pos_name(v_name);

    -- Pula se já existe mapping
    IF EXISTS (SELECT 1 FROM public.pos_item_mappings WHERE public.normalize_pos_name(pos_item_name) = v_norm) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- 1) Produto
    SELECT id INTO v_product_id
      FROM public.inventory_products
     WHERE lower(name) = lower(v_name)
       AND coalesce(category,'') = coalesce(v_category, 'Pratos')
     LIMIT 1;

    IF v_product_id IS NULL THEN
      INSERT INTO public.inventory_products (name, unit, category, average_cost, last_cost, is_active, created_by, notes)
      VALUES (v_name, 'UN', coalesce(v_category, 'Pratos'), 0, v_price, true, v_uid,
              'Importado do cardápio via prints. ' || coalesce('Preço de venda: R$ ' || v_price::text || '. ', '') || coalesce(v_description, ''))
      RETURNING id INTO v_product_id;
      v_products_created := v_products_created + 1;
    END IF;

    -- 2) Receita
    SELECT id INTO v_recipe_id FROM public.recipes WHERE lower(name) = lower(v_name) LIMIT 1;

    IF v_recipe_id IS NULL THEN
      INSERT INTO public.recipes (name, description, output_product_id, yield_quantity, yield_unit, is_active, created_by, notes)
      VALUES (v_name, v_description, v_product_id, 1, 'UN', true, v_uid,
              'Importada do cardápio. ' || coalesce('Categoria: ' || v_category || '. ', '') || coalesce('Preço de venda: R$ ' || v_price::text || '.', '') || ' Adicione os ingredientes para baixar estoque.')
      RETURNING id INTO v_recipe_id;
      v_recipes_created := v_recipes_created + 1;
    END IF;

    -- 3) Mapeamento PDV → receita
    INSERT INTO public.pos_item_mappings (pos_item_name, recipe_id, created_by)
    VALUES (v_name, v_recipe_id, v_uid)
    ON CONFLICT (pos_item_name) DO UPDATE
      SET recipe_id = EXCLUDED.recipe_id,
          inventory_product_id = NULL,
          updated_at = now();
    v_mappings_created := v_mappings_created + 1;

    -- 4) Atualiza vendas existentes
    UPDATE public.pos_sale_items
       SET match_status = 'recipe'
     WHERE public.normalize_pos_name(product_name) = v_norm;
  END LOOP;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'products_created', v_products_created,
    'mappings_created', v_mappings_created,
    'skipped', v_skipped
  );
END;
$function$;