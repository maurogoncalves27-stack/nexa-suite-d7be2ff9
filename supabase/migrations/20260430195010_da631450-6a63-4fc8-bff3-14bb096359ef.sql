ALTER TABLE public.payroll_calculated
  ADD COLUMN IF NOT EXISTS absence_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dsr_loss_discount numeric NOT NULL DEFAULT 0;