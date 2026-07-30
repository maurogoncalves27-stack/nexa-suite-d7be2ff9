-- 1. Escala de proficiência
CREATE TABLE public.competency_scale_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score integer NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  color_token text NOT NULL DEFAULT 'muted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competency_scale_levels TO authenticated;
GRANT ALL ON public.competency_scale_levels TO service_role;

ALTER TABLE public.competency_scale_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logados veem a escala"
  ON public.competency_scale_levels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/RH gerencia a escala"
  ON public.competency_scale_levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'hr'));

CREATE TRIGGER trg_competency_scale_levels_updated_at
  BEFORE UPDATE ON public.competency_scale_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.competency_scale_levels (score, label, description, color_token) VALUES
  (1, 'Não atende', 'Não demonstra a competência; entrega abaixo do exigido pelo cargo.', 'destructive'),
  (2, 'Em desenvolvimento', 'Demonstra parcialmente; ainda precisa de suporte e acompanhamento.', 'warning'),
  (3, 'Atende', 'Entrega o esperado para o cargo de forma consistente.', 'primary'),
  (4, 'Supera', 'Entrega acima do esperado com autonomia.', 'success'),
  (5, 'Referência', 'É referência na competência e desenvolve outros colaboradores.', 'accent');

-- 2. Competências do cargo: peso e descritores
ALTER TABLE public.position_competencies
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS level_descriptors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description text;

-- 3. Avaliações: média na escala 1-5
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS competency_avg numeric,
  ADD COLUMN IF NOT EXISTS competency_count integer NOT NULL DEFAULT 0;

-- 4. Notas por competência
CREATE TABLE public.evaluation_competency_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  position_competency_id uuid NOT NULL REFERENCES public.position_competencies(id) ON DELETE CASCADE,
  score integer,
  not_applicable boolean NOT NULL DEFAULT false,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, position_competency_id),
  CONSTRAINT evaluation_competency_scores_score_range CHECK (score IS NULL OR (score >= 1 AND score <= 5)),
  CONSTRAINT evaluation_competency_scores_score_present CHECK (not_applicable OR score IS NOT NULL)
);

CREATE INDEX idx_eval_comp_scores_evaluation ON public.evaluation_competency_scores(evaluation_id);
CREATE INDEX idx_eval_comp_scores_competency ON public.evaluation_competency_scores(position_competency_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_competency_scores TO authenticated;
GRANT ALL ON public.evaluation_competency_scores TO service_role;

ALTER TABLE public.evaluation_competency_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor/RH gerencia notas por competência"
  ON public.evaluation_competency_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "Colaborador vê suas notas por competência"
  ON public.evaluation_competency_scores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations e
    JOIN public.employees emp ON emp.id = e.employee_id
    WHERE e.id = evaluation_competency_scores.evaluation_id
      AND emp.user_id = auth.uid()
  ));

CREATE TRIGGER trg_eval_comp_scores_updated_at
  BEFORE UPDATE ON public.evaluation_competency_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Critérios de promoção por competência
ALTER TABLE public.promotion_criteria
  ADD COLUMN IF NOT EXISTS min_competency_avg numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_required_competency_score integer NOT NULL DEFAULT 3;

-- 6. Desativa critérios globais antigos, mantendo o automático (Disciplina)
UPDATE public.evaluation_criteria
   SET is_active = false, updated_at = now()
 WHERE is_active = true AND COALESCE(is_auto, false) = false;