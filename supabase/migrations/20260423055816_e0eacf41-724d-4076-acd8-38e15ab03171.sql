-- Remove função redundante criada antes
DROP FUNCTION IF EXISTS public.receive_inventory_transfer(uuid, text);

-- Atualiza confirm_inventory_transfer para propagar o lote
CREATE OR REPLACE FUNCTION public.confirm_inventory_transfer(_transfer_id uuid, _receiver_name text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_t RECORD;
  v_item RECORD;
  v_origin_lot RECORD;
  v_new_lot_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_t FROM public.inventory_transfers WHERE id = _transfer_id;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_t.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Esta transferência não está em trânsito (status: %)', v_t.status;
  END IF;
  IF NOT public.user_can_access_store(v_uid, v_t.destination_store_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja de destino';
  END IF;

  -- Para cada item: se vier com lote, cria lote-filho na loja destino
  FOR v_item IN
    SELECT id, product_id, quantity, unit_cost, lot_id
      FROM public.inventory_transfer_items
     WHERE transfer_id = _transfer_id
  LOOP
    v_new_lot_id := NULL;

    IF v_item.lot_id IS NOT NULL THEN
      SELECT * INTO v_origin_lot FROM public.inventory_lots WHERE id = v_item.lot_id;
      IF v_origin_lot.id IS NOT NULL THEN
        INSERT INTO public.inventory_lots (
          store_id, product_id, lot_number, quantity, initial_quantity,
          unit_cost, manufacture_date, expiry_date, notes,
          status, parent_lot_id, origin_transfer_id, created_by
        ) VALUES (
          v_t.destination_store_id,
          v_origin_lot.product_id,
          v_origin_lot.lot_number,
          v_item.quantity,
          v_item.quantity,
          COALESCE(NULLIF(v_item.unit_cost, 0), v_origin_lot.unit_cost),
          v_origin_lot.manufacture_date,
          v_origin_lot.expiry_date,
          'Recebido por transferência (lote pai: ' || v_origin_lot.id::text || ')',
          'active',
          v_origin_lot.id,
          _transfer_id,
          v_uid
        ) RETURNING id INTO v_new_lot_id;

        UPDATE public.inventory_transfer_items
           SET destination_lot_id = v_new_lot_id
         WHERE id = v_item.id;
      END IF;
    END IF;

    -- Entrada de estoque na loja destino
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_t.destination_store_id, v_item.product_id, 'entrada', v_item.quantity,
       NULLIF(v_item.unit_cost, 0),
       'Recebimento de transferência ' || _transfer_id::text
         || CASE WHEN v_new_lot_id IS NOT NULL THEN ' — lote ' || v_new_lot_id::text ELSE '' END,
       v_uid);
  END LOOP;

  UPDATE public.inventory_transfers
     SET status = 'received',
         received_by = v_uid,
         received_at = now(),
         receiver_name = COALESCE(_receiver_name, receiver_name),
         updated_at = now()
   WHERE id = _transfer_id;

  RETURN TRUE;
END;
$function$;