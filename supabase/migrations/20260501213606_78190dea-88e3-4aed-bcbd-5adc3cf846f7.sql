-- Tabela de holerites para assinatura
CREATE TABLE public.payroll_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_year integer NOT NULL CHECK (reference_year BETWEEN 2000 AND 2100),
  reference_month integer NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  payroll_calculated_id uuid REFERENCES public.payroll_calculated(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','cancelled')),
  -- PDF originalmente gerado (já assinado pela empresa)
  unsigned_file_path text NOT NULL,
  -- PDF final, com assinatura do colaborador embutida
  signed_file_path text,
  -- Carimbo eletrônico empresa
  company_stamp_at timestamp with time zone NOT NULL DEFAULT now(),
  company_stamp_hash text NOT NULL,
  -- Assinatura colaborador
  signed_at timestamp with time zone,
  signed_ip text,
  signed_user_agent text,
  signed_by_user_id uuid,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_year, reference_month)
);

CREATE INDEX idx_payroll_receipts_period ON public.payroll_receipts(reference_year, reference_month);
CREATE INDEX idx_payroll_receipts_employee ON public.payroll_receipts(employee_id);
CREATE INDEX idx_payroll_receipts_status ON public.payroll_receipts(status);

CREATE TRIGGER trg_payroll_receipts_updated_at
  BEFORE UPDATE ON public.payroll_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payroll_receipts ENABLE ROW LEVEL SECURITY;

-- RLS: staff (admin/manager) vê e gerencia tudo dentro do seu escopo
CREATE POLICY "Staff manage payroll_receipts" ON public.payroll_receipts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payroll_receipts.employee_id
          AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payroll_receipts.employee_id
          AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
      )
    )
  );

-- Colaborador vê e assina o próprio holerite
CREATE POLICY "Employees view own receipts" ON public.payroll_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_receipts.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Employees sign own receipts" ON public.payroll_receipts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_receipts.employee_id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_receipts.employee_id AND e.user_id = auth.uid()
    )
  );

-- Bucket privado para holerites
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-receipts', 'payroll-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas storage: estrutura {employee_id}/{year}-{month}-(unsigned|signed).pdf
CREATE POLICY "Staff read payroll receipts files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payroll-receipts'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        public.has_role(auth.uid(), 'manager'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id::text = (storage.foldername(name))[1]
            AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
      )
    )
  );

CREATE POLICY "Employees read own payroll receipts files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payroll-receipts'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff write payroll receipts files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payroll-receipts'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "Staff update payroll receipts files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payroll-receipts'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "Staff delete payroll receipts files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payroll-receipts'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );