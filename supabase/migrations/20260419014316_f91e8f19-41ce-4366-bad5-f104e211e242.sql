CREATE POLICY "Admins can update contract signatures"
  ON public.contract_signatures
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));