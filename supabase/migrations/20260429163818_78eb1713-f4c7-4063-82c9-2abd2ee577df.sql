ALTER TABLE public.employee_transport_vouchers
  ADD COLUMN IF NOT EXISTS payment_frequency text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card';

ALTER TABLE public.employee_transport_vouchers
  DROP CONSTRAINT IF EXISTS employee_transport_vouchers_payment_frequency_check;
ALTER TABLE public.employee_transport_vouchers
  ADD CONSTRAINT employee_transport_vouchers_payment_frequency_check
  CHECK (payment_frequency IN ('weekly','biweekly','monthly'));

ALTER TABLE public.employee_transport_vouchers
  DROP CONSTRAINT IF EXISTS employee_transport_vouchers_payment_method_check;
ALTER TABLE public.employee_transport_vouchers
  ADD CONSTRAINT employee_transport_vouchers_payment_method_check
  CHECK (payment_method IN ('card','pix'));