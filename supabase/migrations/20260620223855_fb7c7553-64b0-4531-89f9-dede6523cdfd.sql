
DROP POLICY IF EXISTS "Anyone can read parme site settings" ON public.parme_site_settings;

CREATE POLICY "Staff can read parme site settings"
ON public.parme_site_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);
