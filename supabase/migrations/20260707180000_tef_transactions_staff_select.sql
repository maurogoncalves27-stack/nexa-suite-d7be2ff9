-- Permite que operadores de loja (employee) leiam e reutilizem linhas de auditoria TEF
-- da própria loja — necessário para INSERT ... RETURNING id e upsert por RecNum/sale_id.
CREATE POLICY "Staff can view TEF tx for their store"
ON public.pdv_tef_transactions FOR SELECT TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'employee'::app_role)
    AND public.user_can_access_store(auth.uid(), store_id)
);
