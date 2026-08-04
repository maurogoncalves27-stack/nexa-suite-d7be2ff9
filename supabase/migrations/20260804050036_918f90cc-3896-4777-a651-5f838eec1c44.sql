CREATE INDEX IF NOT EXISTS idx_time_clock_employee_entry_at
  ON public.time_clock_entries (employee_id, entry_at DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_revenue_year_month
  ON public.monthly_revenue (year, month, store_id, brand_id);

ANALYZE public.time_clock_entries;
ANALYZE public.monthly_revenue;