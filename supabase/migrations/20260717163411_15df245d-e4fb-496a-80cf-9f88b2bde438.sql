CREATE OR REPLACE FUNCTION public.employee_vacation_status(_employee_id uuid)
 RETURNS TABLE(acquisition_start date, acquisition_end date, concessive_end date, days_scheduled integer, days_remaining integer, days_until_deadline integer, risk_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  hire DATE;
  acq_start DATE;
  acq_end DATE;
  conc_end DATE;
  scheduled INTEGER;
  remaining INTEGER;
  until_dl INTEGER;
  risk TEXT;
  had_closed BOOLEAN := false;
BEGIN
  SELECT COALESCE(employees.admission_date, employees.hire_date) INTO hire
    FROM public.employees WHERE employees.id = _employee_id;
  IF hire IS NULL THEN RETURN; END IF;

  acq_start := hire;
  -- Percorre os aquisitivos JÁ FECHADOS; retorna o primeiro com saldo > 0.
  WHILE (acq_start + INTERVAL '12 months')::DATE <= CURRENT_DATE LOOP
    had_closed := true;
    acq_end := (acq_start + INTERVAL '12 months')::DATE;
    conc_end := (acq_end + INTERVAL '12 months')::DATE;

    SELECT COALESCE(SUM(((vs.end_date - vs.start_date) + 1) + vs.sell_days), 0)
      INTO scheduled
      FROM public.vacation_schedules vs
     WHERE vs.employee_id = _employee_id
       AND vs.acquisition_start = acq_start
       AND vs.status <> 'cancelled';

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

    acq_start := (acq_start + INTERVAL '12 months')::DATE;
  END LOOP;

  -- Todos os aquisitivos fechados estão 100% programados (ou nunca fechou nenhum).
  -- Mostra o aquisitivo EM CURSO (o que está sendo adquirido agora), se houver histórico fechado.
  IF had_closed THEN
    acq_end := (acq_start + INTERVAL '12 months')::DATE;
    conc_end := (acq_end + INTERVAL '12 months')::DATE;
    SELECT COALESCE(SUM(((vs.end_date - vs.start_date) + 1) + vs.sell_days), 0)
      INTO scheduled
      FROM public.vacation_schedules vs
     WHERE vs.employee_id = _employee_id
       AND vs.acquisition_start = acq_start
       AND vs.status <> 'cancelled';

    acquisition_start := acq_start;
    acquisition_end := acq_end;
    concessive_end := conc_end;
    days_scheduled := scheduled;
    days_remaining := GREATEST(30 - scheduled, 0);
    days_until_deadline := conc_end - CURRENT_DATE;
    risk_level := 'ok';
    RETURN NEXT;
  END IF;
END;
$function$;