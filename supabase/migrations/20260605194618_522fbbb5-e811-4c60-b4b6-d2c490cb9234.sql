
CREATE TABLE public.transport_voucher_monthly_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_year integer NOT NULL,
  reference_month integer NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  amount_paid numeric NOT NULL DEFAULT 0,
  days_paid integer,
  paid_at timestamptz,
  paid_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_year, reference_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_voucher_monthly_payments TO authenticated;
GRANT ALL ON public.transport_voucher_monthly_payments TO service_role;

ALTER TABLE public.transport_voucher_monthly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View VT monthly payments"
  ON public.transport_voucher_monthly_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = transport_voucher_monthly_payments.employee_id
        AND (
          is_super_user(auth.uid())
          OR has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'hr'::app_role)
          OR has_role(auth.uid(), 'contabilidade'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
          OR e.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Manage VT monthly payments"
  ON public.transport_voucher_monthly_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = transport_voucher_monthly_payments.employee_id
        AND (
          is_super_user(auth.uid())
          OR has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'hr'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = transport_voucher_monthly_payments.employee_id
        AND (
          is_super_user(auth.uid())
          OR has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'hr'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  );

CREATE TRIGGER update_vt_monthly_payments_updated_at
  BEFORE UPDATE ON public.transport_voucher_monthly_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_vt_monthly_payments_ref
  ON public.transport_voucher_monthly_payments (reference_year, reference_month);
