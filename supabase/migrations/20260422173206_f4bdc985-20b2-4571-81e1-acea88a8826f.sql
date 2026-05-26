-- Permite que admins e managers visualizem e atualizem TODAS as solicitações de manutenção,
-- independentemente da loja, para que possam aprovar/rejeitar de qualquer unidade.
DROP POLICY IF EXISTS "View maintenance requests for accessible stores" ON public.nutri_maintenance_requests;
CREATE POLICY "View maintenance requests for accessible stores"
ON public.nutri_maintenance_requests
FOR SELECT
TO authenticated
USING (
  public.user_can_access_store(auth.uid(), store_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS "Update maintenance requests for accessible stores" ON public.nutri_maintenance_requests;
CREATE POLICY "Update maintenance requests for accessible stores"
ON public.nutri_maintenance_requests
FOR UPDATE
TO authenticated
USING (
  public.user_can_access_store(auth.uid(), store_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  public.user_can_access_store(auth.uid(), store_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);