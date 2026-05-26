-- Agenda global de horários de entrevista (válida para qualquer vaga)
CREATE TABLE public.interview_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  start_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  location TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  notes TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  booked_by_candidate_id UUID REFERENCES public.job_candidates(id) ON DELETE SET NULL,
  booked_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_slots_start_at ON public.interview_slots(start_at);
CREATE INDEX idx_interview_slots_available ON public.interview_slots(is_available, start_at) WHERE is_available = TRUE;

ALTER TABLE public.interview_slots ENABLE ROW LEVEL SECURITY;

-- Visualização pública apenas dos slots futuros e disponíveis (para o candidato escolher)
CREATE POLICY "Public can view available future slots"
ON public.interview_slots
FOR SELECT
USING (is_available = TRUE AND start_at > now());

-- Staff pode ver todos os slots
CREATE POLICY "Staff can view all slots"
ON public.interview_slots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Staff pode criar/editar/excluir slots
CREATE POLICY "Staff can insert slots"
ON public.interview_slots
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update slots"
ON public.interview_slots
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete slots"
ON public.interview_slots
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger de updated_at
CREATE TRIGGER trg_interview_slots_updated_at
BEFORE UPDATE ON public.interview_slots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();