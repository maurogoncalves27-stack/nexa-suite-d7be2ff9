ALTER TABLE public.occurrence_alerts
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS order_value numeric;