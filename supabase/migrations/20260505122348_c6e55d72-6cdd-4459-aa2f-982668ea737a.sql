CREATE POLICY "Contabilidade can view payroll_calculated"
ON public.payroll_calculated
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'contabilidade'::public.app_role));