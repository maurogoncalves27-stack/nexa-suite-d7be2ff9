CREATE POLICY "Managers can view checklist submissions from their stores"
ON public.checklist_submissions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = checklist_submissions.user_id
      AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);