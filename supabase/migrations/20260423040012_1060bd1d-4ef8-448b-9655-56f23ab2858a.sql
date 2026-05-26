-- ============================================================================
-- ADICIONAIS / COMPLEMENTOS REUTILIZÁVEIS
-- ============================================================================
-- Biblioteca de grupos e opções de adicionais que podem ser vinculados
-- a múltiplas receitas. Cada opção pode ter preço extra e estar vinculada
-- a um produto do estoque para baixa automática.

-- 1) Grupos de adicionais (ex: "Bordas", "Molhos extras", "Tamanho")
CREATE TABLE IF NOT EXISTS public.addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addon_groups_select_range CHECK (min_select >= 0 AND max_select >= min_select)
);

ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view addon_groups"
ON public.addon_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can insert addon_groups"
ON public.addon_groups FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can update addon_groups"
ON public.addon_groups FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can delete addon_groups"
ON public.addon_groups FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_addon_groups_updated_at
BEFORE UPDATE ON public.addon_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Opções de adicionais (ex: "Borda Catupiry +R$ 8")
CREATE TABLE IF NOT EXISTS public.addon_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  extra_price numeric(10,2) NOT NULL DEFAULT 0,
  inventory_product_id uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  consumption_quantity numeric(10,3) NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addon_options_group ON public.addon_options(group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_addon_options_product ON public.addon_options(inventory_product_id);

ALTER TABLE public.addon_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view addon_options"
ON public.addon_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can insert addon_options"
ON public.addon_options FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can update addon_options"
ON public.addon_options FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can delete addon_options"
ON public.addon_options FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_addon_options_updated_at
BEFORE UPDATE ON public.addon_options
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Vínculo M:N entre receitas (pratos) e grupos de adicionais
CREATE TABLE IF NOT EXISTS public.recipe_addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  addon_group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, addon_group_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_addon_groups_recipe ON public.recipe_addon_groups(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_addon_groups_addon ON public.recipe_addon_groups(addon_group_id);

ALTER TABLE public.recipe_addon_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recipe_addon_groups"
ON public.recipe_addon_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can manage recipe_addon_groups insert"
ON public.recipe_addon_groups FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can manage recipe_addon_groups update"
ON public.recipe_addon_groups FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can manage recipe_addon_groups delete"
ON public.recipe_addon_groups FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));