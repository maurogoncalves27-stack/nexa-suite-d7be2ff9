-- Tabela de garantias de equipamentos
CREATE TABLE public.equipment_warranties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.inventory_invoices(id) ON DELETE SET NULL,
  invoice_item_id UUID REFERENCES public.inventory_invoice_items(id) ON DELETE SET NULL,
  equipment_name TEXT NOT NULL,
  serial_number TEXT,
  asset_tag TEXT,
  supplier_name TEXT,
  invoice_number TEXT,
  purchase_date DATE,
  warranty_months INTEGER NOT NULL DEFAULT 12,
  warranty_expires_at DATE,
  installation_location TEXT,
  purchase_value NUMERIC(12,2),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_warranties_store ON public.equipment_warranties(store_id);
CREATE INDEX idx_equipment_warranties_invoice ON public.equipment_warranties(invoice_id);
CREATE INDEX idx_equipment_warranties_expires ON public.equipment_warranties(warranty_expires_at);

-- Trigger pra calcular vencimento automaticamente
CREATE OR REPLACE FUNCTION public.set_warranty_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.purchase_date IS NOT NULL AND NEW.warranty_months IS NOT NULL AND NEW.warranty_months > 0 THEN
    NEW.warranty_expires_at := NEW.purchase_date + (NEW.warranty_months || ' months')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_warranties_set_expires
  BEFORE INSERT OR UPDATE ON public.equipment_warranties
  FOR EACH ROW EXECUTE FUNCTION public.set_warranty_expires_at();

CREATE TRIGGER equipment_warranties_updated_at
  BEFORE UPDATE ON public.equipment_warranties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.equipment_warranties ENABLE ROW LEVEL SECURITY;

-- Todos os colaboradores autenticados podem ver
CREATE POLICY "Authenticated users can view warranties"
ON public.equipment_warranties
FOR SELECT
TO authenticated
USING (true);

-- Quem pode receber NF (admin, manager, ou cargo autorizado) pode criar/editar/excluir
CREATE POLICY "Receivers can insert warranties"
ON public.equipment_warranties
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND public.user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Receivers can update warranties"
ON public.equipment_warranties
FOR UPDATE
TO authenticated
USING (
  public.can_receive_inventory(auth.uid())
  AND public.user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Receivers can delete warranties"
ON public.equipment_warranties
FOR DELETE
TO authenticated
USING (
  public.can_receive_inventory(auth.uid())
  AND public.user_can_access_store(auth.uid(), store_id)
);