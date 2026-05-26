CREATE OR REPLACE FUNCTION public.submit_inventory_count(_count_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_count RECORD;
  v_div INT;
  v_val NUMERIC(14,4);
  v_store_name TEXT;
BEGIN
  SELECT * INTO v_count FROM inventory_counts WHERE id = _count_id;
  IF v_count IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_count.status <> 'open' THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager') OR user_can_access_store(v_uid, v_count.store_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  SELECT COUNT(*) FILTER (WHERE difference <> 0),
         COALESCE(SUM(difference_value), 0)
    INTO v_div, v_val
    FROM inventory_count_items
   WHERE count_id = _count_id;

  UPDATE inventory_counts
     SET status = 'submitted',
         submitted_by = v_uid,
         submitted_at = now(),
         divergent_items = v_div,
         total_difference_value = v_val
   WHERE id = _count_id;

  -- Nome da loja para a notificação
  SELECT name INTO v_store_name FROM stores WHERE id = v_count.store_id;

  -- Notifica todos os admins e gerentes (uma notificação por usuário)
  INSERT INTO public.user_notifications (user_id, title, message, url, tag, category)
  SELECT DISTINCT ur.user_id,
         'Contagem de estoque enviada',
         v_store_name || ' enviou a contagem' ||
           CASE WHEN v_div > 0
                THEN ' com ' || v_div || ' item(ns) divergente(s) (' ||
                     to_char(v_val, 'FM999G999G990D00') || ')'
                ELSE ' sem divergências'
           END || '. Toque para revisar e aprovar.',
         '/contagem-estoque',
         'inventory_count_submitted:' || _count_id::text,
         'inventory'
    FROM public.user_roles ur
   WHERE ur.role IN ('admin','manager')
     AND ur.user_id <> v_uid;
END;
$function$;