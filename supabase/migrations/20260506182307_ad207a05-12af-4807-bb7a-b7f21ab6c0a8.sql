CREATE TABLE public.freelancer_daily_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  freelancer_id UUID NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_freelancer_daily_payments_freelancer ON public.freelancer_daily_payments(freelancer_id);
CREATE INDEX idx_freelancer_daily_payments_work_date ON public.freelancer_daily_payments(work_date);
CREATE INDEX idx_freelancer_daily_payments_status ON public.freelancer_daily_payments(status);

ALTER TABLE public.freelancer_daily_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view freelancer daily payments"
ON public.freelancer_daily_payments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can insert freelancer daily payments"
ON public.freelancer_daily_payments FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can update freelancer daily payments"
ON public.freelancer_daily_payments FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can delete freelancer daily payments"
ON public.freelancer_daily_payments FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_freelancer_daily_payments_updated_at
BEFORE UPDATE ON public.freelancer_daily_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();