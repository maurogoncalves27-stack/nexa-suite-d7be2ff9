
CREATE TABLE public.training_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  training_start date NOT NULL,
  training_end date NOT NULL,
  worked_days integer NOT NULL,
  monthly_salary numeric(12,2) NOT NULL,
  daily_rate numeric(12,2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  payable_id uuid NULL,
  payable_posted_at timestamptz NULL,
  c6_exported_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_receipts_employee ON public.training_receipts(employee_id);
CREATE INDEX idx_training_receipts_due ON public.training_receipts(due_date);

ALTER TABLE public.training_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can view training receipts"
ON public.training_receipts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can insert training receipts"
ON public.training_receipts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can update training receipts"
ON public.training_receipts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can delete training receipts"
ON public.training_receipts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()));

CREATE TRIGGER training_receipts_updated_at
BEFORE UPDATE ON public.training_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
