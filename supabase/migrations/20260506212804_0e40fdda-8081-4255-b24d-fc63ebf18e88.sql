CREATE OR REPLACE FUNCTION public.auto_terminate_internship_on_employee_termination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internship RECORD;
  v_end_date date;
  v_start date;
  v_stipend numeric;
  v_months int;
  v_recesso numeric;
  v_days_in_month int;
  v_worked_days int;
  v_saldo numeric;
  v_total numeric;
  v_already_exists int;
BEGIN
  IF NEW.status = 'terminated' AND (OLD.status IS DISTINCT FROM 'terminated') THEN
    -- Usa termination_date informada; se nula, cai pra hoje
    v_end_date := COALESCE(NEW.termination_date, CURRENT_DATE);

    FOR v_internship IN
      SELECT id, start_date, stipend_amount
        FROM public.internships
       WHERE employee_id = NEW.id
         AND status = 'active'
    LOOP
      UPDATE public.internships
         SET status = 'terminated',
             end_date = LEAST(COALESCE(end_date, v_end_date), v_end_date)
       WHERE id = v_internship.id;

      v_start := v_internship.start_date;
      -- Se stipend zero/nulo, usa o salário do colaborador
      v_stipend := COALESCE(NULLIF(v_internship.stipend_amount, 0), NEW.salary, 0);

      IF v_stipend > 0 AND v_start IS NOT NULL THEN
        SELECT count(*) INTO v_already_exists
          FROM public.internship_payments
         WHERE internship_id = v_internship.id
           AND notes ILIKE 'RESCIS%';

        IF v_already_exists = 0 THEN
          v_months := GREATEST(
            0,
            (EXTRACT(YEAR FROM age(v_end_date, v_start))::int) * 12
            + EXTRACT(MONTH FROM age(v_end_date, v_start))::int
          );
          v_recesso := round((v_stipend * v_months / 12.0)::numeric, 2);

          v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_end_date) + interval '1 month - 1 day'))::int;
          v_worked_days := EXTRACT(DAY FROM v_end_date)::int;
          v_saldo := round((v_stipend * v_worked_days / v_days_in_month)::numeric, 2);

          v_total := v_recesso + v_saldo;

          IF v_total > 0 THEN
            INSERT INTO public.internship_payments (
              internship_id, employee_id, amount, reference_date, payment_date, notes
            ) VALUES (
              v_internship.id,
              NEW.id,
              v_total,
              v_end_date,
              v_end_date,
              'RESCISÃO — Recesso proporcional ' || v_months || '/12 (R$ ' || replace(v_recesso::text, '.', ',') ||
              ') + Saldo da bolsa ' || v_worked_days || '/' || v_days_in_month || ' (R$ ' || replace(v_saldo::text, '.', ',') || ')'
            );
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;