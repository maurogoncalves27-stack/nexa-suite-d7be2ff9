-- Tabela de vínculo entre templates de checklist e grupos de acesso
CREATE TABLE IF NOT EXISTS public.checklist_template_access_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID,
  UNIQUE (template_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_chk_tpl_groups_template ON public.checklist_template_access_groups(template_id);
CREATE INDEX IF NOT EXISTS idx_chk_tpl_groups_group ON public.checklist_template_access_groups(group_id);

ALTER TABLE public.checklist_template_access_groups ENABLE ROW LEVEL SECURITY;

-- Leitura: usuários autenticados podem ver vínculos (necessário para EmployeeChecklists filtrar)
CREATE POLICY "Authenticated can read template-group assignments"
ON public.checklist_template_access_groups
FOR SELECT
TO authenticated
USING (true);

-- Apenas admins/gestores podem gerenciar vínculos
CREATE POLICY "Admins manage template-group assignments"
ON public.checklist_template_access_groups
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Vincular templates existentes aos grupos correspondentes (idempotente)
INSERT INTO public.checklist_template_access_groups (template_id, group_id)
SELECT t.id, g.id
FROM public.checklist_templates t
CROSS JOIN public.access_groups g
WHERE
  (g.name = 'Salão' AND t.title IN ('ABERTURA SALÃO', 'FECHAMENTO DO SALÃO'))
  OR (g.name = 'Adm' AND t.title IN ('ADM - Segunda', 'ADM - Terça', 'ADM - Quarta', 'ADM - Quinta', 'ADM - Sexta', 'Aux ADM - Lilian'))
  OR (g.name = 'AGENDA MAURO SOUZA' AND t.title = 'AGENDA MAURO SOUZA')
  OR (g.name = 'RH' AND t.title = 'CHECK LIST RH')
ON CONFLICT (template_id, group_id) DO NOTHING;