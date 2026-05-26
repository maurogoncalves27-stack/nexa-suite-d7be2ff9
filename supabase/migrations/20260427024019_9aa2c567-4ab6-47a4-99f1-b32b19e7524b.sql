-- 1. Adicionar campos opcionais de validade nos itens da nota fiscal
ALTER TABLE public.inventory_invoice_items
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS manufacture_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- 2. Atualizar a função receive_invoice_item para criar lote automaticamente
-- quando houver data de validade preenchida no item
CREATE OR REPLACE FUNCTION public.receive_invoice_item(_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_store UUID;
  v_mov_id UUID;
BEGIN
  IF NOT public.can_receive_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para receber mercadorias';
  END IF;

  SELECT i.*, inv.store_id AS store_id
    INTO v_item
    FROM public.inventory_invoice_items i
    JOIN public.inventory_invoices inv ON inv.id = i.invoice_id
   WHERE i.id = _item_id;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;
  IF v_item.received THEN
    RAISE EXCEPTION 'Item já foi recebido';
  END IF;
  IF v_item.product_id IS NULL THEN
    RAISE EXCEPTION 'Vincule este item a um produto antes de receber';
  END IF;

  v_store := v_item.store_id;

  IF NOT public.user_can_access_store(auth.uid(), v_store) THEN
    RAISE EXCEPTION 'Sem acesso à loja desta nota';
  END IF;

  -- Movimento de entrada (alimenta estoque)
  INSERT INTO public.inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, invoice_item_id, invoice_id, reason, created_by)
  VALUES
    (v_store, v_item.product_id, 'entrada', v_item.quantity, v_item.unit_value, v_item.id, v_item.invoice_id, 'Recebimento de nota fiscal', auth.uid())
  RETURNING id INTO v_mov_id;

  -- Se houver data de validade, criar lote automaticamente
  IF v_item.expiry_date IS NOT NULL THEN
    INSERT INTO public.inventory_lots (
      store_id,
      product_id,
      lot_number,
      quantity,
      initial_quantity,
      unit_cost,
      manufacture_date,
      expiry_date,
      status,
      notes,
      created_by
    ) VALUES (
      v_store,
      v_item.product_id,
      v_item.lot_number,
      v_item.quantity,
      v_item.quantity,
      v_item.unit_value,
      v_item.manufacture_date,
      v_item.expiry_date,
      'active',
      'Lote criado no recebimento da nota fiscal',
      auth.uid()
    );
  END IF;

  UPDATE public.inventory_invoice_items
     SET received = true,
         received_at = now(),
         received_by = auth.uid(),
         updated_at = now()
   WHERE id = _item_id;

  RETURN v_mov_id;
END;
$function$;