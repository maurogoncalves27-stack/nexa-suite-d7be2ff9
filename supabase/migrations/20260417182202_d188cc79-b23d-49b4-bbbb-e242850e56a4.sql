-- Cadastro simples de Vale Transporte por colaborador
CREATE TABLE public.employee_transport_vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL UNIQUE,
  daily_value NUMERIC NOT NULL DEFAULT 0,
  working_days_per_month INTEGER NOT NULL DEFAULT 22,
  discount_percent NUMERIC NOT NULL DEFAULT 6,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_transport_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View transport vouchers"
ON public.employee_transport_vouchers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_transport_vouchers.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

CREATE POLICY "Manage transport vouchers"
ON public.employee_transport_vouchers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_transport_vouchers.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_transport_vouchers.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

CREATE TRIGGER update_employee_transport_vouchers_updated_at
BEFORE UPDATE ON public.employee_transport_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();