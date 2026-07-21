CREATE TABLE public.promotion_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN ('horizontal','vertical')),
  from_position TEXT,
  to_position TEXT,
  from_position_id UUID,
  to_position_id UUID,
  from_level TEXT,
  to_level TEXT,
  from_salary NUMERIC(12,2),
  to_salary NUMERIC(12,2),
  promoted_by UUID REFERENCES auth.users(id),
  promoted_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotion_history_employee ON public.promotion_history(employee_id);
CREATE INDEX idx_promotion_history_created_at ON public.promotion_history(created_at DESC);

GRANT SELECT, INSERT ON public.promotion_history TO authenticated;
GRANT ALL ON public.promotion_history TO service_role;

ALTER TABLE public.promotion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view promotion history"
  ON public.promotion_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.is_super_user(auth.uid())
  );

CREATE POLICY "Managers can insert promotion history"
  ON public.promotion_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.is_super_user(auth.uid())
  );