-- Add approval workflow fields to medical_certificates
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS infraction_id uuid REFERENCES public.employee_infractions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leave_applied boolean NOT NULL DEFAULT false;

-- Validation: status must be one of allowed values
CREATE OR REPLACE FUNCTION public.validate_medical_certificate_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Status inválido: %. Use pending, approved ou rejected.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_medical_certificate_status ON public.medical_certificates;
CREATE TRIGGER trg_validate_medical_certificate_status
  BEFORE INSERT OR UPDATE ON public.medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.validate_medical_certificate_status();

-- When a certificate is created by a manager/admin (not the employee themself)
-- it can default to approved. Employees uploading their own default to pending (handled in app).

-- Existing records → mark as approved (legacy)
UPDATE public.medical_certificates SET status = 'approved' WHERE status = 'pending' AND created_at < now() - interval '1 minute';