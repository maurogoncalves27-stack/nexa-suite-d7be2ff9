DROP POLICY IF EXISTS "Admin manage uniform items" ON public.uniform_items;
CREATE POLICY "Manage uniform items"
ON public.uniform_items FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR public.is_super_user(auth.uid()))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR public.is_super_user(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_items TO authenticated;