CREATE TABLE public.employee_gratifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_gratifications_employee ON public.employee_gratifications(employee_id);
CREATE INDEX idx_employee_gratifications_ref_date ON public.employee_gratifications(reference_date);

ALTER TABLE public.employee_gratifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all gratifications"
  ON public.employee_gratifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can insert gratifications"
  ON public.employee_gratifications FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update gratifications"
  ON public.employee_gratifications FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete gratifications"
  ON public.employee_gratifications FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employees view own gratifications"
  ON public.employee_gratifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_gratifications.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_employee_gratifications_updated_at
  BEFORE UPDATE ON public.employee_gratifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();