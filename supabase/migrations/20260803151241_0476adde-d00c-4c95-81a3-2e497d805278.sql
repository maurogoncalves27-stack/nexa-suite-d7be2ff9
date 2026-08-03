-- Ajusta a política de SELECT em nutri_maintenance_records para usar o mesmo
-- critério de acesso à loja de nutri_maintenance_requests.
-- Isso permite que estoquistas (e outros usuários com acesso a lojas extras)
-- visualizem manutenções já realizadas em todas as lojas acessíveis.
DROP POLICY IF EXISTS "nutri_mr_select" ON public.nutri_maintenance_records;
CREATE POLICY "nutri_mr_select" ON public.nutri_maintenance_records
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.user_can_access_store(auth.uid(), store_id)
  );