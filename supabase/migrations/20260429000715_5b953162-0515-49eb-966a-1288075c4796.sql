CREATE OR REPLACE FUNCTION public.gas_consume(_store_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_id uuid;
  v_in_use int;
  v_reserve int;
BEGIN
  IF _kind NOT IN ('reserve','in_use') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  -- Garante registro de estado
  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, in_use_qty, reserve_qty)
  VALUES (_store_id, true, 1, 1)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT in_use_qty, reserve_qty INTO v_in_use, v_reserve
    FROM public.gas_voucher_store_state
   WHERE store_id = _store_id
   FOR UPDATE;

  -- Pega a compra mais antiga com saldo (FIFO) para abater do estoque
  SELECT id INTO v_purchase_id
    FROM public.gas_voucher_purchases
   WHERE remaining > 0
   ORDER BY purchased_at ASC, created_at ASC
   FOR UPDATE
   LIMIT 1;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'Sem vales disponíveis no estoque. Registre uma compra antes.';
  END IF;

  UPDATE public.gas_voucher_purchases
     SET remaining = remaining - 1
   WHERE id = v_purchase_id;

  IF _kind = 'reserve' THEN
    -- Reserva entrou em uso: -1 reserva, +1 em uso
    IF v_reserve <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão reserva';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET reserve_qty = reserve_qty - 1,
           in_use_qty = in_use_qty + 1,
           has_reserve = (reserve_qty - 1) > 0,
           last_received_at = now()
     WHERE store_id = _store_id;
  ELSE
    -- Em uso acabou: -1 em uso (e o vale gás novo já foi abatido como reposição em uso)
    IF v_in_use <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão em uso';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET in_use_qty = in_use_qty,
           last_received_at = now()
     WHERE store_id = _store_id;
  END IF;

  -- Registra histórico como solicitação já recebida (auditoria)
  INSERT INTO public.gas_voucher_requests (store_id, status, requested_by, received_by, requested_at, received_at, purchase_id, notes)
  VALUES (
    _store_id,
    'received',
    auth.uid(),
    auth.uid(),
    now(),
    now(),
    v_purchase_id,
    CASE WHEN _kind = 'reserve' THEN 'Reserva → em uso' ELSE 'Troca de bujão (em uso)' END
  );
END;
$function$;