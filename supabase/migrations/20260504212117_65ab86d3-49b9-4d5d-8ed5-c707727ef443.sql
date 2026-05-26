
DROP POLICY IF EXISTS "Owner or expired can update payroll lock" ON public.payroll_edit_locks;
DROP POLICY IF EXISTS "Owner or expired can delete payroll lock" ON public.payroll_edit_locks;

CREATE POLICY "Authenticated can take over payroll lock"
ON public.payroll_edit_locks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated can release payroll lock"
ON public.payroll_edit_locks
FOR DELETE
TO authenticated
USING (true);
