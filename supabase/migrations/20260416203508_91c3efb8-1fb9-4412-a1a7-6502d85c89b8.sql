-- 1) Critérios de avaliação
CREATE TABLE public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Ciclos de avaliação
CREATE TABLE public.evaluation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger validação de datas (não usar CHECK pois gosto de mensagens claras)
CREATE OR REPLACE FUNCTION public.validate_cycle_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'A data final do ciclo deve ser igual ou posterior à data inicial.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_cycle_dates_trg
  BEFORE INSERT OR UPDATE ON public.evaluation_cycles
  FOR EACH ROW EXECUTE FUNCTION public.validate_cycle_dates();

-- 3) Avaliações
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  final_score numeric,
  bonus_amount numeric DEFAULT 0,
  bonus_notes text,
  general_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);

-- 4) Notas por critério
CREATE TABLE public.evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE RESTRICT,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, criterion_id)
);

-- 5) Recalcular final_score automaticamente (média ponderada) quando notas mudarem
CREATE OR REPLACE FUNCTION public.recalc_evaluation_final_score()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  eval_id uuid;
  total_w numeric;
  total_sw numeric;
BEGIN
  eval_id := COALESCE(NEW.evaluation_id, OLD.evaluation_id);
  SELECT
    COALESCE(SUM(es.score * c.weight), 0),
    COALESCE(SUM(c.weight), 0)
  INTO total_sw, total_w
  FROM public.evaluation_scores es
  JOIN public.evaluation_criteria c ON c.id = es.criterion_id
  WHERE es.evaluation_id = eval_id;

  UPDATE public.evaluations
    SET final_score = CASE WHEN total_w > 0 THEN ROUND(total_sw / total_w, 2) ELSE NULL END,
        updated_at = now()
  WHERE id = eval_id;

  RETURN NEW;
END;
$$;
CREATE TRIGGER recalc_eval_score_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.recalc_evaluation_final_score();

-- 6) Triggers updated_at
CREATE TRIGGER set_eval_criteria_updated BEFORE UPDATE ON public.evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_eval_cycles_updated BEFORE UPDATE ON public.evaluation_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_evaluations_updated BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_eval_scores_updated BEFORE UPDATE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) RLS
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_cycles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scores   ENABLE ROW LEVEL SECURITY;

-- Critérios: todos autenticados leem; só admin gerencia
CREATE POLICY "Authenticated view criteria" ON public.evaluation_criteria
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage criteria" ON public.evaluation_criteria
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ciclos: todos autenticados leem; só admin gerencia
CREATE POLICY "Authenticated view cycles" ON public.evaluation_cycles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage cycles" ON public.evaluation_cycles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Avaliações
CREATE POLICY "View evaluations" ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'manager')
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = evaluations.employee_id
          AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
      )
    )
    OR (
      status = 'finalized' AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = evaluations.employee_id AND e.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Insert evaluations" ON public.evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'manager')
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = employee_id
          AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
      )
    )
  );

CREATE POLICY "Update evaluations" ON public.evaluations
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'manager')
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = evaluations.employee_id
          AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
      )
    )
  );

CREATE POLICY "Delete evaluations" ON public.evaluations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Notas: seguem permissão da avaliação-pai
CREATE POLICY "View evaluation scores" ON public.evaluation_scores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations ev WHERE ev.id = evaluation_scores.evaluation_id
  ));
CREATE POLICY "Manage evaluation scores" ON public.evaluation_scores
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations ev
    JOIN public.employees e ON e.id = ev.employee_id
    WHERE ev.id = evaluation_scores.evaluation_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager')
            AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.evaluations ev
    JOIN public.employees e ON e.id = ev.employee_id
    WHERE ev.id = evaluation_scores.evaluation_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager')
            AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  ));

-- 8) Critérios padrão
INSERT INTO public.evaluation_criteria (name, description, weight) VALUES
  ('Desempenho', 'Entrega de resultados e qualidade do trabalho', 3),
  ('Atitude', 'Postura, proatividade e relacionamento', 2),
  ('Pontualidade', 'Cumprimento de horários e prazos', 1),
  ('Trabalho em equipe', 'Colaboração com os colegas', 2);

-- 9) Índices
CREATE INDEX idx_evaluations_cycle ON public.evaluations(cycle_id);
CREATE INDEX idx_evaluations_employee ON public.evaluations(employee_id);
CREATE INDEX idx_eval_scores_eval ON public.evaluation_scores(evaluation_id);