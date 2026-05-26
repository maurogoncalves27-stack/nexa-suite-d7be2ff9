-- =========================================
-- CHECKLISTS (visão do colaborador + admin mínimo)
-- =========================================

-- Templates de checklist
CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::SMALLINT[],
  deadline_time TIME,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens dentro de cada template
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_note_when_unchecked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atribuição individual de templates a colaboradores
CREATE TABLE public.checklist_template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, employee_id)
);

-- Submissões (uma execução de um template por colaborador em uma data)
CREATE TABLE public.checklist_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  general_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, employee_id, reference_date)
);

-- Respostas item a item
CREATE TABLE public.checklist_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.checklist_submissions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, item_id)
);

-- Índices úteis
CREATE INDEX idx_checklist_items_template ON public.checklist_items(template_id, display_order);
CREATE INDEX idx_checklist_assignments_employee ON public.checklist_template_assignments(employee_id);
CREATE INDEX idx_checklist_submissions_employee_date ON public.checklist_submissions(employee_id, reference_date);
CREATE INDEX idx_checklist_answers_submission ON public.checklist_answers(submission_id);

-- Triggers updated_at
CREATE TRIGGER trg_checklist_templates_updated BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_checklist_items_updated BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_checklist_submissions_updated BEFORE UPDATE ON public.checklist_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_checklist_answers_updated BEFORE UPDATE ON public.checklist_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RLS
-- =========================================
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_answers ENABLE ROW LEVEL SECURITY;

-- Templates: admin/manager gerenciam; colaboradores veem apenas templates atribuídos a eles
CREATE POLICY "Admins/managers manage templates" ON public.checklist_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE POLICY "Employees view assigned templates" ON public.checklist_templates
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR EXISTS (
      SELECT 1 FROM public.checklist_template_assignments a
      JOIN public.employees e ON e.id = a.employee_id
      WHERE a.template_id = checklist_templates.id AND e.user_id = auth.uid()
    )
  );

-- Items: mesma lógica via template
CREATE POLICY "Admins/managers manage items" ON public.checklist_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE POLICY "Employees view items of assigned templates" ON public.checklist_items
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR EXISTS (
      SELECT 1 FROM public.checklist_template_assignments a
      JOIN public.employees e ON e.id = a.employee_id
      WHERE a.template_id = checklist_items.template_id AND e.user_id = auth.uid()
    )
  );

-- Assignments: admin/manager gerenciam; colaborador vê as próprias
CREATE POLICY "Admins/managers manage assignments" ON public.checklist_template_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE POLICY "Employee views own assignments" ON public.checklist_template_assignments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

-- Submissions: colaborador cria/edita as próprias; admin/manager veem tudo
CREATE POLICY "Employee inserts own submission" ON public.checklist_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
  );

CREATE POLICY "Employee updates own submission" ON public.checklist_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
  );

CREATE POLICY "View submissions" ON public.checklist_submissions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Admins delete submissions" ON public.checklist_submissions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- Answers: ligadas à submission
CREATE POLICY "Manage own answers" ON public.checklist_answers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions s
      JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = checklist_answers.submission_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions s
      JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = checklist_answers.submission_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
    )
  );

-- =========================================
-- STORAGE BUCKET para fotos dos itens
-- =========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('checklist-photos','checklist-photos', false)
  ON CONFLICT (id) DO NOTHING;

-- Estrutura de path: {employee_id}/{submission_id}/{item_id}.jpg
CREATE POLICY "View own checklist photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'checklist-photos' AND (
      has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid() AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Upload own checklist photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'checklist-photos' AND (
      has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid() AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Delete own checklist photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'checklist-photos' AND (
      has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid() AND e.id::text = (storage.foldername(name))[1]
      )
    )
  );