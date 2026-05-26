-- 1) Coluna para marcar critérios auto-calculados
ALTER TABLE public.evaluation_criteria
  ADD COLUMN IF NOT EXISTS is_auto boolean NOT NULL DEFAULT false;

-- 2) Inserir critério Disciplina (idempotente)
INSERT INTO public.evaluation_criteria (name, description, weight, is_active, is_auto)
SELECT 'Disciplina',
       'Calculado automaticamente com base nas infrações registradas no período do ciclo, comparado com os demais colaboradores ativos.',
       1.0, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.evaluation_criteria WHERE lower(name) = 'disciplina'
);

-- Garante que se já existir, fique marcado como auto
UPDATE public.evaluation_criteria
   SET is_auto = true, is_active = true
 WHERE lower(name) = 'disciplina';

-- 3) Função: calcula nota de Disciplina (0-10) para um colaborador num ciclo
CREATE OR REPLACE FUNCTION public.calc_discipline_score(_employee_id uuid, _cycle_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_start date;
  c_end date;
  emp_total numeric := 0;
  worst_total numeric := 0;
  raw_score numeric;
BEGIN
  SELECT start_date, end_date INTO c_start, c_end
    FROM public.evaluation_cycles WHERE id = _cycle_id;
  IF c_start IS NULL THEN
    RETURN 10;
  END IF;

  -- Soma de pesos aplicados ao colaborador no período
  SELECT COALESCE(SUM(applied_weight), 0) INTO emp_total
    FROM public.employee_infractions
   WHERE employee_id = _employee_id
     AND occurred_on BETWEEN c_start AND c_end;

  -- Pior soma de pesos entre todos os colaboradores ativos no período
  SELECT COALESCE(MAX(total), 0) INTO worst_total
    FROM (
      SELECT COALESCE(SUM(ei.applied_weight), 0) AS total
        FROM public.employees e
        LEFT JOIN public.employee_infractions ei
          ON ei.employee_id = e.id
         AND ei.occurred_on BETWEEN c_start AND c_end
       WHERE e.status IN ('active','in_training')
       GROUP BY e.id
    ) g;

  IF worst_total <= 0 THEN
    RETURN 10;  -- ninguém teve infração no período
  END IF;

  -- Linear: 0 infrações = 10, pior do grupo = 0
  raw_score := 10 - (emp_total / worst_total) * 10;
  IF raw_score < 0 THEN raw_score := 0; END IF;
  IF raw_score > 10 THEN raw_score := 10; END IF;
  RETURN ROUND(raw_score, 2);
END;
$$;

-- 4) Função/trigger: ao inserir/atualizar avaliação, garantir score automático para critérios is_auto
CREATE OR REPLACE FUNCTION public.apply_auto_evaluation_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  crit RECORD;
  s numeric;
BEGIN
  FOR crit IN
    SELECT id, lower(name) AS lname
      FROM public.evaluation_criteria
     WHERE is_active = true AND is_auto = true
  LOOP
    IF crit.lname = 'disciplina' THEN
      s := public.calc_discipline_score(NEW.employee_id, NEW.cycle_id);
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.evaluation_scores (evaluation_id, criterion_id, score)
      VALUES (NEW.id, crit.id, s)
    ON CONFLICT (evaluation_id, criterion_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  END LOOP;
  RETURN NEW;
END;
$$;

-- Garante unicidade para o ON CONFLICT acima
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_scores_eval_crit_unique
  ON public.evaluation_scores (evaluation_id, criterion_id);

DROP TRIGGER IF EXISTS trg_apply_auto_evaluation_scores ON public.evaluations;
CREATE TRIGGER trg_apply_auto_evaluation_scores
AFTER INSERT OR UPDATE OF cycle_id, employee_id ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.apply_auto_evaluation_scores();

-- 5) Recalcular Disciplina quando infração muda (afeta todos do ciclo correspondente)
CREATE OR REPLACE FUNCTION public.recalc_discipline_on_infraction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_emp uuid;
  affected_date date;
  crit_id uuid;
  ev RECORD;
  emp_in_cycle uuid;
BEGIN
  affected_emp := COALESCE(NEW.employee_id, OLD.employee_id);
  affected_date := COALESCE(NEW.occurred_on, OLD.occurred_on);

  SELECT id INTO crit_id
    FROM public.evaluation_criteria
   WHERE lower(name) = 'disciplina' AND is_active = true
   LIMIT 1;
  IF crit_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Como a métrica usa o "pior do grupo", uma infração nova pode mudar a nota
  -- de TODOS no ciclo. Recalcula todas avaliações cujo ciclo inclui a data.
  FOR ev IN
    SELECT e.id AS eval_id, e.employee_id, e.cycle_id
      FROM public.evaluations e
      JOIN public.evaluation_cycles c ON c.id = e.cycle_id
     WHERE affected_date BETWEEN c.start_date AND c.end_date
  LOOP
    INSERT INTO public.evaluation_scores (evaluation_id, criterion_id, score)
      VALUES (ev.eval_id, crit_id, public.calc_discipline_score(ev.employee_id, ev.cycle_id))
    ON CONFLICT (evaluation_id, criterion_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_discipline_on_infraction ON public.employee_infractions;
CREATE TRIGGER trg_recalc_discipline_on_infraction
AFTER INSERT OR UPDATE OR DELETE ON public.employee_infractions
FOR EACH ROW
EXECUTE FUNCTION public.recalc_discipline_on_infraction();

-- 6) Backfill: aplica para avaliações já existentes
DO $$
DECLARE
  ev RECORD;
  crit_id uuid;
BEGIN
  SELECT id INTO crit_id FROM public.evaluation_criteria WHERE lower(name) = 'disciplina' LIMIT 1;
  IF crit_id IS NULL THEN RETURN; END IF;
  FOR ev IN SELECT id, employee_id, cycle_id FROM public.evaluations LOOP
    INSERT INTO public.evaluation_scores (evaluation_id, criterion_id, score)
      VALUES (ev.id, crit_id, public.calc_discipline_score(ev.employee_id, ev.cycle_id))
    ON CONFLICT (evaluation_id, criterion_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  END LOOP;
END $$;