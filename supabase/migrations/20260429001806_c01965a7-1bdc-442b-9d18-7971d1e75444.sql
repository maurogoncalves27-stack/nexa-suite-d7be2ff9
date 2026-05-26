-- 1) Coluna de saldo por loja
ALTER TABLE public.gas_voucher_store_state
  ADD COLUMN IF NOT EXISTS vouchers_balance integer NOT NULL DEFAULT 0;

-- 2) Enviar vales do estoque central para uma loja
CREATE OR REPLACE FUNCTION public.gas_send_vouchers(_store_id uuid, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer := _qty;
  v_purchase record;
  v_take integer;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  -- Garante registro de estado
  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, in_use_qty, reserve_qty, vouchers_balance)
  VALUES (_store_id, true, 1, 1, 0)
  ON CONFLICT (store_id) DO NOTHING;

  -- Consome saldo das compras em FIFO
  FOR v_purchase IN
    SELECT id, remaining
      FROM public.gas_voucher_purchases
     WHERE remaining > 0
     ORDER BY purchased_at ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_purchase.remaining, v_remaining);
    UPDATE public.gas_voucher_purchases
       SET remaining = remaining - v_take
     WHERE id = v_purchase.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente. Faltam % vales.', v_remaining;
  END IF;

  -- Credita na loja
  UPDATE public.gas_voucher_store_state
     SET vouchers_balance = vouchers_balance + _qty,
         last_received_at = now()
   WHERE store_id = _store_id;

  -- Histórico (auditoria)
  INSERT INTO public.gas_voucher_requests
    (store_id, status, requested_by, received_by, requested_at, received_at, notes)
  VALUES
    (_store_id, 'received', auth.uid(), auth.uid(), now(), now(),
     'Envio de ' || _qty || ' vale(s) para a loja');
END;
$function$;

-- 3) Atualizar gas_consume: abate do saldo da loja
CREATE OR REPLACE FUNCTION public.gas_consume(_store_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_in_use int;
  v_reserve int;
  v_balance int;
BEGIN
  IF _kind NOT IN ('reserve','in_use') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, in_use_qty, reserve_qty, vouchers_balance)
  VALUES (_store_id, true, 1, 1, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT in_use_qty, reserve_qty, vouchers_balance
    INTO v_in_use, v_reserve, v_balance
    FROM public.gas_voucher_store_state
   WHERE store_id = _store_id
   FOR UPDATE;

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'Loja sem vales disponíveis. Solicite envio do estoque central.';
  END IF;

  IF _kind = 'reserve' THEN
    IF v_reserve <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão reserva';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET reserve_qty = reserve_qty - 1,
           in_use_qty = in_use_qty + 1,
           has_reserve = (reserve_qty - 1) > 0,
           vouchers_balance = vouchers_balance - 1,
           last_received_at = now()
     WHERE store_id = _store_id;
  ELSE
    IF v_in_use <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão em uso';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET vouchers_balance = vouchers_balance - 1,
           last_received_at = now()
     WHERE store_id = _store_id;
  END IF;

  INSERT INTO public.gas_voucher_requests
    (store_id, status, requested_by, received_by, requested_at, received_at, notes)
  VALUES (
    _store_id,
    'received',
    auth.uid(),
    auth.uid(),
    now(),
    now(),
    CASE WHEN _kind = 'reserve' THEN 'Reserva → em uso' ELSE 'Troca de bujão (em uso)' END
  );
END;
$function$;