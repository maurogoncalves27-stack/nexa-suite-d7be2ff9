-- Embora o trigger seja SECURITY DEFINER, deixamos regras explícitas para clareza
CREATE POLICY "Receivers can upsert stock"
  ON public.inventory_stock FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_receive_inventory(auth.uid())
    AND public.user_can_access_store(auth.uid(), store_id)
  );

CREATE POLICY "Receivers can update stock"
  ON public.inventory_stock FOR UPDATE
  TO authenticated
  USING (
    public.can_receive_inventory(auth.uid())
    AND public.user_can_access_store(auth.uid(), store_id)
  );