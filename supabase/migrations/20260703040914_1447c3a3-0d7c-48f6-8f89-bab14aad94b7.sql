
-- 1. Alterar medical_certificates
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'atestado',
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS is_pcmso boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_medical_certificates_document_type ON public.medical_certificates(document_type);
CREATE INDEX IF NOT EXISTS idx_medical_certificates_is_pcmso ON public.medical_certificates(is_pcmso) WHERE is_pcmso = true;

-- 2. Alterar positions
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS pcmso_periodicity_months int NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS pcmso_requires_psychosocial boolean NOT NULL DEFAULT false;

-- 3. mood_checkins
CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  mood_score smallint,
  comment text,
  needs_support boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, week_start)
);

CREATE OR REPLACE FUNCTION public.validate_mood_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.skipped THEN
    NEW.mood_score := NULL;
    NEW.needs_support := false;
  ELSE
    IF NEW.mood_score IS NULL OR NEW.mood_score < 1 OR NEW.mood_score > 5 THEN
      RAISE EXCEPTION 'mood_score deve estar entre 1 e 5 quando não pulado';
    END IF;
    NEW.needs_support := NEW.mood_score <= 2;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_mood_score ON public.mood_checkins;
CREATE TRIGGER trg_validate_mood_score
  BEFORE INSERT OR UPDATE ON public.mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.validate_mood_score();

GRANT SELECT, INSERT, UPDATE ON public.mood_checkins TO authenticated;
GRANT ALL ON public.mood_checkins TO service_role;
ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_own_mood" ON public.mood_checkins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employee_insert_mood" ON public.mood_checkins
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "employee_update_own_mood" ON public.mood_checkins
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hr_mental_view_all_mood" ON public.mood_checkins
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mental_health')
  );

CREATE INDEX IF NOT EXISTS idx_mood_checkins_employee_week ON public.mood_checkins(employee_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_user ON public.mood_checkins(user_id, week_start DESC);

-- 4. mental_health_alerts
CREATE TABLE IF NOT EXISTS public.mental_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  rule text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mental_health_alerts TO authenticated;
GRANT ALL ON public.mental_health_alerts TO service_role;
ALTER TABLE public.mental_health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_mental_manage_alerts" ON public.mental_health_alerts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mental_health')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mental_health')
  );

CREATE INDEX IF NOT EXISTS idx_mha_status ON public.mental_health_alerts(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_mha_employee ON public.mental_health_alerts(employee_id, triggered_at DESC);

-- 5. mental_health_followups
CREATE TABLE IF NOT EXISTS public.mental_health_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid REFERENCES public.mental_health_alerts(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  followup_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL,
  notes text,
  pcmso_document_id uuid REFERENCES public.medical_certificates(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mental_health_followups TO authenticated;
GRANT ALL ON public.mental_health_followups TO service_role;
ALTER TABLE public.mental_health_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_mental_manage_followups" ON public.mental_health_followups
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mental_health')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mental_health')
  );

CREATE INDEX IF NOT EXISTS idx_mhf_employee ON public.mental_health_followups(employee_id, followup_date DESC);
CREATE INDEX IF NOT EXISTS idx_mhf_alert ON public.mental_health_followups(alert_id);

-- 6. Trigger de análise de alertas
CREATE OR REPLACE FUNCTION public.check_mood_alert_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  low_consecutive int;
  low_in_six int;
  rule_triggered text;
  existing_open uuid;
  new_alert_id uuid;
  emp_name text;
  hr_user uuid;
BEGIN
  IF NEW.skipped OR NEW.mood_score IS NULL OR NEW.mood_score > 2 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO low_consecutive
  FROM (
    SELECT mood_score
    FROM public.mood_checkins
    WHERE employee_id = NEW.employee_id
      AND skipped = false
      AND mood_score IS NOT NULL
    ORDER BY week_start DESC
    LIMIT 3
  ) t
  WHERE mood_score <= 2;

  SELECT COUNT(*) INTO low_in_six
  FROM (
    SELECT mood_score
    FROM public.mood_checkins
    WHERE employee_id = NEW.employee_id
      AND skipped = false
      AND mood_score IS NOT NULL
    ORDER BY week_start DESC
    LIMIT 6
  ) t
  WHERE mood_score <= 2;

  IF low_consecutive >= 3 THEN
    rule_triggered := '3_consecutive_low';
  ELSIF low_in_six >= 4 THEN
    rule_triggered := '4_of_6_low';
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO existing_open
  FROM public.mental_health_alerts
  WHERE employee_id = NEW.employee_id
    AND status IN ('open', 'in_progress')
  LIMIT 1;

  IF existing_open IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.mental_health_alerts (employee_id, rule, status)
  VALUES (NEW.employee_id, rule_triggered, 'open')
  RETURNING id INTO new_alert_id;

  SELECT full_name INTO emp_name FROM public.employees WHERE id = NEW.employee_id;

  FOR hr_user IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE role IN ('hr', 'admin', 'mental_health')
  LOOP
    INSERT INTO public.user_notifications (user_id, type, title, message, link, metadata)
    VALUES (
      hr_user,
      'mental_health_alert',
      'Alerta de saúde mental',
      COALESCE(emp_name, 'Colaborador') || ' registrou humor baixo (' ||
        CASE rule_triggered
          WHEN '3_consecutive_low' THEN '3 semanas seguidas'
          ELSE '4 das últimas 6 semanas'
        END || ').',
      '/rh/saude-mental',
      jsonb_build_object('alert_id', new_alert_id, 'employee_id', NEW.employee_id, 'rule', rule_triggered)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_mood_alert_rules ON public.mood_checkins;
CREATE TRIGGER trg_check_mood_alert_rules
  AFTER INSERT ON public.mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.check_mood_alert_rules();

-- 7. View agregada por loja (para gestores)
CREATE OR REPLACE VIEW public.v_mood_weekly_store_agg
AS
SELECT
  e.store_id,
  s.name AS store_name,
  m.week_start,
  COUNT(*) FILTER (WHERE NOT m.skipped) AS respondents,
  ROUND(AVG(m.mood_score) FILTER (WHERE NOT m.skipped)::numeric, 2) AS avg_mood,
  COUNT(*) FILTER (WHERE m.mood_score <= 2 AND NOT m.skipped) AS low_count,
  COUNT(*) FILTER (WHERE m.skipped) AS skipped_count
FROM public.mood_checkins m
JOIN public.employees e ON e.id = m.employee_id
LEFT JOIN public.stores s ON s.id = e.store_id
GROUP BY e.store_id, s.name, m.week_start;

GRANT SELECT ON public.v_mood_weekly_store_agg TO authenticated;

-- 8. touch updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mha_touch ON public.mental_health_alerts;
CREATE TRIGGER trg_mha_touch BEFORE UPDATE ON public.mental_health_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
