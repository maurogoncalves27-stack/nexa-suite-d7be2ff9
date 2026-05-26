ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS social_name text,
  ADD COLUMN IF NOT EXISTS gender_identity text;