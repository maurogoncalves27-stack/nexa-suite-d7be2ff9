
-- 1. Limpar dados antigos do módulo de checklists
DELETE FROM public.checklist_answers;
DELETE FROM public.checklist_submissions;
DELETE FROM public.checklist_items;
DELETE FROM public.checklist_template_assignments;
DELETE FROM public.template_access_groups;
DELETE FROM public.checklist_templates;

-- 2. Ajustes em checklist_items: adicionar categoria
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS category text;

-- 3. Ajustes em checklist_submissions: status e progresso
ALTER TABLE public.checklist_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS completion_percent integer NOT NULL DEFAULT 0;

-- 4. Garantir que existe constraint única para upsert de respostas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checklist_answers_submission_item_unique'
  ) THEN
    ALTER TABLE public.checklist_answers
      ADD CONSTRAINT checklist_answers_submission_item_unique
      UNIQUE (submission_id, item_id);
  END IF;
END $$;

-- 5. Garantir constraint única para envio único por template/colaborador/data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checklist_submissions_unique_per_day'
  ) THEN
    ALTER TABLE public.checklist_submissions
      ADD CONSTRAINT checklist_submissions_unique_per_day
      UNIQUE (template_id, employee_id, reference_date);
  END IF;
END $$;

-- 6. Atualizar política de items para considerar grupos de acesso
DROP POLICY IF EXISTS "Employees view items of assigned templates" ON public.checklist_items;

CREATE POLICY "Employees view items of accessible templates"
ON public.checklist_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.checklist_template_assignments a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE a.template_id = checklist_items.template_id
      AND e.user_id = auth.uid()
  )
);

-- 7. Atualizar política de templates para considerar grupos de acesso (mantém compatível)
DROP POLICY IF EXISTS "Employees view assigned templates" ON public.checklist_templates;

CREATE POLICY "Employees view accessible templates"
ON public.checklist_templates
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.checklist_template_assignments a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE a.template_id = checklist_templates.id
      AND e.user_id = auth.uid()
  )
);

-- 8. Tornar o bucket de fotos público (URLs diretas)
UPDATE storage.buckets SET public = true WHERE id = 'checklist-photos';

-- 9. Políticas do bucket checklist-photos
DROP POLICY IF EXISTS "Checklist photos readable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Checklist photos uploadable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Checklist photos updatable by owner or staff" ON storage.objects;
DROP POLICY IF EXISTS "Checklist photos deletable by owner or staff" ON storage.objects;

CREATE POLICY "Checklist photos readable by authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'checklist-photos');

CREATE POLICY "Checklist photos uploadable by authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'checklist-photos');

CREATE POLICY "Checklist photos updatable by owner or staff"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    owner = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Checklist photos deletable by owner or staff"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    owner = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
);

-- 10. Trigger para updated_at em checklist_submissions (caso ainda não exista)
DROP TRIGGER IF EXISTS trg_checklist_submissions_updated ON public.checklist_submissions;
CREATE TRIGGER trg_checklist_submissions_updated
BEFORE UPDATE ON public.checklist_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_checklist_answers_updated ON public.checklist_answers;
CREATE TRIGGER trg_checklist_answers_updated
BEFORE UPDATE ON public.checklist_answers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_checklist_items_updated ON public.checklist_items;
CREATE TRIGGER trg_checklist_items_updated
BEFORE UPDATE ON public.checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_checklist_templates_updated ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated
BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
