-- Vínculo da vaga de estágio com a vaga pública (divulgação)
ALTER TABLE public.internship_openings
  ADD COLUMN job_opening_id UUID REFERENCES public.job_openings(id) ON DELETE SET NULL;

-- Tabela de candidatos a estágio
CREATE TABLE public.internship_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  internship_opening_id UUID REFERENCES public.internship_openings(id) ON DELETE SET NULL,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  institution TEXT,
  course TEXT,
  stage TEXT NOT NULL DEFAULT 'applied',
  -- applied | interview | trial | evaluation | hired | rejected
  interview_date DATE,
  interview_notes TEXT,
  trial_start_date DATE,
  trial_end_date DATE,
  trial_notes TEXT,
  evaluation_score NUMERIC(4,2),
  evaluation_notes TEXT,
  evaluation_decision TEXT, -- approved | rejected
  evaluated_at TIMESTAMPTZ,
  evaluated_by UUID,
  hired_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_int_cand_opening ON public.internship_candidates(internship_opening_id);
CREATE INDEX idx_int_cand_stage ON public.internship_candidates(stage);

ALTER TABLE public.internship_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view internship candidates"
ON public.internship_candidates FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR can manage internship candidates"
ON public.internship_candidates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role) OR is_super_user(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role) OR is_super_user(auth.uid()));

CREATE TRIGGER update_internship_candidates_updated_at
BEFORE UPDATE ON public.internship_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();