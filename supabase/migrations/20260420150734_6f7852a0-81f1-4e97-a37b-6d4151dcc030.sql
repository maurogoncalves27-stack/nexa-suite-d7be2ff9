-- Ampliar visibilidade de employees para managers:
-- Além da loja contratante (store_id), passam a ver também os colaboradores
-- cuja loja de alocação (allocated_store_id) está entre suas lojas acessíveis.

DROP POLICY IF EXISTS "View employees by role" ON public.employees;

CREATE POLICY "View employees by role"
ON public.employees
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      store_id IN (SELECT user_accessible_stores(auth.uid()))
      OR allocated_store_id IN (SELECT user_accessible_stores(auth.uid()))
    )
  )
  OR user_id = auth.uid()
);