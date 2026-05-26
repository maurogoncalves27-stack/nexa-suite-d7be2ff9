
-- Tabela de grupos de complementos por receita (ex: "Acompanhamento", "Vamos turbinar?")
CREATE TABLE public.recipe_complement_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, name)
);

CREATE INDEX idx_recipe_complement_groups_recipe ON public.recipe_complement_groups(recipe_id);

-- Tabela de opções dentro de cada grupo (ex: "Arroz + Fritas", "Mussarela extra")
CREATE TABLE public.recipe_complements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.recipe_complement_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  inventory_product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_complements_group ON public.recipe_complements(group_id);

-- RLS
ALTER TABLE public.recipe_complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_complements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view complement groups"
  ON public.recipe_complement_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manages complement groups"
  ON public.recipe_complement_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can view complements"
  ON public.recipe_complements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manages complements"
  ON public.recipe_complements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Triggers de updated_at
CREATE TRIGGER trg_recipe_complement_groups_updated_at
  BEFORE UPDATE ON public.recipe_complement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_recipe_complements_updated_at
  BEFORE UPDATE ON public.recipe_complements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atualiza a função de importação para popular grupos + complementos
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
  v_comp_group text;
  v_comp_price numeric;
  v_product_id uuid;
  v_recipe_id uuid;
  v_existing_product_id uuid;
  v_existing_recipe_id uuid;
  v_group_id uuid;
  v_was_inserted boolean;
  v_dishes_created int := 0;
  v_dishes_updated int := 0;
  v_comps_created int := 0;
  v_comps_updated int := 0;
  v_groups_created int := 0;
  v_mappings_created int := 0;
  v_mappings_updated int := 0;
  v_sort int;
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

    -- Produto (prato)
    SELECT id INTO v_existing_product_id
      FROM inventory_products
     WHERE lower(name) = lower(v_dish_name) LIMIT 1;

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

    -- Receita
    SELECT id INTO v_existing_recipe_id
      FROM recipes WHERE output_product_id = v_product_id LIMIT 1;

    IF v_existing_recipe_id IS NOT NULL THEN
      UPDATE recipes SET name = v_dish_name, updated_at = now()
       WHERE id = v_existing_recipe_id;
      v_recipe_id := v_existing_recipe_id;
    ELSE
      INSERT INTO recipes (name, output_product_id, yield_quantity, yield_unit, notes, created_by)
      VALUES (v_dish_name, v_product_id, 1, 'UN', 'Importado do Saipos.', v_uid)
      RETURNING id INTO v_recipe_id;
    END IF;

    -- Mapeamento PDV
    INSERT INTO pos_item_mappings (pos_item_name, recipe_id, created_by)
    VALUES (v_dish_name, v_recipe_id, v_uid)
    ON CONFLICT (pos_item_name) DO UPDATE
       SET recipe_id = EXCLUDED.recipe_id,
           inventory_product_id = NULL,
           updated_at = now()
    RETURNING (xmax = 0) INTO v_was_inserted;
    IF v_was_inserted THEN v_mappings_created := v_mappings_created + 1;
                      ELSE v_mappings_updated := v_mappings_updated + 1; END IF;

    -- Limpa complementos antigos para reimportar limpo
    DELETE FROM recipe_complement_groups WHERE recipe_id = v_recipe_id;

    -- Complementos: agrupa por "complement" (nome do grupo)
    v_sort := 0;
    FOR v_comp IN
      SELECT c.value FROM jsonb_array_elements(coalesce(v_dish->'complements', '[]'::jsonb)) c
    LOOP
      v_comp_group := nullif(trim(coalesce(v_comp->>'complement', '')), '');
      v_comp_name := trim(coalesce(v_comp->>'option', ''));
      v_comp_price := coalesce((v_comp->>'price')::numeric, 0);
      CONTINUE WHEN v_comp_name = '';
      IF v_comp_group IS NULL THEN v_comp_group := 'Adicionais'; END IF;

      -- Grupo (cria se não existe)
      SELECT id INTO v_group_id
        FROM recipe_complement_groups
       WHERE recipe_id = v_recipe_id AND name = v_comp_group LIMIT 1;
      IF v_group_id IS NULL THEN
        v_sort := v_sort + 1;
        INSERT INTO recipe_complement_groups (recipe_id, name, sort_order)
        VALUES (v_recipe_id, v_comp_group, v_sort)
        RETURNING id INTO v_group_id;
        v_groups_created := v_groups_created + 1;
      END IF;

      -- Opção
      INSERT INTO recipe_complements (group_id, name, price, sort_order)
      VALUES (v_group_id, v_comp_name, v_comp_price,
              (SELECT COALESCE(MAX(sort_order),0)+1 FROM recipe_complements WHERE group_id = v_group_id));
      v_comps_created := v_comps_created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'dishes_created', v_dishes_created,
    'dishes_updated', v_dishes_updated,
    'groups_created', v_groups_created,
    'complements_created', v_comps_created,
    'complements_updated', v_comps_updated,
    'mappings_created', v_mappings_created,
    'mappings_updated', v_mappings_updated
  );
END;
$function$;
