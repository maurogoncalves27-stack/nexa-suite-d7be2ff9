
-- ============================================================
-- Cardápio compartilhado: Fase 1 (schema + backfill)
-- ============================================================

-- 1) Categorias multi-marca
CREATE TABLE IF NOT EXISTS public.menu_category_brands (
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  brand_id    uuid NOT NULL REFERENCES public.brands(id)          ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, brand_id)
);
CREATE INDEX IF NOT EXISTS idx_mcb_brand ON public.menu_category_brands(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_category_brands TO authenticated;
GRANT ALL ON public.menu_category_brands TO service_role;
ALTER TABLE public.menu_category_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcb read auth" ON public.menu_category_brands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mcb write staff" ON public.menu_category_brands
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()));

-- Backfill: cada categoria atual vira link com sua brand_id atual
INSERT INTO public.menu_category_brands (category_id, brand_id)
SELECT id, brand_id FROM public.menu_categories
WHERE brand_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) Catálogo global de complementos
CREATE TABLE IF NOT EXISTS public.complement_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  is_required  boolean NOT NULL DEFAULT false,
  min_choices  integer NOT NULL DEFAULT 0,
  max_choices  integer NOT NULL DEFAULT 1,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complement_groups TO authenticated;
GRANT ALL ON public.complement_groups TO service_role;
ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg read auth" ON public.complement_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cg write staff" ON public.complement_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()));
CREATE TRIGGER trg_complement_groups_updated
  BEFORE UPDATE ON public.complement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.complement_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
  linked_item_id  uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name            text NOT NULL,
  extra_price     numeric(12,2) NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_group ON public.complement_options(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complement_options TO authenticated;
GRANT ALL ON public.complement_options TO service_role;
ALTER TABLE public.complement_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co read auth" ON public.complement_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "co write staff" ON public.complement_options
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()));
CREATE TRIGGER trg_complement_options_updated
  BEFORE UPDATE ON public.complement_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.menu_item_complement_links (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id)        ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_micl_group ON public.menu_item_complement_links(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_complement_links TO authenticated;
GRANT ALL ON public.menu_item_complement_links TO service_role;
ALTER TABLE public.menu_item_complement_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "micl read auth" ON public.menu_item_complement_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "micl write staff" ON public.menu_item_complement_links
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()));

-- 3) Backfill complementos: cada grupo antigo vira 1 grupo no catálogo + link 1:1
DO $$
DECLARE
  g record;
  new_group_id uuid;
BEGIN
  FOR g IN SELECT * FROM public.menu_item_complement_groups LOOP
    INSERT INTO public.complement_groups (name, is_required, min_choices, max_choices, sort_order)
    VALUES (g.name, g.is_required, g.min_choices, g.max_choices, g.sort_order)
    RETURNING id INTO new_group_id;

    INSERT INTO public.complement_options (group_id, linked_item_id, name, extra_price, sort_order)
    SELECT new_group_id, o.linked_item_id, o.name, o.extra_price, o.sort_order
    FROM public.menu_item_complement_options o
    WHERE o.group_id = g.id;

    INSERT INTO public.menu_item_complement_links (menu_item_id, group_id, sort_order)
    VALUES (g.menu_item_id, new_group_id, g.sort_order)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
