-- Function: notify managers when a store runs out of gas (no reserve AND no vouchers)
CREATE OR REPLACE FUNCTION public.gas_notify_store_empty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store RECORD;
  v_today_tag TEXT;
  v_user_id UUID;
BEGIN
  -- Only act when the store is now fully empty
  IF NEW.reserve_qty <> 0 OR NEW.vouchers_balance <> 0 THEN
    RETURN NEW;
  END IF;

  -- Skip if state didn't transition to empty (avoid noise on every update)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reserve_qty = 0 AND OLD.vouchers_balance = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Resolve store; ignore virtual stores and Estoque Central
  SELECT id, name, is_virtual
    INTO v_store
  FROM public.stores
  WHERE id = NEW.store_id;

  IF v_store.id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_store.is_virtual, false) = true THEN
    RETURN NEW;
  END IF;
  IF UPPER(v_store.name) = 'ESTOQUE CENTRAL' THEN
    RETURN NEW;
  END IF;

  v_today_tag := 'gas-empty:' || NEW.store_id::text || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

  -- Notify all admins and managers (one per user, dedupe by tag/day)
  FOR v_user_id IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','manager')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_notifications
      WHERE user_id = v_user_id AND tag = v_today_tag
    ) THEN
      INSERT INTO public.user_notifications (user_id, title, message, url, tag, category)
      VALUES (
        v_user_id,
        'Loja sem gás: ' || v_store.name,
        'A loja ' || v_store.name || ' está sem nenhum botijão de reserva e sem vale gás disponível. Providencie reposição.',
        '/finance/gas-vouchers',
        v_today_tag,
        'alert'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_gas_notify_store_empty ON public.gas_voucher_store_state;
CREATE TRIGGER tg_gas_notify_store_empty
AFTER INSERT OR UPDATE OF reserve_qty, vouchers_balance
ON public.gas_voucher_store_state
FOR EACH ROW
EXECUTE FUNCTION public.gas_notify_store_empty();