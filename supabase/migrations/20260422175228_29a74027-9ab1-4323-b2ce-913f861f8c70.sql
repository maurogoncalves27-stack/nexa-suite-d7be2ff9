ALTER TABLE public.nutri_maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_professional_id uuid REFERENCES public.outsourced_professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_company_id uuid REFERENCES public.outsourced_companies(id) ON DELETE SET NULL;