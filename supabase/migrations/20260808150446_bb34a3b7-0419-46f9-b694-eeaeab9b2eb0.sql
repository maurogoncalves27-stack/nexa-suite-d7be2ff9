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
  v_pack NUMERIC;
  v_purchase_unit TEXT;
  v_qty NUMERIC;
  v_cost NUMERIC;
  v_cnpj TEXT;
  v_alias RECORD;
  v_conv RECORD;
BEGIN
  IF NOT public.can_receive_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para receber mercadorias';
  END IF;

  SELECT i.*,
         inv.store_id AS store_id,
         inv.supplier_cnpj AS supplier_cnpj
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

  -- Conversão padrão do produto (compra)
  SELECT c.from_unit, (c.to_qty / c.from_qty) AS pack
    INTO v_conv
    FROM public.product_conversions c
   WHERE c.product_id = v_item.product_id
     AND c.conversion_type = 'compra'
   ORDER BY c.is_default DESC, c.updated_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_pack := v_conv.pack;
    v_purchase_unit := v_conv.from_unit;
  END IF;

  -- Override do fornecedor (alias)
  v_cnpj := regexp_replace(coalesce(v_item.supplier_cnpj, ''), '\D', '', 'g');
  IF v_cnpj <> '' THEN
    SELECT a.purchase_unit, a.pack_size
      INTO v_alias
      FROM public.inventory_supplier_aliases a
     WHERE a.supplier_cnpj = v_cnpj
       AND a.product_id = v_item.product_id
       AND a.pack_size IS NOT NULL
       AND a.pack_size > 0
     ORDER BY a.confirmations DESC, a.last_used_at DESC
     LIMIT 1;
    IF FOUND THEN
      v_pack := v_alias.pack_size;
      v_purchase_unit := v_alias.purchase_unit;
    END IF;
  END IF;

  v_qty := v_item.quantity;
  v_cost := v_item.unit_value;

  IF v_pack IS NOT NULL AND v_pack > 0
     AND (v_purchase_unit IS NULL
          OR upper(coalesce(v_item.unit, '')) = upper(v_purchase_unit)) THEN
    v_qty := v_item.quantity * v_pack;
    v_cost := v_item.unit_value / v_pack;
  END IF;

  INSERT INTO public.inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, invoice_item_id, invoice_id, reason, created_by)
  VALUES
    (v_store, v_item.product_id, 'entrada', v_qty, v_cost, v_item.id, v_item.invoice_id,
     CASE WHEN v_pack IS NOT NULL AND v_pack > 0 AND v_qty <> v_item.quantity
          THEN format('Recebimento NF (convertido %s %s = %s)', v_item.quantity, coalesce(v_item.unit,''), v_qty)
          ELSE 'Recebimento de nota fiscal' END,
     auth.uid())
  RETURNING id INTO v_mov_id;

  IF v_item.expiry_date IS NOT NULL THEN
    INSERT INTO public.inventory_lots (
      store_id, product_id, lot_number, quantity, initial_quantity, unit_cost,
      manufacture_date, expiry_date, status, notes, created_by
    ) VALUES (
      v_store, v_item.product_id, v_item.lot_number, v_qty, v_qty, v_cost,
      v_item.manufacture_date, v_item.expiry_date, 'active',
      'Lote criado no recebimento da nota fiscal', auth.uid()
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