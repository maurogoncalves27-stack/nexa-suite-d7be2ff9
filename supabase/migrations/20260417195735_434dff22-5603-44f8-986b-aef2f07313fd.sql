ALTER TABLE public.payroll_imports
  ADD COLUMN IF NOT EXISTS competence text;

ALTER TABLE public.payroll_import_rows
  ADD COLUMN IF NOT EXISTS advance_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_voucher_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_plan_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inss_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_discounts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_discounts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admission_date date;

NOTIFY pgrst, 'reload schema';