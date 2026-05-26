ALTER TABLE public.gas_voucher_store_state
  ADD COLUMN IF NOT EXISTS in_use_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reserve_qty integer NOT NULL DEFAULT 1;

ALTER TABLE public.gas_voucher_store_state
  ADD CONSTRAINT gas_store_state_qty_nonneg
  CHECK (in_use_qty >= 0 AND reserve_qty >= 0);

-- Sincroniza has_reserve (mantido por compatibilidade) com reserve_qty
CREATE OR REPLACE FUNCTION public.gas_sync_has_reserve()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.has_reserve := (NEW.reserve_qty > 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_gas_sync_has_reserve ON public.gas_voucher_store_state;
CREATE TRIGGER tg_gas_sync_has_reserve
  BEFORE INSERT OR UPDATE ON public.gas_voucher_store_state
  FOR EACH ROW EXECUTE FUNCTION public.gas_sync_has_reserve();

-- Backfill: se has_reserve era false, zera reserve_qty
UPDATE public.gas_voucher_store_state
   SET reserve_qty = 0
 WHERE has_reserve = false;