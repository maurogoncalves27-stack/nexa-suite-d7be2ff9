CREATE OR REPLACE FUNCTION public.open_inventory_count(_store_id uuid, _category text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_count_id UUID;
  v_inserted INT;
  v_has_links BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager') OR user_can_access_store(v_uid, _store_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  -- Bloqueia abrir duas contagens abertas simultâneas para a mesma loja
  IF EXISTS (
    SELECT 1 FROM inventory_counts
    WHERE store_id = _store_id AND status IN ('open','submitted')
  ) THEN
    RAISE EXCEPTION 'Já existe uma contagem em andamento para esta loja';
  END IF;

  INSERT INTO inventory_counts (store_id, category_filter, notes, opened_by)
  VALUES (_store_id, _category, _notes, v_uid)
  RETURNING id INTO v_count_id;

  -- Se existirem vínculos product_store_links para esta loja, usa-os; caso contrário, todos produtos ativos
  SELECT EXISTS (SELECT 1 FROM product_store_links WHERE store_id = _store_id) INTO v_has_links;

  INSERT INTO inventory_count_items (count_id, product_id, system_quantity, unit_cost)
  SELECT v_count_id,
         p.id,
         COALESCE(s.quantity, 0),
         COALESCE(p.average_cost, 0)
    FROM inventory_products p
    LEFT JOIN inventory_stock s
           ON s.product_id = p.id
          AND s.store_id = _store_id
   WHERE p.is_active = true
     AND p.factory_only = false
     AND (_category IS NULL OR p.category = _category)
     AND (
       NOT v_has_links
       OR EXISTS (
         SELECT 1 FROM product_store_links psl
          WHERE psl.product_id = p.id AND psl.store_id = _store_id
       )
     );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE inventory_counts SET total_items = v_inserted WHERE id = v_count_id;

  RETURN v_count_id;
END;
$function$;