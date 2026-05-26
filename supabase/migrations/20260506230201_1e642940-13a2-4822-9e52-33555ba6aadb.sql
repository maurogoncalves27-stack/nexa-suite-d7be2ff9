DROP POLICY IF EXISTS "Employees view all active colleagues" ON public.employees;

CREATE OR REPLACE FUNCTION public.is_active_employee(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = _user_id AND status = 'active'
  );
$$;

CREATE POLICY "Employees view all active colleagues"
ON public.employees
FOR SELECT
TO authenticated
USING (
  status = 'active' AND public.is_active_employee(auth.uid())
);