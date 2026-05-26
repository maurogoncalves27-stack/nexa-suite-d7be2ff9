-- 1) Marcas
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.brands (name, slug, sort_order) VALUES
  ('AQUELA PARME', 'aquela-parme', 1),
  ('BOX CAIPIRA', 'box-caipira', 2),
  ('AQUELE ESTROGONOFE', 'aquele-estrogonofe', 3);

-- 2) Categorias por marca
ALTER TABLE public.menu_categories
  ADD COLUMN brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE;
CREATE INDEX idx_menu_categories_brand ON public.menu_categories(brand_id);

-- 3) N:N item <-> marca
CREATE TABLE public.menu_item_brands (
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, brand_id)
);
CREATE INDEX idx_mib_brand ON public.menu_item_brands(brand_id);

-- RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands read auth" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands write staff" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "mib read auth" ON public.menu_item_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "mib write staff" ON public.menu_item_brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_brands_updated BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();