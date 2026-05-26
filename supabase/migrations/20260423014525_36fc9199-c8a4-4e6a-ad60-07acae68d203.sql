-- RPC: cria múltiplas receitas em lote a partir de nomes (de itens não vinculados do PDV)
-- Para cada nome:
--   1) cria/encontra um produto "fantasma" no inventário (categoria 'Pratos', custo 0) com o mesmo nome
--   2) cria a receita (yield 1 UN, sem ingredientes — usuário preenche depois)
--   3) cria mapping pos_item_name → recipe_id (igual ao link_pos_item)
--   4) marca pos_sale_items existentes como match_status='recipe'
-- Retorna contagem do que foi criado.

CREATE OR REPLACE FUNCTION public.bulk_create_recipes_from_pos_names(_names TEXT[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT;
  v_norm TEXT;
  v_product_id UUID;
  v_recipe_id UUID;
  v_recipes_created INT := 0;
  v_products_created INT := 0;
  v_mappings_created INT := 0;
  v_items_updated INT := 0;
  v_tmp INT;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para criar receitas em lote';
  END IF;

  IF _names IS NULL OR array_length(_names, 1) IS NULL THEN
    RETURN jsonb_build_object('recipes_created', 0, 'products_created', 0, 'mappings_created', 0, 'items_updated', 0);
  END IF;

  FOREACH v_name IN ARRAY _names LOOP
    v_name := trim(v_name);
    CONTINUE WHEN v_name = '' OR v_name IS NULL;
    v_norm := public.normalize_pos_name(v_name);

    -- Pula se já existe mapping pra esse nome
    IF EXISTS (SELECT 1 FROM public.pos_item_mappings WHERE public.normalize_pos_name(pos_item_name) = v_norm) THEN
      CONTINUE;
    END IF;

    -- 1) Produto fantasma (procura por nome igual com categoria 'Pratos', senão cria)
    SELECT id INTO v_product_id
      FROM public.inventory_products
     WHERE lower(name) = lower(v_name)
       AND coalesce(category,'') = 'Pratos'
     LIMIT 1;

    IF v_product_id IS NULL THEN
      INSERT INTO public.inventory_products (name, unit, category, average_cost, is_active, created_by, notes)
      VALUES (v_name, 'UN', 'Pratos', 0, true, v_uid, 'Criado automaticamente como saída de receita do PDV')
      RETURNING id INTO v_product_id;
      v_products_created := v_products_created + 1;
    END IF;

    -- 2) Receita vazia (procura por nome igual, senão cria)
    SELECT id INTO v_recipe_id
      FROM public.recipes
     WHERE lower(name) = lower(v_name)
     LIMIT 1;

    IF v_recipe_id IS NULL THEN
      INSERT INTO public.recipes (name, output_product_id, yield_quantity, yield_unit, is_active, created_by, notes)
      VALUES (v_name, v_product_id, 1, 'UN', true, v_uid, 'Criada via importação de itens do PDV. Adicione os ingredientes para baixar estoque.')
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

    -- 4) Atualiza vendas existentes (marca como 'recipe' — ainda sem baixa porque receita não tem ingredientes)
    UPDATE public.pos_sale_items
       SET match_status = 'recipe'
     WHERE public.normalize_pos_name(product_name) = v_norm;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_items_updated := v_items_updated + v_tmp;
  END LOOP;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'products_created', v_products_created,
    'mappings_created', v_mappings_created,
    'items_updated', v_items_updated
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_create_recipes_from_pos_names(TEXT[]) TO authenticated;