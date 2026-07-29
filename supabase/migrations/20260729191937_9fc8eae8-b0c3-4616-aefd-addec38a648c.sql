CREATE POLICY "Admin/Manager exclui avaliações"
ON public.customer_reviews
FOR DELETE
TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);