
-- 1) Novos campos em employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS admission_date date,
  ADD COLUMN IF NOT EXISTS training_start_date date,
  ADD COLUMN IF NOT EXISTS training_end_date date,
  ADD COLUMN IF NOT EXISTS training_status text NOT NULL DEFAULT 'pending';

-- training_status valores esperados: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'not_required'

-- 2) Critérios próprios de treinamento
CREATE TABLE IF NOT EXISTS public.training_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view training criteria"
  ON public.training_criteria FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin manage training criteria"
  ON public.training_criteria FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_training_criteria_updated_at
  BEFORE UPDATE ON public.training_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Avaliações diárias de treinamento (1 nota por dia/critério/colaborador)
CREATE TABLE IF NOT EXISTS public.training_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  day_number int NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 5),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, criterion_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_training_evaluations_employee
  ON public.training_evaluations (employee_id);

ALTER TABLE public.training_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training evaluations"
  ON public.training_evaluations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = training_evaluations.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role)
              AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
          OR e.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Manage training evaluations"
  ON public.training_evaluations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = training_evaluations.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role)
              AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = training_evaluations.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role)
              AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  );

CREATE TRIGGER update_training_evaluations_updated_at
  BEFORE UPDATE ON public.training_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
