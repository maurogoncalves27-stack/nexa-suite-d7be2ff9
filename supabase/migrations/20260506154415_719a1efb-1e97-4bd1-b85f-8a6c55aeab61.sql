CREATE TABLE public.payroll_holiday_worked_review (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_year INT NOT NULL,
  reference_month INT NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_year, reference_month)
);

ALTER TABLE public.payroll_holiday_worked_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view holiday review"
ON public.payroll_holiday_worked_review FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can insert holiday review"
ON public.payroll_holiday_worked_review FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete holiday review"
ON public.payroll_holiday_worked_review FOR DELETE
TO authenticated USING (true);