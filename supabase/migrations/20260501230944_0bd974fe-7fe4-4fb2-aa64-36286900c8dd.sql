-- Tabela independente de vagas de estágio
CREATE TABLE public.internship_openings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  positions_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internship_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view internship openings"
ON public.internship_openings FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR can manage internship openings"
ON public.internship_openings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role) OR is_super_user(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role) OR is_super_user(auth.uid()));

CREATE TRIGGER update_internship_openings_updated_at
BEFORE UPDATE ON public.internship_openings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Substituir job_opening_id por internship_opening_id em internships
ALTER TABLE public.internships
  ADD COLUMN internship_opening_id UUID REFERENCES public.internship_openings(id) ON DELETE SET NULL;

ALTER TABLE public.internships DROP COLUMN IF EXISTS job_opening_id;

CREATE INDEX idx_internships_opening ON public.internships(internship_opening_id);