CREATE TABLE public.recipe_complement_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_complement_groups_recipe ON public.recipe_complement_groups(recipe_id);

CREATE TABLE public.recipe_complements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.recipe_complement_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_complements_group ON public.recipe_complements(group_id);

ALTER TABLE public.recipe_complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_complements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read recipe_complement_groups"
  ON public.recipe_complement_groups FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/managers manage recipe_complement_groups"
  ON public.recipe_complement_groups FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated read recipe_complements"
  ON public.recipe_complements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/managers manage recipe_complements"
  ON public.recipe_complements FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_recipe_complement_groups_updated_at
  BEFORE UPDATE ON public.recipe_complement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipe_complements_updated_at
  BEFORE UPDATE ON public.recipe_complements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();