CREATE TABLE public.weekly_payment_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

CREATE INDEX idx_wpa_week ON public.weekly_payment_adjustments(week_start);
CREATE INDEX idx_wpa_emp ON public.weekly_payment_adjustments(employee_id);

ALTER TABLE public.weekly_payment_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers manage adjustments"
ON public.weekly_payment_adjustments
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employees view their own adjustments"
ON public.weekly_payment_adjustments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = weekly_payment_adjustments.employee_id
      AND e.user_id = auth.uid()
  )
);

CREATE TRIGGER update_wpa_updated_at
BEFORE UPDATE ON public.weekly_payment_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();