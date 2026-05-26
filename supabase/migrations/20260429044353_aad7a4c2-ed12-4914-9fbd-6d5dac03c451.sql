DROP VIEW IF EXISTS public.hour_bank_balances;

CREATE VIEW public.hour_bank_balances
WITH (security_invoker = true) AS
SELECT
  employee_id,
  COALESCE(SUM(minutes) FILTER (WHERE minutes > 0), 0) AS total_credit_minutes,
  COALESCE(SUM(-minutes) FILTER (WHERE minutes < 0), 0) AS total_debit_minutes,
  COALESCE(SUM(minutes_remaining) FILTER (WHERE minutes > 0), 0) AS available_minutes,
  COALESCE(SUM(minutes), 0) AS net_minutes,
  COUNT(*) FILTER (WHERE minutes > 0 AND minutes_remaining > 0 AND expires_at <= CURRENT_DATE + INTERVAL '30 days') AS credits_expiring_soon
FROM public.hour_bank_entries
GROUP BY employee_id;