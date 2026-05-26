-- Cardápio próprio: itens, componentes de combo e grupos de complementos

CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_combo BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  photo_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX idx_menu_items_recipe ON public.menu_items(recipe_id);

-- Componentes do combo (itens que entram dentro de outro item)
CREATE TABLE public.menu_item_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  child_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_components_no_self CHECK (parent_item_id <> child_item_id)
);
CREATE INDEX idx_menu_item_components_parent ON public.menu_item_components(parent_item_id);

-- Grupos de complementos por item (opcionais/obrigatórios, com min/max escolhas)
CREATE TABLE public.menu_item_complement_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  min_choices INTEGER NOT NULL DEFAULT 0,
  max_choices INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_micg_item ON public.menu_item_complement_groups(menu_item_id);

-- Opções de cada grupo (podem ser livres ou apontar para outro item do cardápio)
CREATE TABLE public.menu_item_complement_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.menu_item_complement_groups(id) ON DELETE CASCADE,
  linked_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mico_group ON public.menu_item_complement_options(group_id);

-- RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_complement_options ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado. Escrita: staff (mesma regra das demais tabelas de cardápio/recipes).
DO $$ BEGIN
  -- menu_items
  CREATE POLICY "menu_items read auth" ON public.menu_items FOR SELECT TO authenticated USING (true);
  CREATE POLICY "menu_items write staff" ON public.menu_items FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

  CREATE POLICY "menu_item_components read auth" ON public.menu_item_components FOR SELECT TO authenticated USING (true);
  CREATE POLICY "menu_item_components write staff" ON public.menu_item_components FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

  CREATE POLICY "micg read auth" ON public.menu_item_complement_groups FOR SELECT TO authenticated USING (true);
  CREATE POLICY "micg write staff" ON public.menu_item_complement_groups FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

  CREATE POLICY "mico read auth" ON public.menu_item_complement_options FOR SELECT TO authenticated USING (true);
  CREATE POLICY "mico write staff" ON public.menu_item_complement_options FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at triggers
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_micg_updated BEFORE UPDATE ON public.menu_item_complement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();