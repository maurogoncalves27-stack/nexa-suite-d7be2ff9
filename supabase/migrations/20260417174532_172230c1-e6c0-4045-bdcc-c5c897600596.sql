ALTER TABLE public.work_schedules
  ADD COLUMN IF NOT EXISTS break_start_2 time without time zone,
  ADD COLUMN IF NOT EXISTS break_end_2 time without time zone;