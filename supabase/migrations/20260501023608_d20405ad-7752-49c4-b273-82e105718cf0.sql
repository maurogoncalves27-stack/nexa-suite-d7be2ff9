DROP FUNCTION IF EXISTS public.gas_send_vouchers(uuid, integer);

CREATE OR REPLACE FUNCTION public.gas_send_vouchers(_store_id uuid, _qty integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer := _qty;
  v_purchase record;
  v_take integer;
  v_request_id uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, in_use_qty, reserve_qty, vouchers_balance)
  VALUES (_store_id, true, 1, 1, 0)
  ON CONFLICT (store_id) DO NOTHING;

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

  INSERT INTO public.gas_voucher_requests
    (store_id, status, requested_by, requested_at, notes)
  VALUES
    (_store_id, 'in_transit', auth.uid(), now(),
     'Envio de ' || _qty || ' vale(s) aguardando confirmação da loja')
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gas_confirm_shipment(_request_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_notes text;
  v_qty integer;
BEGIN
  SELECT store_id, status, notes INTO v_store_id, v_status, v_notes
    FROM public.gas_voucher_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Envio não encontrado';
  END IF;

  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Envio já confirmado ou inválido (status=%)', v_status;
  END IF;

  v_qty := NULLIF(substring(COALESCE(v_notes,'') from 'Envio de (\d+) vale'), '')::integer;
  IF v_qty IS NULL OR v_qty <= 0 THEN
    v_qty := 1;
  END IF;

  UPDATE public.gas_voucher_store_state
     SET vouchers_balance = vouchers_balance + v_qty,
         last_received_at = now()
   WHERE store_id = v_store_id;

  UPDATE public.gas_voucher_requests
     SET status = 'received',
         received_at = now(),
         received_by = auth.uid(),
         notes = COALESCE(_notes, notes)
   WHERE id = _request_id;
END;
$function$;