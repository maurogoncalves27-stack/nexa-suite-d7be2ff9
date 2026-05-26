CREATE TABLE IF NOT EXISTS public.dfe_supplier_unit_conversion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_cnpj text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  purchase_unit text,
  pack_size numeric NOT NULL DEFAULT 1,
  package_description text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_cnpj, product_id)
);

ALTER TABLE public.dfe_supplier_unit_conversion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dfe_unit_conv_select"
  ON public.dfe_supplier_unit_conversion FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'hr')
  );

CREATE POLICY "dfe_unit_conv_write"
  ON public.dfe_supplier_unit_conversion FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'hr')
  );

CREATE TRIGGER trg_dfe_unit_conv_updated
  BEFORE UPDATE ON public.dfe_supplier_unit_conversion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_dfe_unit_conv_lookup ON public.dfe_supplier_unit_conversion (supplier_cnpj, product_id);