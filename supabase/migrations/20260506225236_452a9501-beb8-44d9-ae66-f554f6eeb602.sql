
-- Permite que colaboradores ativos vejam outros colaboradores ativos da mesma loja
-- (necessário para fluxos como troca de plantão, ranking, etc.).
-- A leitura continua restrita pela RLS — apenas linhas onde a loja bate.

CREATE OR REPLACE FUNCTION public.same_store_as_caller(_target_store uuid, _target_alloc uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees me
    WHERE me.user_id = auth.uid()
      AND me.status = 'active'
      AND (
        COALESCE(me.allocated_store_id, me.store_id) = COALESCE(_target_alloc, _target_store)
      )
  );
$$;

CREATE POLICY "Employees view colleagues same store"
ON public.employees
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND public.same_store_as_caller(store_id, allocated_store_id)
);
