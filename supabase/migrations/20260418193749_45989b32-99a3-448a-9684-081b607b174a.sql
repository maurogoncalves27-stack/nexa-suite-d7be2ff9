-- ============ VAGAS ============
CREATE TABLE public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  position text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  description text,
  requirements text,
  responsibilities text,
  salary_min numeric(10,2),
  salary_max numeric(10,2),
  positions_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','closed')),
  opened_at date NOT NULL DEFAULT CURRENT_DATE,
  closed_at date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/RH gerenciam vagas" ON public.job_openings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE TRIGGER tg_job_openings_updated BEFORE UPDATE ON public.job_openings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_job_openings_status ON public.job_openings(status);
CREATE INDEX idx_job_openings_position ON public.job_openings(position);

-- ============ CANDIDATOS ============
CREATE TABLE public.job_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text,
  email text,
  phone text,
  city text,
  source text,
  current_stage text NOT NULL DEFAULT 'triagem'
    CHECK (current_stage IN ('triagem','entrevista_rh','entrevista_gestor','teste_pratico','proposta','contratado','reprovado','desistiu','talento_futuro')),
  expected_salary numeric(10,2),
  availability text,
  resume_path text,
  resume_name text,
  has_experience boolean,
  notes text,
  applied_at date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/RH gerenciam candidatos" ON public.job_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE TRIGGER tg_job_candidates_updated BEFORE UPDATE ON public.job_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_job_candidates_opening ON public.job_candidates(job_opening_id);
CREATE INDEX idx_job_candidates_stage ON public.job_candidates(current_stage);

-- ============ HISTÓRICO DE ETAPAS ============
CREATE TABLE public.candidate_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  notes text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candidate_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/RH gerenciam histórico" ON public.candidate_stage_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE INDEX idx_candidate_history_candidate ON public.candidate_stage_history(candidate_id);

-- ============ AVALIAÇÕES ============
CREATE TABLE public.candidate_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  stage text NOT NULL,
  overall_score integer CHECK (overall_score BETWEEN 1 AND 5),
  technical_score integer CHECK (technical_score BETWEEN 1 AND 5),
  behavior_score integer CHECK (behavior_score BETWEEN 1 AND 5),
  culture_fit_score integer CHECK (culture_fit_score BETWEEN 1 AND 5),
  strengths text,
  concerns text,
  recommendation text CHECK (recommendation IN ('aprovar','reprovar','talento_futuro','novo_round')),
  answers jsonb,
  evaluated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candidate_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/RH gerenciam avaliações" ON public.candidate_evaluations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE TRIGGER tg_candidate_evaluations_updated BEFORE UPDATE ON public.candidate_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_candidate_eval_candidate ON public.candidate_evaluations(candidate_id);

-- ============ STORAGE: CURRÍCULOS ============
INSERT INTO storage.buckets (id, name, public)
  VALUES ('recruitment-cvs', 'recruitment-cvs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins/RH leem currículos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruitment-cvs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));
CREATE POLICY "Admins/RH enviam currículos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruitment-cvs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));
CREATE POLICY "Admins/RH atualizam currículos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'recruitment-cvs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));
CREATE POLICY "Admins/RH removem currículos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recruitment-cvs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));