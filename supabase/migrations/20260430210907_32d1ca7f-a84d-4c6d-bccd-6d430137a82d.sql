ALTER TABLE public.payroll_imports
  ADD COLUMN IF NOT EXISTS sent_to_accounting_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_accounting_by uuid,
  ADD COLUMN IF NOT EXISTS accounting_ok_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_ok_by uuid;