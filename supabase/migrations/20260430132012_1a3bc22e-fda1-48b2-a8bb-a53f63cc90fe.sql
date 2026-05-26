CREATE TABLE public.payroll_calculated (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_year INT NOT NULL,
  reference_month INT NOT NULL CHECK (reference_month BETWEEN 1 AND 12),

  -- base
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  worked_days INT NOT NULL DEFAULT 0,
  absent_days INT NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  proportional_salary NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- benefícios
  transport_voucher NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  food_voucher NUMERIC(12,2) NOT NULL DEFAULT 0,
  health_plan NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- adiantamento (preenchido pela página dedicada futura)
  advance NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- variáveis
  productivity NUMERIC(12,2) NOT NULL DEFAULT 0,
  family_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  infraction_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_discounts NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- impostos
  inss NUMERIC(12,2) NOT NULL DEFAULT 0,
  irrf NUMERIC(12,2) NOT NULL DEFAULT 0,
  fgts NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- totais
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discounts NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,

  source TEXT NOT NULL DEFAULT 'calculated' CHECK (source IN ('calculated','xml_override','manual')),
  calculation_details JSONB,

  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, reference_year, reference_month)
);

CREATE INDEX idx_payroll_calculated_period ON public.payroll_calculated (reference_year, reference_month);
CREATE INDEX idx_payroll_calculated_employee ON public.payroll_calculated (employee_id);

ALTER TABLE public.payroll_calculated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR/Manager can view payroll_calculated"
ON public.payroll_calculated FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
);

CREATE POLICY "Admin/HR can insert payroll_calculated"
ON public.payroll_calculated FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
);

CREATE POLICY "Admin/HR can update payroll_calculated"
ON public.payroll_calculated FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
);

CREATE POLICY "Admin/HR can delete payroll_calculated"
ON public.payroll_calculated FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
);

CREATE TRIGGER update_payroll_calculated_updated_at
BEFORE UPDATE ON public.payroll_calculated
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();