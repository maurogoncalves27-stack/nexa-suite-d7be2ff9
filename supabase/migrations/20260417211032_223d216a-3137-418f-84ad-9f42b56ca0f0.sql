-- Tabela de vínculo template <-> lojas
CREATE TABLE IF NOT EXISTS public.checklist_template_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_by UUID,
  UNIQUE (template_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_cts_template ON public.checklist_template_stores(template_id);
CREATE INDEX IF NOT EXISTS idx_cts_store ON public.checklist_template_stores(store_id);

ALTER TABLE public.checklist_template_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage template stores"
ON public.checklist_template_stores
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated view template stores"
ON public.checklist_template_stores
FOR SELECT
TO authenticated
USING (true);

-- Atualiza RLS de checklist_templates: adiciona acesso por loja em ADIÇÃO ao acesso por grupos
DROP POLICY IF EXISTS "Users see active templates of their groups" ON public.checklist_templates;

CREATE POLICY "Users see active templates by group or store"
ON public.checklist_templates
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    EXISTS (
      SELECT 1
      FROM public.template_access_groups tag
      JOIN public.user_access_groups uag ON uag.group_id = tag.group_id
      WHERE tag.template_id = checklist_templates.id
        AND uag.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.checklist_template_stores cts
      JOIN public.employees e ON (e.store_id = cts.store_id OR e.allocated_store_id = cts.store_id)
      WHERE cts.template_id = checklist_templates.id
        AND e.user_id = auth.uid()
    )
  )
);

-- Atualiza RLS de checklist_items: idem
DROP POLICY IF EXISTS "Users see items of their accessible templates" ON public.checklist_items;

CREATE POLICY "Users see items by group or store"
ON public.checklist_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_templates ct
    WHERE ct.id = checklist_items.template_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.template_access_groups tag
          JOIN public.user_access_groups uag ON uag.group_id = tag.group_id
          WHERE tag.template_id = ct.id
            AND uag.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.checklist_template_stores cts
          JOIN public.employees e ON (e.store_id = cts.store_id OR e.allocated_store_id = cts.store_id)
          WHERE cts.template_id = ct.id
            AND e.user_id = auth.uid()
        )
      )
  )
);