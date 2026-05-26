-- Enum for kit type
DO $$ BEGIN
  CREATE TYPE public.packaging_kit_type AS ENUM ('individual', 'casal', 'familia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.packaging_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kit_type public.packaging_kit_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packaging_kits_brand ON public.packaging_kits(brand_id);

CREATE TABLE IF NOT EXISTS public.packaging_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id UUID NOT NULL REFERENCES public.packaging_kits(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packaging_kit_items_kit ON public.packaging_kit_items(kit_id);

ALTER TABLE public.packaging_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view packaging_kits"
  ON public.packaging_kits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage packaging_kits"
  ON public.packaging_kits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Authenticated can view packaging_kit_items"
  ON public.packaging_kit_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage packaging_kit_items"
  ON public.packaging_kit_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_packaging_kits_updated
  BEFORE UPDATE ON public.packaging_kits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
