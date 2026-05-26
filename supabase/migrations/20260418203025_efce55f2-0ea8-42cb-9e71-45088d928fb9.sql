CREATE TABLE public.internal_regulation_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  regulation_version TEXT NOT NULL DEFAULT '1.0',
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_regulation_acceptances_user ON public.internal_regulation_acceptances(user_id);
CREATE INDEX idx_internal_regulation_acceptances_employee ON public.internal_regulation_acceptances(employee_id);

ALTER TABLE public.internal_regulation_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own regulation acceptances"
ON public.internal_regulation_acceptances
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all regulation acceptances"
ON public.internal_regulation_acceptances
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Users can create their own regulation acceptance"
ON public.internal_regulation_acceptances
FOR INSERT
WITH CHECK (auth.uid() = user_id);