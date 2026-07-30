GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_template_assignments TO authenticated;
GRANT ALL ON public.checklist_template_assignments TO service_role;

ALTER TABLE public.checklist_template_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read template assignments" ON public.checklist_template_assignments;
CREATE POLICY "Authenticated can read template assignments"
ON public.checklist_template_assignments
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage template assignments" ON public.checklist_template_assignments;
CREATE POLICY "Admins manage template assignments"
ON public.checklist_template_assignments
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Users see active templates by group or store" ON public.checklist_templates;
CREATE POLICY "Users see active templates by group or store"
ON public.checklist_templates
FOR SELECT TO authenticated
USING (
  is_active = true AND (
    EXISTS (
      SELECT 1 FROM template_access_groups tag
      JOIN user_access_groups uag ON uag.group_id = tag.group_id
      WHERE tag.template_id = checklist_templates.id AND uag.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM checklist_template_stores cts
      JOIN employees e ON (e.store_id = cts.store_id OR e.allocated_store_id = cts.store_id)
      WHERE cts.template_id = checklist_templates.id AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM checklist_template_assignments cta
      JOIN employees e2 ON e2.id = cta.employee_id
      WHERE cta.template_id = checklist_templates.id AND e2.user_id = auth.uid()
    )
  )
);