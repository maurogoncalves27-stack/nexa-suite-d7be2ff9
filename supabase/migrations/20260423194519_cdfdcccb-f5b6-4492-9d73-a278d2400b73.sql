-- Permite admin/manager (staff) gerenciar itens e arquivos de notas, mesmo que a loja
-- não esteja vinculada ao seu profile (alinhando com a policy de inventory_invoices).

CREATE POLICY "Staff manages invoice items"
  ON public.inventory_invoice_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff manages invoice files"
  ON public.inventory_invoice_files
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));