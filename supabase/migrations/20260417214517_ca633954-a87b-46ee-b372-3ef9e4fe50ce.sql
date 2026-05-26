DROP POLICY IF EXISTS "Admins manage access_groups" ON public.access_groups;
CREATE POLICY "Admin and manager manage access_groups"
ON public.access_groups FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Admins manage user_access_groups" ON public.user_access_groups;
CREATE POLICY "Admin and manager manage user_access_groups"
ON public.user_access_groups FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));