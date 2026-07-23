CREATE POLICY ems_sensors_update_staff ON public.ems_sensors
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'nutritionist')
  OR public.is_super_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'nutritionist')
  OR public.is_super_user(auth.uid())
);