-- Tabela de termos de estágio pré-assinados pela instituição
CREATE TABLE public.internship_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  internship_id uuid REFERENCES public.internships(id) ON DELETE SET NULL,
  institution text,
  start_date date,
  end_date date,
  notes text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internship_contracts_employee ON public.internship_contracts(employee_id);
CREATE INDEX idx_internship_contracts_internship ON public.internship_contracts(internship_id);

ALTER TABLE public.internship_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage internship contracts"
ON public.internship_contracts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Intern can view own contract"
ON public.internship_contracts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = internship_contracts.employee_id AND e.user_id = auth.uid()
  )
);

CREATE TRIGGER update_internship_contracts_updated_at
BEFORE UPDATE ON public.internship_contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Políticas no bucket employee-documents para a subpasta internship-contracts/{employee_id}/
CREATE POLICY "Admin/manager upload internship contracts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'internship-contracts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admin/manager update internship contracts"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'internship-contracts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admin/manager delete internship contracts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'internship-contracts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "View own internship contract file"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'internship-contracts'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.id::text = (storage.foldername(name))[2]
    )
  )
);