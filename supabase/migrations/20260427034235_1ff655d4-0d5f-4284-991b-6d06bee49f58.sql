CREATE OR REPLACE FUNCTION public.friday_separation_checklist()
 RETURNS TABLE(store_id uuid, store_name text, storage_group text, product_id uuid, product_name text, unit text, quantity numeric, current_stock numeric, min_qty numeric, max_qty numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_factory_id uuid;
BEGIN
  SELECT id INTO v_factory_id FROM public.stores WHERE store_type = 'fabrica' LIMIT 1;
  IF v_factory_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH transfers AS (
    SELECT t.destination_store_id AS s_id, t.product_id AS p_id, t.suggested_qty AS qty
      FROM public.suggest_transfers(v_factory_id) t
     WHERE t.suggested_qty > 0
  )
  SELECT s.id, s.name, public.classify_product_storage_group(ip.name),
         ip.id, ip.name, ip.unit, tr.qty,
         COALESCE(ist.quantity, 0), COALESCE(ist.min_qty, 0), COALESCE(ist.max_qty, 0)
    FROM transfers tr
    JOIN public.stores s ON s.id = tr.s_id
    JOIN public.inventory_products ip ON ip.id = tr.p_id
    LEFT JOIN public.inventory_stock ist ON ist.store_id = tr.s_id AND ist.product_id = tr.p_id
   WHERE COALESCE(s.is_virtual, false) = false AND COALESCE(s.is_active, true) = true
   ORDER BY s.name, public.classify_product_storage_group(ip.name), ip.name;
END;
$function$;