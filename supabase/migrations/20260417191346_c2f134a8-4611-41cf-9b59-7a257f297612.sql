-- Tabela de atestados médicos
CREATE TABLE public.medical_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  certificate_date DATE NOT NULL,
  cid_code TEXT,
  cid_description TEXT,
  days_off INTEGER NOT NULL DEFAULT 1,
  leave_start_date DATE,
  leave_end_date DATE,
  doctor_name TEXT,
  doctor_crm TEXT,
  notes TEXT,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medical_certificates_employee ON public.medical_certificates(employee_id);
CREATE INDEX idx_medical_certificates_date ON public.medical_certificates(certificate_date DESC);

ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Manager manage medical certificates"
ON public.medical_certificates FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = medical_certificates.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role)
            AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = medical_certificates.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role)
            AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

CREATE POLICY "Employees view own medical certificates"
ON public.medical_certificates FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = medical_certificates.employee_id
      AND e.user_id = auth.uid()
  )
);

CREATE TRIGGER update_medical_certificates_updated_at
BEFORE UPDATE ON public.medical_certificates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket privado para os arquivos
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-certificates', 'medical-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket
CREATE POLICY "Admin/Manager view medical certificate files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-certificates'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND (storage.foldername(name))[1] = e.id::text
    )
  )
);

CREATE POLICY "Admin/Manager upload medical certificate files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-certificates'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admin/Manager delete medical certificate files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'medical-certificates'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);