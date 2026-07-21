ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;
UPDATE public.employees SET is_tester = true WHERE id = '0e315d33-e5e6-4a81-8e44-ee34ec982c8c';
CREATE INDEX IF NOT EXISTS idx_employees_is_tester ON public.employees(is_tester) WHERE is_tester = true;