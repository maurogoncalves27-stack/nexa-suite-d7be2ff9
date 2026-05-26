-- ============================================
-- 1) time_clock_justifications
-- ============================================
CREATE TYPE public.time_clock_justification_type AS ENUM (
  'forgotten_punch',
  'late_arrival',
  'early_leave',
  'absence',
  'other'
);

CREATE TABLE public.time_clock_justifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  justification_type public.time_clock_justification_type NOT NULL,
  notes TEXT,
  attachment_url TEXT,
  -- Quando o gestor lança esquecimento, vincula a batida criada
  related_entry_id UUID REFERENCES public.time_clock_entries(id) ON DELETE SET NULL,
  -- Origem: solicitado pelo colaborador ou lançado pelo gestor
  requested_by_employee BOOLEAN NOT NULL DEFAULT false,
  -- Status simples: como gestor já valida, "resolved" é o normal; "pending" só em pedidos do colaborador
  status TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('pending', 'resolved', 'rejected')),
  created_by UUID NOT NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tc_just_emp_date ON public.time_clock_justifications(employee_id, reference_date DESC);
CREATE INDEX idx_tc_just_status ON public.time_clock_justifications(status) WHERE status = 'pending';

ALTER TABLE public.time_clock_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage all justifications"
ON public.time_clock_justifications
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employee views own justifications"
ON public.time_clock_justifications
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Employee creates own punch adjustment request"
ON public.time_clock_justifications
FOR INSERT
WITH CHECK (
  requested_by_employee = true
  AND status = 'pending'
  AND employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND created_by = auth.uid()
);

CREATE TRIGGER set_tc_just_updated_at
BEFORE UPDATE ON public.time_clock_justifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2) employee_leaves
-- ============================================
CREATE TYPE public.employee_leave_type AS ENUM (
  'medical_certificate',
  'paid_absence',
  'unpaid_absence',
  'day_off',
  'suspension',
  'vacation',
  'inss',
  'maternity',
  'paternity',
  'bereavement',
  'marriage',
  'other'
);

CREATE TABLE public.employee_leaves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.employee_leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  attachment_url TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_leaves_period_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_emp_leaves_emp_period ON public.employee_leaves(employee_id, start_date, end_date);

ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage all leaves"
ON public.employee_leaves
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employee views own leaves"
ON public.employee_leaves
FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE TRIGGER set_emp_leaves_updated_at
BEFORE UPDATE ON public.employee_leaves
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3) timesheet_closures
-- ============================================
CREATE TABLE public.timesheet_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_year INT NOT NULL,
  reference_month INT NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'awaiting_acceptance', 'accepted', 'sent_to_accounting')),
  -- Snapshot do resumo do mês (totais de horas, faltas, atrasos, extras...)
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  -- Aceite simples do colaborador
  accepted_at TIMESTAMPTZ,
  accepted_ip TEXT,
  accepted_user_agent TEXT,
  -- Envio para contabilidade
  sent_to_accounting_at TIMESTAMPTZ,
  sent_to_accounting_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_year, reference_month)
);

CREATE INDEX idx_ts_closures_period ON public.timesheet_closures(reference_year, reference_month);
CREATE INDEX idx_ts_closures_status ON public.timesheet_closures(status);

ALTER TABLE public.timesheet_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage all closures"
ON public.timesheet_closures
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employee views own closures"
ON public.timesheet_closures
FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Colaborador só pode atualizar para registrar o aceite (status awaiting_acceptance -> accepted)
CREATE POLICY "Employee accepts own closure"
ON public.timesheet_closures
FOR UPDATE
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'awaiting_acceptance'
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'accepted'
);

CREATE TRIGGER set_ts_closures_updated_at
BEFORE UPDATE ON public.timesheet_closures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4) Bucket: timesheet-attachments
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('timesheet-attachments', 'timesheet-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own timesheet attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'timesheet-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users read own timesheet attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'timesheet-attachments'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "Users delete own timesheet attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'timesheet-attachments'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admin/manager upload timesheet attachments anywhere"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'timesheet-attachments'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);