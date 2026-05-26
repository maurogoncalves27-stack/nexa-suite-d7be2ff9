-- Restaurar payment_method individual no vale transporte e remover do global
ALTER TABLE public.employee_transport_vouchers
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_transport_vouchers_payment_method_check'
  ) THEN
    ALTER TABLE public.employee_transport_vouchers
      ADD CONSTRAINT employee_transport_vouchers_payment_method_check
      CHECK (payment_method IN ('card','pix'));
  END IF;
END$$;

ALTER TABLE public.transport_voucher_settings
  DROP COLUMN IF EXISTS payment_method;