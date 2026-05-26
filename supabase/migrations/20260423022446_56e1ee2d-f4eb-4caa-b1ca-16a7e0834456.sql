CREATE OR REPLACE FUNCTION public.import_saipos_menu(_dishes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dish jsonb;
  v_comp jsonb;
  v_uid uuid := auth.uid();
  v_dish_name text;
  v_dish_category text;
  v_dish_price numeric;
  v_comp_name text;
  v_comp_price numeric;
  v_product_id uuid;
  v_recipe_id uuid;
  v_comp_product_id uuid;
  v_existing_product_id uuid;
  v_existing_recipe_id uuid;
  v_free_complements text;
  v_was_inserted boolean;
  v_dishes_created int := 0;
  v_dishes_updated int := 0;
  v_comps_created int := 0;
  v_comps_updated int := 0;
  v_mappings_created int := 0;
  v_mappings_updated int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  IF NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin/gerente pode importar cardápio';
  END IF;

  FOR v_dish IN SELECT * FROM jsonb_array_elements(_dishes) LOOP
    v_dish_name := trim(v_dish->>'name');
    v_dish_category := coalesce(nullif(trim(v_dish->>'category'), ''), 'Pratos');
    v_dish_price := coalesce((v_dish->>'price')::numeric, 0);

    CONTINUE WHEN v_dish_name IS NULL OR v_dish_name = '';

    SELECT id INTO v_existing_product_id
    FROM inventory_products
    WHERE lower(name) = lower(v_dish_name)
    LIMIT 1;

    IF v_existing_product_id IS NOT NULL THEN
      UPDATE inventory_products
      SET category = v_dish_category,
          last_cost = CASE WHEN v_dish_price > 0 THEN v_dish_price ELSE last_cost END,
          updated_at = now()
      WHERE id = v_existing_product_id;
      v_product_id := v_existing_product_id;
      v_dishes_updated := v_dishes_updated + 1;
    ELSE
      INSERT INTO inventory_products (name, category, unit, last_cost, average_cost, created_by)
      VALUES (v_dish_name, v_dish_category, 'UN', v_dish_price, 0, v_uid)
      RETURNING id INTO v_product_id;
      v_dishes_created := v_dishes_created + 1;
    END IF;

    v_free_complements := NULL;
    SELECT string_agg(
      coalesce(c->>'complement', '') || ' - ' || coalesce(c->>'option', ''),
      E'\n'
      ORDER BY (c->>'complement'), (c->>'option')
    )
    INTO v_free_complements
    FROM jsonb_array_elements(coalesce(v_dish->'complements', '[]'::jsonb)) c
    WHERE coalesce((c->>'price')::numeric, 0) = 0;

    SELECT id INTO v_existing_recipe_id
    FROM recipes
    WHERE output_product_id = v_product_id
    LIMIT 1;

    IF v_existing_recipe_id IS NOT NULL THEN
      UPDATE recipes
      SET name = v_dish_name,
          notes = CASE
            WHEN v_free_complements IS NOT NULL
              THEN 'Importado do Saipos.' || E'\n\nOpções inclusas:\n' || v_free_complements
            ELSE 'Importado do Saipos.'
          END,
          updated_at = now()
      WHERE id = v_existing_recipe_id;
      v_recipe_id := v_existing_recipe_id;
    ELSE
      INSERT INTO recipes (name, output_product_id, yield_quantity, yield_unit, notes, created_by)
      VALUES (
        v_dish_name,
        v_product_id,
        1,
        'UN',
        CASE
          WHEN v_free_complements IS NOT NULL
            THEN 'Importado do Saipos.' || E'\n\nOpções inclusas:\n' || v_free_complements
          ELSE 'Importado do Saipos.'
        END,
        v_uid
      )
      RETURNING id INTO v_recipe_id;
    END IF;

    INSERT INTO pos_item_mappings (pos_item_name, recipe_id, created_by)
    VALUES (v_dish_name, v_recipe_id, v_uid)
    ON CONFLICT (pos_item_name) DO UPDATE
      SET recipe_id = EXCLUDED.recipe_id,
          inventory_product_id = NULL,
          updated_at = now()
    RETURNING (xmax = 0) INTO v_was_inserted;

    IF v_was_inserted THEN
      v_mappings_created := v_mappings_created + 1;
    ELSE
      v_mappings_updated := v_mappings_updated + 1;
    END IF;

    FOR v_comp IN
      SELECT c.value FROM jsonb_array_elements(coalesce(v_dish->'complements', '[]'::jsonb)) c
      WHERE coalesce((c.value->>'price')::numeric, 0) > 0
    LOOP
      v_comp_name := trim(coalesce(v_comp->>'option', ''));
      v_comp_price := coalesce((v_comp->>'price')::numeric, 0);
      CONTINUE WHEN v_comp_name = '';

      SELECT id INTO v_existing_product_id
      FROM inventory_products
      WHERE lower(name) = lower(v_comp_name)
      LIMIT 1;

      IF v_existing_product_id IS NOT NULL THEN
        UPDATE inventory_products
        SET category = coalesce(category, 'Adicionais'),
            last_cost = v_comp_price,
            updated_at = now()
        WHERE id = v_existing_product_id;
        v_comps_updated := v_comps_updated + 1;
      ELSE
        INSERT INTO inventory_products (name, category, unit, last_cost, average_cost, created_by, notes)
        VALUES (v_comp_name, 'Adicionais', 'UN', v_comp_price, 0, v_uid,
                'Adicional do prato: ' || v_dish_name)
        RETURNING id INTO v_comp_product_id;
        v_comps_created := v_comps_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'dishes_created', v_dishes_created,
    'dishes_updated', v_dishes_updated,
    'complements_created', v_comps_created,
    'complements_updated', v_comps_updated,
    'mappings_created', v_mappings_created,
    'mappings_updated', v_mappings_updated
  );
END;
$function$;