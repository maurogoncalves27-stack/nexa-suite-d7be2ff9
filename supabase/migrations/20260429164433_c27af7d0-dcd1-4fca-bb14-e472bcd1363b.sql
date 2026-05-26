CREATE TABLE IF NOT EXISTS public.transport_voucher_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  payment_frequency text NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('weekly','biweekly','monthly')),
  payment_method text NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card','pix')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.transport_voucher_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.transport_voucher_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read transport_voucher_settings" ON public.transport_voucher_settings;
CREATE POLICY "Authenticated read transport_voucher_settings"
  ON public.transport_voucher_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated upsert transport_voucher_settings" ON public.transport_voucher_settings;
CREATE POLICY "Authenticated upsert transport_voucher_settings"
  ON public.transport_voucher_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update transport_voucher_settings" ON public.transport_voucher_settings;
CREATE POLICY "Authenticated update transport_voucher_settings"
  ON public.transport_voucher_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Remove colunas individuais que não são mais usadas
ALTER TABLE public.employee_transport_vouchers DROP CONSTRAINT IF EXISTS employee_transport_vouchers_payment_frequency_check;
ALTER TABLE public.employee_transport_vouchers DROP CONSTRAINT IF EXISTS employee_transport_vouchers_payment_method_check;
ALTER TABLE public.employee_transport_vouchers DROP COLUMN IF EXISTS payment_frequency;
ALTER TABLE public.employee_transport_vouchers DROP COLUMN IF EXISTS payment_method;