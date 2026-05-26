-- Permitir que managers (gestores) também criem/editem/excluam cargos
DROP POLICY IF EXISTS "Admin manage positions" ON public.positions;

CREATE POLICY "Admin and manager manage positions"
ON public.positions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));