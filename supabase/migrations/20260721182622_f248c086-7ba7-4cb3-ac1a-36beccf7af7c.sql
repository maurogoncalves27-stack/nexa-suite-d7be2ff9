CREATE POLICY "Managers can delete scheduled promotions"
ON public.promotion_history
FOR DELETE
TO authenticated
USING (
  applied_at IS NULL AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR is_super_user(auth.uid())
  )
);