DROP POLICY IF EXISTS "Employees view colleagues same store" ON public.employees;

CREATE POLICY "Employees view all active colleagues"
ON public.employees
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.employees me
    WHERE me.user_id = auth.uid() AND me.status = 'active'
  )
);