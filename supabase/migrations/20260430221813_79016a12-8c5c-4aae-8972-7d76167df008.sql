
ALTER TABLE public.internships ADD COLUMN IF NOT EXISTS stipend_amount numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.internship_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id uuid NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_date date,
  notes text,
  exported_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internship_payments_emp ON public.internship_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_internship_payments_ref ON public.internship_payments(reference_date);

ALTER TABLE public.internship_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage internship payments" ON public.internship_payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Employees view own internship payments" ON public.internship_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = internship_payments.employee_id AND e.user_id = auth.uid()));

CREATE TRIGGER trg_internship_payments_updated BEFORE UPDATE ON public.internship_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
