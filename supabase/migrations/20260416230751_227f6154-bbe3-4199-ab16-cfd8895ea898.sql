-- Tabela de programação de férias
CREATE TABLE public.vacation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  acquisition_start DATE NOT NULL,
  acquisition_end DATE NOT NULL,
  installment_number SMALLINT NOT NULL DEFAULT 1 CHECK (installment_number BETWEEN 1 AND 3),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER GENERATED ALWAYS AS ((end_date - start_date) + 1) STORED,
  sell_days INTEGER NOT NULL DEFAULT 0 CHECK (sell_days >= 0 AND sell_days <= 10),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','in_progress','completed','cancelled')),
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacation_schedules_employee ON public.vacation_schedules(employee_id);
CREATE INDEX idx_vacation_schedules_dates ON public.vacation_schedules(start_date, end_date);
CREATE INDEX idx_vacation_schedules_acq ON public.vacation_schedules(employee_id, acquisition_start);

-- Trigger updated_at
CREATE TRIGGER trg_vacation_schedules_updated_at
BEFORE UPDATE ON public.vacation_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validações de negócio (CLT)
CREATE OR REPLACE FUNCTION public.validate_vacation_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total_days INTEGER;
  installments INTEGER;
  has_long INTEGER;
  current_days INTEGER;
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'A data final das férias deve ser igual ou posterior à inicial.';
  END IF;
  IF NEW.acquisition_end <= NEW.acquisition_start THEN
    RAISE EXCEPTION 'Período aquisitivo inválido.';
  END IF;
  IF NEW.start_date < NEW.acquisition_end THEN
    RAISE EXCEPTION 'As férias só podem iniciar após o fim do período aquisitivo (%).', NEW.acquisition_end;
  END IF;

  current_days := (NEW.end_date - NEW.start_date) + 1;
  IF current_days < 5 THEN
    RAISE EXCEPTION 'Cada parcela de férias deve ter no mínimo 5 dias (CLT).';
  END IF;

  -- Total de dias por aquisitivo (excluindo a própria linha em update e cancelamentos)
  SELECT COALESCE(SUM((end_date - start_date) + 1), 0),
         COUNT(*) FILTER (WHERE TRUE),
         COUNT(*) FILTER (WHERE (end_date - start_date) + 1 >= 14)
    INTO total_days, installments, has_long
    FROM public.vacation_schedules
   WHERE employee_id = NEW.employee_id
     AND acquisition_start = NEW.acquisition_start
     AND status <> 'cancelled'
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  total_days := total_days + current_days;
  installments := installments + 1;
  IF current_days >= 14 THEN has_long := has_long + 1; END IF;

  IF (total_days + COALESCE(NEW.sell_days, 0)) > 30 THEN
    RAISE EXCEPTION 'A soma das parcelas (%) + abono (%) excede 30 dias do período aquisitivo.', total_days, COALESCE(NEW.sell_days, 0);
  END IF;
  IF installments > 3 THEN
    RAISE EXCEPTION 'Máximo de 3 parcelas por período aquisitivo (CLT).';
  END IF;
  IF installments > 1 AND has_long = 0 THEN
    RAISE EXCEPTION 'Quando parcelar, ao menos uma parcela deve ter 14 dias ou mais (CLT).';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_vacation_schedule
BEFORE INSERT OR UPDATE ON public.vacation_schedules
FOR EACH ROW EXECUTE FUNCTION public.validate_vacation_schedule();

-- RLS
ALTER TABLE public.vacation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vacation schedules"
ON public.vacation_schedules FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = vacation_schedules.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

CREATE POLICY "Manage vacation schedules"
ON public.vacation_schedules FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = vacation_schedules.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = vacation_schedules.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
      )
  )
);

-- Função: status de férias por colaborador
CREATE OR REPLACE FUNCTION public.employee_vacation_status(_employee_id UUID)
RETURNS TABLE (
  acquisition_start DATE,
  acquisition_end DATE,
  concessive_end DATE,
  days_scheduled INTEGER,
  days_remaining INTEGER,
  days_until_deadline INTEGER,
  risk_level TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hire DATE;
  acq_start DATE;
  acq_end DATE;
  conc_end DATE;
  scheduled INTEGER;
  remaining INTEGER;
  until_dl INTEGER;
  risk TEXT;
BEGIN
  SELECT COALESCE(admission_date, hire_date) INTO hire
    FROM public.employees WHERE id = _employee_id;
  IF hire IS NULL THEN RETURN; END IF;

  -- Último período aquisitivo cujo fim já ocorreu (12 meses após admissão)
  -- e que ainda esteja dentro de 24 meses (não totalmente prescrito).
  -- Calcula iterativamente buscando o aquisitivo mais antigo NÃO totalmente cumprido.
  acq_start := hire;
  WHILE (acq_start + INTERVAL '12 months')::DATE <= CURRENT_DATE LOOP
    acq_end := (acq_start + INTERVAL '12 months')::DATE;
    conc_end := (acq_end + INTERVAL '12 months')::DATE;

    SELECT COALESCE(SUM(((end_date - start_date) + 1) + sell_days), 0)
      INTO scheduled
      FROM public.vacation_schedules
     WHERE employee_id = _employee_id
       AND acquisition_start = acq_start
       AND status <> 'cancelled';

    remaining := 30 - scheduled;
    IF remaining > 0 THEN
      until_dl := conc_end - CURRENT_DATE;
      IF until_dl < 0 THEN risk := 'expired';
      ELSIF until_dl <= 30 THEN risk := 'critical';
      ELSIF until_dl <= 60 THEN risk := 'warning';
      ELSE risk := 'ok';
      END IF;

      acquisition_start := acq_start;
      acquisition_end := acq_end;
      concessive_end := conc_end;
      days_scheduled := scheduled;
      days_remaining := remaining;
      days_until_deadline := until_dl;
      risk_level := risk;
      RETURN NEXT;
      RETURN;
    END IF;

    acq_start := acq_end;
  END LOOP;
END;
$$;