-- Permitir qualquer usuário autenticado visualizar ocorrências
DROP POLICY IF EXISTS "Staff can view occurrences" ON public.occurrences;
CREATE POLICY "Authenticated can view occurrences"
ON public.occurrences
FOR SELECT
TO authenticated
USING (true);

-- Admins e gestores podem inserir/atualizar/excluir
DROP POLICY IF EXISTS "Admins can insert occurrences" ON public.occurrences;
CREATE POLICY "Staff can insert occurrences"
ON public.occurrences
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Admins can update occurrences" ON public.occurrences;
CREATE POLICY "Staff can update occurrences"
ON public.occurrences
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Admins can delete occurrences" ON public.occurrences;
CREATE POLICY "Staff can delete occurrences"
ON public.occurrences
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));