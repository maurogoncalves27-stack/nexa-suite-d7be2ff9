ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS experience_contract_days integer,
  ADD COLUMN IF NOT EXISTS work_schedule text;

CREATE TABLE IF NOT EXISTS public.employee_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  birth_date date,
  cpf text,
  relationship text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_dependents_employee_id
  ON public.employee_dependents(employee_id);

ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View employee dependents"
ON public.employee_dependents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id = get_user_store(auth.uid()))
        OR e.user_id = auth.uid()
      )
  )
);

CREATE POLICY "Insert employee dependents"
ON public.employee_dependents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id = get_user_store(auth.uid()))
      )
  )
);

CREATE POLICY "Update employee dependents"
ON public.employee_dependents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id = get_user_store(auth.uid()))
      )
  )
);

CREATE POLICY "Delete employee dependents"
ON public.employee_dependents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id = get_user_store(auth.uid()))
      )
  )
);

CREATE TRIGGER update_employee_dependents_updated_at
BEFORE UPDATE ON public.employee_dependents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();