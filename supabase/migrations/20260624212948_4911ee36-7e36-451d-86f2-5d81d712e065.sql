
-- ============================================================
-- 1) Deduplicar menu_items (por nome+preço) — preservar histórico
-- ============================================================
DO $$
DECLARE
  grp RECORD;
  canon uuid;
  dup_ids uuid[];
  d uuid;
BEGIN
  FOR grp IN
    SELECT lower(trim(name)) AS n, price, array_agg(id) AS ids
      FROM menu_items
     GROUP BY 1,2
    HAVING COUNT(*) > 1
  LOOP
    -- escolher canônico: prioriza com recipe_id; depois com mais marcas; depois menor id
    SELECT mi.id INTO canon
      FROM menu_items mi
      LEFT JOIN menu_item_brands mib ON mib.menu_item_id = mi.id
     WHERE mi.id = ANY(grp.ids)
     GROUP BY mi.id, mi.recipe_id
     ORDER BY (mi.recipe_id IS NOT NULL) DESC, COUNT(mib.brand_id) DESC, mi.id ASC
     LIMIT 1;

    dup_ids := ARRAY(SELECT unnest(grp.ids) EXCEPT SELECT canon);
    IF array_length(dup_ids,1) IS NULL THEN CONTINUE; END IF;

    -- merge marcas, lojas, componentes, complementos
    FOREACH d IN ARRAY dup_ids LOOP
      INSERT INTO menu_item_brands(menu_item_id, brand_id)
        SELECT canon, brand_id FROM menu_item_brands WHERE menu_item_id = d
        ON CONFLICT DO NOTHING;

      INSERT INTO menu_item_stores(menu_item_id, store_id, is_available)
        SELECT canon, store_id, is_available FROM menu_item_stores WHERE menu_item_id = d
        ON CONFLICT (menu_item_id, store_id) DO UPDATE
          SET is_available = menu_item_stores.is_available OR EXCLUDED.is_available;

      INSERT INTO menu_item_complement_links(menu_item_id, group_id, sort_order)
        SELECT canon, group_id, sort_order FROM menu_item_complement_links WHERE menu_item_id = d
        ON CONFLICT DO NOTHING;

      -- Não copiar grupos legados (menu_item_complement_groups) nem componentes pra não duplicar.
      -- Limpa vínculos do duplicado.
      DELETE FROM menu_item_brands WHERE menu_item_id = d;
      DELETE FROM menu_item_stores WHERE menu_item_id = d;
      DELETE FROM menu_item_complement_links WHERE menu_item_id = d;
      DELETE FROM menu_item_complement_groups WHERE menu_item_id = d;
      DELETE FROM menu_item_components WHERE parent_item_id = d OR child_item_id = d;
    END LOOP;

    -- desativar duplicados (preserva fk soft em order_items/cart_items)
    UPDATE menu_items SET is_active = false, updated_at = now()
     WHERE id = ANY(dup_ids);
  END LOOP;
END $$;

-- ============================================================
-- 2) Consumo de estoque para combos: expandir menu_item_components
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_pdv_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_already timestamptz;
  it RECORD;
  comp RECORD;
  v_recipe uuid;
  v_product uuid;
  ing RECORD;
  v_consume numeric;
  v_has_components boolean;
  v_label text;
