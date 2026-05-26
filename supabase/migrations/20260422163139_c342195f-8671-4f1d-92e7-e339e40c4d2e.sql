ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS created_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_candidates_created_employee
  ON public.job_candidates(created_employee_id);