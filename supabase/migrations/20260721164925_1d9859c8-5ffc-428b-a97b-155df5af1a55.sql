
-- ============= PCCS: Plano de Cargos, Carreira e Salários =============

-- 1) Faixas salariais por cargo
CREATE TABLE public.position_salary_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  salary NUMERIC(10,2) NOT NULL CHECK (salary >= 0),
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (position_id, level)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_salary_levels TO authenticated;
GRANT ALL ON public.position_salary_levels TO service_role;
ALTER TABLE public.position_salary_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view salary levels" ON public.position_salary_levels
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'contabilidade')
  );
CREATE POLICY "HR/Admin manage salary levels" ON public.position_salary_levels
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- 2) Matriz de competências por cargo
CREATE TABLE public.position_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  competency_type TEXT NOT NULL CHECK (competency_type IN ('technical','behavioral')),
  is_required BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_competencies TO authenticated;
GRANT ALL ON public.position_competencies TO service_role;
ALTER TABLE public.position_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view competencies" ON public.position_competencies
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );
CREATE POLICY "HR/Admin manage competencies" ON public.position_competencies
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- 3) Trilhas de carreira (grafo de progressão)
CREATE TABLE public.career_track_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name TEXT NOT NULL,
  from_position_id UUID REFERENCES public.positions(id) ON DELETE CASCADE,
  to_position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_track_steps TO authenticated;
GRANT ALL ON public.career_track_steps TO service_role;
ALTER TABLE public.career_track_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tracks" ON public.career_track_steps
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );
CREATE POLICY "HR/Admin manage tracks" ON public.career_track_steps
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- 4) Critérios de promoção
CREATE TABLE public.promotion_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN ('horizontal','vertical')),
  min_months_in_role INT NOT NULL DEFAULT 12,
  min_evaluation_score NUMERIC(5,2) NOT NULL DEFAULT 80,
  min_attendance_pct NUMERIC(5,2) NOT NULL DEFAULT 95,
  no_warnings_months INT NOT NULL DEFAULT 6,
  require_training_completion BOOLEAN NOT NULL DEFAULT true,
  require_pdi_completion BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (position_id, promotion_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_criteria TO authenticated;
GRANT ALL ON public.promotion_criteria TO service_role;
ALTER TABLE public.promotion_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view criteria" ON public.promotion_criteria
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );
CREATE POLICY "HR/Admin manage criteria" ON public.promotion_criteria
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- 5) Snapshots de elegibilidade
CREATE TABLE public.promotion_eligibility_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  promotion_type TEXT NOT NULL,
  is_eligible BOOLEAN NOT NULL,
  criteria_met JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_notes TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_eligibility_snapshots TO authenticated;
GRANT ALL ON public.promotion_eligibility_snapshots TO service_role;
ALTER TABLE public.promotion_eligibility_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view eligibility" ON public.promotion_eligibility_snapshots
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );
CREATE POLICY "HR/Admin manage eligibility" ON public.promotion_eligibility_snapshots
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE INDEX idx_promo_snap_employee ON public.promotion_eligibility_snapshots(employee_id, computed_at DESC);

-- 6) Extensão do PDI (development_plans) — sem perder dados
ALTER TABLE public.development_plans ADD COLUMN IF NOT EXISTS competency TEXT;
ALTER TABLE public.development_plans ADD COLUMN IF NOT EXISTS expected_result TEXT;
ALTER TABLE public.development_plans ADD COLUMN IF NOT EXISTS responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.development_plans ADD COLUMN IF NOT EXISTS target_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- Trigger updated_at padrão
CREATE TRIGGER trg_position_salary_levels_updated BEFORE UPDATE ON public.position_salary_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_position_competencies_updated BEFORE UPDATE ON public.position_competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_career_track_steps_updated BEFORE UPDATE ON public.career_track_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_promotion_criteria_updated BEFORE UPDATE ON public.promotion_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========== SEED com dados do documento PCCS ===========

-- Faixas salariais base (nível I) para os cargos existentes
INSERT INTO public.position_salary_levels (position_id, level, salary, order_index)
SELECT p.id, 'I', v.salary, 1
FROM public.positions p
JOIN (VALUES
  ('Estagiário', 1000.00),
  ('Auxiliar de cozinha', 1750.68),
  ('Atendente', 1750.68),
  ('Auxiliar administrativo', 1750.68),
  ('Auxiliar de produção', 1850.00),
  ('Estoquista', 1900.00),
  ('Encarregado de produção', 2090.00),
  ('Encarregado de escritório', 2090.00),
  ('Supervisor de Loja', 2090.00),
  ('Supervisor Comercial', 2090.00),
  ('Gerente Geral', 2500.00),
  ('ANALISTA DE RH', 2500.00)
) AS v(name, salary) ON lower(p.name) = lower(v.name)
ON CONFLICT DO NOTHING;

