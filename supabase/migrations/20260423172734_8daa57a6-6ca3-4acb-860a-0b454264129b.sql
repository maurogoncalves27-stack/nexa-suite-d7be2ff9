ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS cbo_code text,
  ADD COLUMN IF NOT EXISTS cbo_title text;