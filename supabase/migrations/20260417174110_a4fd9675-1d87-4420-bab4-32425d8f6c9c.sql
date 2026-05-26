
CREATE POLICY "Employees view their own schedule"
ON public.work_schedules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = work_schedules.employee_id
      AND e.user_id = auth.uid()
  )
);
