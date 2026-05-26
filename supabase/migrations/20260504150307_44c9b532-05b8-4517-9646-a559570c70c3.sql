
-- Tabela de pedidos de alteração feitos pelo contador
CREATE TABLE IF NOT EXISTS public.payroll_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.payroll_imports(id) ON DELETE CASCADE,
  row_id UUID REFERENCES public.payroll_import_rows(id) ON DELETE CASCADE,
  ref_year INT NOT NULL,
  ref_month INT NOT NULL,
  employee_name TEXT,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('value','rubric_add','rubric_update','rubric_delete','note')),
  field_label TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pcr_import ON public.payroll_change_requests(import_id);
CREATE INDEX IF NOT EXISTS idx_pcr_status ON public.payroll_change_requests(status, requested_at DESC);

ALTER TABLE public.payroll_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff e contador veem pedidos relevantes"
ON public.payroll_change_requests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR (public.has_role(auth.uid(), 'contabilidade') AND requested_by = auth.uid())
);

CREATE POLICY "Contador cria pedidos"
ON public.payroll_change_requests FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'contabilidade')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "Apenas staff aprova/rejeita"
ON public.payroll_change_requests FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Apenas staff remove"
ON public.payroll_change_requests FOR DELETE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger: notifica admins/managers no sino quando uma nova solicitação é criada
CREATE OR REPLACE FUNCTION public.notify_payroll_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_id UUID;
  emp_label TEXT;
  competence TEXT;
BEGIN
  emp_label := COALESCE(NEW.employee_name, 'colaborador');
  competence := lpad(NEW.ref_month::text, 2, '0') || '/' || NEW.ref_year::text;

  FOR staff_id IN
    SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager')
  LOOP
    INSERT INTO public.user_notifications (user_id, title, message, url, category, tag)
    VALUES (
      staff_id,
      'Folha ' || competence || ': alteração pendente',
      'Contador solicitou alteração em "' || NEW.field_label || '" de ' || emp_label || '. Aprovação necessária.',
      '/folha?revisao=' || NEW.import_id::text,
      'payroll',
      'payroll_change_request'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payroll_change_request ON public.payroll_change_requests;
CREATE TRIGGER trg_notify_payroll_change_request
AFTER INSERT ON public.payroll_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_payroll_change_request();

-- Observação livre por colaborador (contador pode anotar)
ALTER TABLE public.payroll_import_rows
  ADD COLUMN IF NOT EXISTS accountant_notes TEXT;

-- Permissões: contabilidade já pode ler payroll_imports/rows/rubrics? Garante SELECT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payroll_imports' AND policyname='Contabilidade lê folhas') THEN
    CREATE POLICY "Contabilidade lê folhas"
    ON public.payroll_imports FOR SELECT
    USING (public.has_role(auth.uid(), 'contabilidade'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payroll_import_rows' AND policyname='Contabilidade lê linhas') THEN
    CREATE POLICY "Contabilidade lê linhas"
    ON public.payroll_import_rows FOR SELECT
    USING (public.has_role(auth.uid(), 'contabilidade'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payroll_import_rubrics' AND policyname='Contabilidade lê rubricas') THEN
    CREATE POLICY "Contabilidade lê rubricas"
    ON public.payroll_import_rubrics FOR SELECT
    USING (public.has_role(auth.uid(), 'contabilidade'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employees' AND policyname='Contabilidade lê colaboradores') THEN
    CREATE POLICY "Contabilidade lê colaboradores"
    ON public.employees FOR SELECT
    USING (public.has_role(auth.uid(), 'contabilidade'));
  END IF;
END$$;