-- Faixas II, III, IV para Supervisor de Loja (exemplo do doc)
INSERT INTO public.position_salary_levels (position_id, level, salary, order_index)
SELECT id, l.level, l.salary, l.order_index
FROM public.positions, (VALUES
  ('II', 2194.50, 2),
  ('III', 2304.22, 3),
  ('IV', 2419.43, 4)
) AS l(level, salary, order_index)
WHERE lower(name) = 'supervisor de loja'
ON CONFLICT DO NOTHING;

-- Competências: Auxiliar de cozinha (do doc)
INSERT INTO public.position_competencies (position_id, name, competency_type, order_index)
SELECT p.id, c.name, c.competency_type, c.order_index
FROM public.positions p, (VALUES
  ('Corte de carnes', 'technical', 1),
  ('Manipulação de alimentos', 'technical', 2),
  ('Higiene', 'technical', 3),
  ('Produção', 'technical', 4),
  ('Controle de desperdício', 'technical', 5),
  ('Trabalho em equipe', 'behavioral', 6),
  ('Agilidade', 'behavioral', 7),
  ('Organização', 'behavioral', 8),
  ('Disciplina', 'behavioral', 9),
  ('Comunicação', 'behavioral', 10)
) AS c(name, competency_type, order_index)
WHERE lower(p.name) = 'auxiliar de cozinha'
ON CONFLICT DO NOTHING;

-- Competências: Supervisor de Loja
INSERT INTO public.position_competencies (position_id, name, competency_type, order_index)
SELECT p.id, c.name, c.competency_type, c.order_index
FROM public.positions p, (VALUES
  ('Estoque', 'technical', 1),
  ('Produção', 'technical', 2),
  ('Atendimento', 'technical', 3),
  ('Liderança', 'behavioral', 4),
  ('Inteligência emocional', 'behavioral', 5),
  ('Tomada de decisão', 'behavioral', 6),
  ('Resolução de conflitos', 'behavioral', 7),
  ('Desenvolvimento de pessoas', 'behavioral', 8)
) AS c(name, competency_type, order_index)
WHERE lower(p.name) = 'supervisor de loja'
ON CONFLICT DO NOTHING;

-- Trilhas: principal (Cozinha → Gestão)
INSERT INTO public.career_track_steps (track_name, from_position_id, to_position_id, order_index, notes)
SELECT 'Cozinha → Gestão', pf.id, pt.id, v.order_index, NULL
FROM (VALUES
  ('Estagiário', 'Auxiliar de cozinha', 1),
  ('Auxiliar de cozinha', 'Auxiliar de produção', 2),
  ('Auxiliar de produção', 'Encarregado de produção', 3),
  ('Encarregado de produção', 'Supervisor de Loja', 4),
  ('Supervisor de Loja', 'Gerente Geral', 5)
) AS v(from_name, to_name, order_index)
JOIN public.positions pf ON lower(pf.name) = lower(v.from_name)
JOIN public.positions pt ON lower(pt.name) = lower(v.to_name)
ON CONFLICT DO NOTHING;

-- Trilha alternativa (Atendimento → Gestão)
INSERT INTO public.career_track_steps (track_name, from_position_id, to_position_id, order_index, notes)
SELECT 'Atendimento → Gestão', pf.id, pt.id, v.order_index, NULL
FROM (VALUES
  ('Atendente', 'Estoquista', 1),
  ('Estoquista', 'Encarregado de produção', 2),
  ('Encarregado de produção', 'Supervisor de Loja', 3)
) AS v(from_name, to_name, order_index)
JOIN public.positions pf ON lower(pf.name) = lower(v.from_name)
JOIN public.positions pt ON lower(pt.name) = lower(v.to_name)
ON CONFLICT DO NOTHING;

-- Critérios padrão: horizontal para todos os cargos operacionais
INSERT INTO public.promotion_criteria (position_id, promotion_type, min_months_in_role, min_evaluation_score, min_attendance_pct, no_warnings_months, require_training_completion, require_pdi_completion)
SELECT p.id, 'horizontal', 12, 80, 95, 6, true, false
FROM public.positions p
WHERE lower(p.name) NOT IN ('freelancer','trainee')
ON CONFLICT DO NOTHING;

-- Critérios padrão: vertical (mais rigoroso)
INSERT INTO public.promotion_criteria (position_id, promotion_type, min_months_in_role, min_evaluation_score, min_attendance_pct, no_warnings_months, require_training_completion, require_pdi_completion)
SELECT p.id, 'vertical', 12, 85, 95, 6, true, true
FROM public.positions p
WHERE lower(p.name) NOT IN ('freelancer','trainee','estagiário')
ON CONFLICT DO NOTHING;
