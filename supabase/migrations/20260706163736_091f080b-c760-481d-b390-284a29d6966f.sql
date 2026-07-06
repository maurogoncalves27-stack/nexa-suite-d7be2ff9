
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
  last_acq_start DATE;
  last_acq_end DATE;
  last_conc_end DATE;
  last_scheduled INTEGER;
BEGIN
  SELECT COALESCE(employees.admission_date, employees.hire_date) INTO hire
    FROM public.employees WHERE employees.id = _employee_id;
  IF hire IS NULL THEN RETURN; END IF;

  acq_start := hire;
  WHILE (acq_start + INTERVAL '12 months')::DATE <= CURRENT_DATE LOOP
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

    last_acq_start := acq_start;
    last_acq_end := acq_end;
    last_conc_end := conc_end;
    last_scheduled := scheduled;

    acq_start := acq_end;
  END LOOP;

  -- Todos os aquisitivos completados estão 100% programados: sem risco.
  IF last_acq_start IS NOT NULL THEN
    acquisition_start := last_acq_start;
    acquisition_end := last_acq_end;
    concessive_end := last_conc_end;
    days_scheduled := last_scheduled;
    days_remaining := 0;
    days_until_deadline := last_conc_end - CURRENT_DATE;
    risk_level := 'ok';
    RETURN NEXT;
  END IF;
END;
$function$;
