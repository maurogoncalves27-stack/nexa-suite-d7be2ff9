
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.access_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read access_groups" ON public.access_groups;
CREATE POLICY "Authenticated can read access_groups"
  ON public.access_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin/Manager manage access_groups" ON public.access_groups;
CREATE POLICY "Admin/Manager manage access_groups"
  ON public.access_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP TRIGGER IF EXISTS update_access_groups_updated_at ON public.access_groups;
CREATE TRIGGER update_access_groups_updated_at
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.template_access_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, group_id)
);

ALTER TABLE public.template_access_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read template_access_groups" ON public.template_access_groups;
CREATE POLICY "Authenticated can read template_access_groups"
  ON public.template_access_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin/Manager manage template_access_groups" ON public.template_access_groups;
CREATE POLICY "Admin/Manager manage template_access_groups"
  ON public.template_access_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS idx_tag_template ON public.template_access_groups(template_id);
CREATE INDEX IF NOT EXISTS idx_tag_group ON public.template_access_groups(group_id);
