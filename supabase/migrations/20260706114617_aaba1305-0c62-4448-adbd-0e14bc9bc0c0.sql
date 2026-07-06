ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS exclude_from_payroll BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_employees_exclude_from_payroll ON public.employees(exclude_from_payroll) WHERE exclude_from_payroll = true;
UPDATE public.employees SET exclude_from_payroll = true WHERE id = '0e315d33-e5e6-4a81-8e44-ee34ec982c8c';