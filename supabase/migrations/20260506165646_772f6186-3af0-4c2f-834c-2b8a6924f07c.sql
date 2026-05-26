
-- Tabela de override manual de adicional noturno por colaborador/mês
CREATE TABLE IF NOT EXISTS public.payroll_night_addition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reference_year int NOT NULL,
  reference_month int NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual', -- 'auto' (espelha cálculo do ponto) | 'manual' (lançamento humano)
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_year, reference_month)
);

ALTER TABLE public.payroll_night_addition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read night addition"
  ON public.payroll_night_addition FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated manage night addition"
  ON public.payroll_night_addition FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_payroll_night_addition_updated
  BEFORE UPDATE ON public.payroll_night_addition
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aprovação mensal
CREATE TABLE IF NOT EXISTS public.payroll_night_addition_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_year int NOT NULL,
  reference_month int NOT NULL,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reference_year, reference_month)
);

ALTER TABLE public.payroll_night_addition_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read night review"
  ON public.payroll_night_addition_review FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated manage night review"
  ON public.payroll_night_addition_review FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
