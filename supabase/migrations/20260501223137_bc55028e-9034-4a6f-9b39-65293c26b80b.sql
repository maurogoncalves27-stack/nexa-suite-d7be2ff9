ALTER TABLE public.internships
ADD COLUMN IF NOT EXISTS outsourced_company_id uuid REFERENCES public.outsourced_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internships_outsourced_company ON public.internships(outsourced_company_id);