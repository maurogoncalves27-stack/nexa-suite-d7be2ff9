ALTER TABLE public.payroll_import_rows
  ADD COLUMN IF NOT EXISTS entry_status text NOT NULL DEFAULT 'active';
COMMENT ON COLUMN public.payroll_import_rows.entry_status IS 'active | termination | leave_inss';