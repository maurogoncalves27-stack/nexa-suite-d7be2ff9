DROP POLICY IF EXISTS "Employees view all active colleagues" ON public.employees;

CREATE POLICY "Employees view all active colleagues"
ON public.employees
FOR SELECT
TO authenticated
USING (status = 'active');