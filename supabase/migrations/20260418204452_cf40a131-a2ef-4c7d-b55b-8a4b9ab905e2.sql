CREATE TABLE public.position_term_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  term_key TEXT NOT NULL,
  term_version TEXT NOT NULL DEFAULT '1.0.0',
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, term_key, term_version)
);

CREATE INDEX idx_position_term_acceptances_user ON public.position_term_acceptances(user_id, term_key);
CREATE INDEX idx_position_term_acceptances_employee ON public.position_term_acceptances(employee_id);

ALTER TABLE public.position_term_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own term acceptances"
ON public.position_term_acceptances
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own term acceptances"
ON public.position_term_acceptances
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all term acceptances"
ON public.position_term_acceptances
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));