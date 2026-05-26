
-- Adiciona estado "vazio" + total fixo de bujões por loja
ALTER TABLE public.gas_voucher_store_state
  ADD COLUMN IF NOT EXISTS empty_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_qty integer NOT NULL DEFAULT 0;

-- Inicializa total_qty = in_use + reserve para lojas existentes (assume nada vazio hoje)
UPDATE public.gas_voucher_store_state
   SET total_qty = COALESCE(in_use_qty,0) + COALESCE(reserve_qty,0),
       empty_qty = 0
 WHERE total_qty = 0;

-- Reescreve gas_consume com a regra de 3 estados
CREATE OR REPLACE FUNCTION public.gas_consume(_store_id uuid, _kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_in_use int;
  v_reserve int;
  v_empty int;
  v_balance int;
BEGIN
  IF _kind NOT IN ('reserve','in_use') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, in_use_qty, reserve_qty, empty_qty, total_qty, vouchers_balance)
  VALUES (_store_id, true, 1, 1, 0, 2, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT in_use_qty, reserve_qty, empty_qty, vouchers_balance
    INTO v_in_use, v_reserve, v_empty, v_balance
    FROM public.gas_voucher_store_state
   WHERE store_id = _store_id
   FOR UPDATE;

  IF _kind = 'reserve' THEN
    -- Usei reserva: reserva (cheio) vira em uso; o que estava em uso vira vazio
    IF v_reserve <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão reserva';
    END IF;
    IF v_in_use <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão em uso para descartar';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET reserve_qty = reserve_qty - 1,
           empty_qty = empty_qty + 1,
           has_reserve = (reserve_qty - 1) > 0,
           reserve_activated_at = now()
     WHERE store_id = _store_id;

    INSERT INTO public.gas_voucher_requests
      (store_id, status, requested_by, received_by, requested_at, received_at, notes)
    VALUES (_store_id, 'received', auth.uid(), auth.uid(), now(), now(), 'Reserva ativada (cheio→em uso, em uso→vazio)');

  ELSE
    -- Usei vale: troca um vazio por cheio (reserva). Abate 1 do estoque de vales da loja.
    IF v_balance <= 0 THEN
      RAISE EXCEPTION 'Loja sem vales disponíveis. Solicite envio do estoque central.';
    END IF;
    IF v_empty <= 0 THEN
      RAISE EXCEPTION 'Loja não possui bujão vazio para trocar';
    END IF;
    UPDATE public.gas_voucher_store_state
       SET empty_qty = empty_qty - 1,
           reserve_qty = reserve_qty + 1,
           has_reserve = true,
           vouchers_balance = vouchers_balance - 1,
           last_received_at = now()
     WHERE store_id = _store_id;

    INSERT INTO public.gas_voucher_requests
      (store_id, status, requested_by, received_by, requested_at, received_at, notes)
    VALUES (_store_id, 'received', auth.uid(), auth.uid(), now(), now(), 'Troca via vale (vazio→cheio)');
  END IF;
END;
$function$;
