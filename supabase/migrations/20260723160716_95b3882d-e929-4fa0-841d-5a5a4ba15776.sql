DROP POLICY IF EXISTS nutri_eq_update ON public.nutri_equipment;
CREATE POLICY nutri_eq_update ON public.nutri_equipment
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
    OR is_super_user(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
    OR is_super_user(auth.uid())
  );