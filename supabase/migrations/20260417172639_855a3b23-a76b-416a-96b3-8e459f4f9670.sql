ALTER TABLE public.work_schedules
  ADD COLUMN IF NOT EXISTS break_start time without time zone,
  ADD COLUMN IF NOT EXISTS break_end time without time zone;