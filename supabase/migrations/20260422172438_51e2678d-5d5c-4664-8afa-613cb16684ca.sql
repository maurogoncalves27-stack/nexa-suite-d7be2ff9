-- Permitir qualquer usuário autenticado criar solicitação de manutenção em qualquer loja
DROP POLICY IF EXISTS "Insert maintenance requests for accessible stores" ON public.nutri_maintenance_requests;

CREATE POLICY "Authenticated users can create maintenance requests"
ON public.nutri_maintenance_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Garantir que o solicitante veja a própria solicitação (mesmo sem acesso à loja)
DROP POLICY IF EXISTS "View own maintenance requests" ON public.nutri_maintenance_requests;

CREATE POLICY "View own maintenance requests"
ON public.nutri_maintenance_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);