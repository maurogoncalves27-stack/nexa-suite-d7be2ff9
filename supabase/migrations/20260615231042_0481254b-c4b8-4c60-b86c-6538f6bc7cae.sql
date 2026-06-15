-- 1) inventory_invoice_files: scope SELECT to store access
DROP POLICY IF EXISTS "Files follow invoice visibility" ON public.inventory_invoice_files;

CREATE POLICY "Files follow invoice visibility"
ON public.inventory_invoice_files
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.inventory_invoices i
    WHERE i.id = inventory_invoice_files.invoice_id
      AND (
        i.created_by = auth.uid()
        OR public.user_can_access_store(auth.uid(), i.store_id)
      )
  )
);

-- 2) store_fiscal_credentials: remove terminal-login SELECT access
DROP POLICY IF EXISTS "Store login reads own fiscal credentials" ON public.store_fiscal_credentials;