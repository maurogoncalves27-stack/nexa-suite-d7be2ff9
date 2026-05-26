ALTER TABLE public.employee_tasks
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employee_tasks_required
  ON public.employee_tasks (is_required)
  WHERE is_required = true AND is_active = true;