BEGIN
  SELECT store_id, stock_consumed_at INTO v_store, v_already
    FROM pdv_orders WHERE id = p_order_id FOR UPDATE;
  IF v_already IS NOT NULL THEN RETURN; END IF;

  FOR it IN
    SELECT oi.id, oi.menu_item_id, oi.name, oi.quantity
      FROM pdv_order_items oi WHERE oi.order_id = p_order_id
  LOOP
    v_has_components := false;
    IF it.menu_item_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM menu_item_components WHERE parent_item_id = it.menu_item_id)
        INTO v_has_components;
    END IF;

    -- ============== COMBO: iterar componentes ==============
    IF v_has_components THEN
      FOR comp IN
        SELECT c.child_item_id, c.quantity AS comp_qty, mi.name AS child_name, mi.recipe_id
          FROM menu_item_components c
          JOIN menu_items mi ON mi.id = c.child_item_id
         WHERE c.parent_item_id = it.menu_item_id
      LOOP
        v_label := it.name || ' / ' || comp.child_name;
        IF comp.recipe_id IS NULL THEN
          INSERT INTO pdv_stock_consumption_log(order_id, order_item_id, item_name, quantity, status, message)
            VALUES (p_order_id, it.id, v_label, it.quantity * comp.comp_qty, 'no_mapping',
                    'Componente sem ficha técnica');
          CONTINUE;
        END IF;
        FOR ing IN
          SELECT product_id, quantity FROM recipe_ingredients WHERE recipe_id = comp.recipe_id
        LOOP
          v_consume := ing.quantity * it.quantity * comp.comp_qty;
          UPDATE inventory_stock
             SET quantity = quantity - v_consume, updated_at = now()
           WHERE store_id = v_store AND product_id = ing.product_id;
          IF NOT FOUND THEN
            INSERT INTO inventory_stock(store_id, product_id, quantity)
              VALUES (v_store, ing.product_id, -v_consume);
          END IF;
          INSERT INTO inventory_stock_movements(store_id, product_id, movement_type, quantity, reason, notes)
            VALUES (v_store, ing.product_id, 'saida', v_consume, 'venda_pdv',
                    'Pedido ' || p_order_id::text || ' / combo ' || v_label);
        END LOOP;
        INSERT INTO pdv_stock_consumption_log(order_id, order_item_id, item_name, quantity, status)
          VALUES (p_order_id, it.id, v_label, it.quantity * comp.comp_qty, 'ok');
      END LOOP;
      CONTINUE;
    END IF;

    -- ============== ITEM SIMPLES ==============
    v_recipe := NULL; v_product := NULL;
    IF it.menu_item_id IS NOT NULL THEN
      SELECT recipe_id INTO v_recipe FROM menu_items WHERE id = it.menu_item_id;
    END IF;
    IF v_recipe IS NULL AND v_product IS NULL THEN
      SELECT recipe_id, inventory_product_id INTO v_recipe, v_product
        FROM pos_item_mappings WHERE pos_item_name = it.name LIMIT 1;
    END IF;
    IF v_recipe IS NULL AND v_product IS NULL THEN
      INSERT INTO pdv_stock_consumption_log(order_id, order_item_id, item_name, quantity, status, message)
        VALUES (p_order_id, it.id, it.name, it.quantity, 'no_mapping',
                'Item sem receita ou mapeamento POS');
      CONTINUE;
    END IF;

    IF v_recipe IS NOT NULL THEN
      FOR ing IN
        SELECT product_id, quantity FROM recipe_ingredients WHERE recipe_id = v_recipe
      LOOP
        v_consume := ing.quantity * it.quantity;
        UPDATE inventory_stock
           SET quantity = quantity - v_consume, updated_at = now()
         WHERE store_id = v_store AND product_id = ing.product_id;
        IF NOT FOUND THEN
          INSERT INTO inventory_stock(store_id, product_id, quantity)
            VALUES (v_store, ing.product_id, -v_consume);
        END IF;
        INSERT INTO inventory_stock_movements(store_id, product_id, movement_type, quantity, reason, notes)
          VALUES (v_store, ing.product_id, 'saida', v_consume, 'venda_pdv',
                  'Pedido ' || p_order_id::text || ' / item ' || it.name);
      END LOOP;
      INSERT INTO pdv_stock_consumption_log(order_id, order_item_id, item_name, quantity, status)
        VALUES (p_order_id, it.id, it.name, it.quantity, 'ok');
    ELSE
      v_consume := it.quantity;
      UPDATE inventory_stock
         SET quantity = quantity - v_consume, updated_at = now()
       WHERE store_id = v_store AND product_id = v_product;
      IF NOT FOUND THEN
        INSERT INTO inventory_stock(store_id, product_id, quantity)
          VALUES (v_store, v_product, -v_consume);
      END IF;
      INSERT INTO inventory_stock_movements(store_id, product_id, movement_type, quantity, reason, notes)
        VALUES (v_store, v_product, 'saida', v_consume, 'venda_pdv',
                'Pedido ' || p_order_id::text || ' / item ' || it.name);
      INSERT INTO pdv_stock_consumption_log(order_id, order_item_id, item_name, quantity, status)
        VALUES (p_order_id, it.id, it.name, it.quantity, 'ok');
    END IF;
  END LOOP;

  UPDATE pdv_orders SET stock_consumed_at = now() WHERE id = p_order_id;
END $function$;
