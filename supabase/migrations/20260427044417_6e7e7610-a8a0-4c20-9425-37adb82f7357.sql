-- 1) Campos públicos na vaga
ALTER TABLE public.job_openings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_summary text,
  ADD COLUMN IF NOT EXISTS public_benefits text,
  ADD COLUMN IF NOT EXISTS public_image_url text,
  ADD COLUMN IF NOT EXISTS public_slug text UNIQUE;

-- 2) Slots de entrevista
CREATE TABLE IF NOT EXISTS public.job_interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  location text,
  is_available boolean NOT NULL DEFAULT true,
  taken_by_application_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slots_opening ON public.job_interview_slots(job_opening_id, start_at);

-- 3) Candidaturas públicas
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text NOT NULL,
  city text,
  neighborhood text,
  birth_date date,
  has_transport boolean,
  availability text[] NOT NULL DEFAULT '{}',
  experience_years numeric,
  last_job text,
  last_job_company text,
  behavioral_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening_score integer,
  screening_summary text,
  screening_recommendation text,
  selected_slot_id uuid REFERENCES public.job_interview_slots(id) ON DELETE SET NULL,
  interview_status text NOT NULL DEFAULT 'pending',
  interview_notes text,
  manager_notes text,
  candidate_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apps_opening ON public.job_applications(job_opening_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.job_applications(interview_status);

ALTER TABLE public.job_interview_slots ADD CONSTRAINT job_interview_slots_taken_fk
  FOREIGN KEY (taken_by_application_id) REFERENCES public.job_applications(id) ON DELETE SET NULL;

-- Triggers updated_at
CREATE TRIGGER trg_slots_updated BEFORE UPDATE ON public.job_interview_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_apps_updated BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.job_interview_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Slots: público vê apenas slots disponíveis de vagas públicas/abertas
CREATE POLICY "Public can view available slots of public openings"
ON public.job_interview_slots FOR SELECT
USING (
  is_available = true AND EXISTS (
    SELECT 1 FROM public.job_openings o
    WHERE o.id = job_opening_id AND o.is_public = true AND o.status = 'open'
  )
);

CREATE POLICY "Authenticated can view all slots"
ON public.job_interview_slots FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can manage slots"
ON public.job_interview_slots FOR ALL
TO authenticated USING (true) WITH CHECK (true);

-- Permitir que público (anônimo) atualize slot ao reservar (somente marcar como indisponível, edge function controla)
CREATE POLICY "Public can claim available slot"
ON public.job_interview_slots FOR UPDATE
USING (is_available = true)
WITH CHECK (true);

-- Applications: público pode inserir; só logados leem/editam
CREATE POLICY "Public can submit application"
ON public.job_applications FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_openings o
    WHERE o.id = job_opening_id AND o.is_public = true AND o.status = 'open'
  )
);

CREATE POLICY "Authenticated can view applications"
ON public.job_applications FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can update applications"
ON public.job_applications FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete applications"
ON public.job_applications FOR DELETE
TO authenticated USING (true);

-- Permitir vagas públicas serem listadas sem login
DROP POLICY IF EXISTS "Public can view public openings" ON public.job_openings;
CREATE POLICY "Public can view public openings"
ON public.job_openings FOR SELECT
USING (is_public = true AND status = 'open');