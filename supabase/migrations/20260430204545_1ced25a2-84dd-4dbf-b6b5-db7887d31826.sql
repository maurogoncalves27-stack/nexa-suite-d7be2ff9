ALTER TABLE public.payroll_imports
  ADD COLUMN IF NOT EXISTS exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS exported_by uuid;