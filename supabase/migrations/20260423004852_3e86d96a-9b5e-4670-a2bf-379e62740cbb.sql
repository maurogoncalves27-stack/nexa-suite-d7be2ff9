-- Permite que qualquer usuário autenticado adicione equipamentos no controle de temperatura
DROP POLICY IF EXISTS nutri_eq_insert ON public.nutri_equipment;

CREATE POLICY nutri_eq_insert
ON public.nutri_equipment
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);