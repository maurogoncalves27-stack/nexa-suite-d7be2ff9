CREATE OR REPLACE FUNCTION public.task_period_start(_periodicity public.task_periodicity, _ref DATE DEFAULT CURRENT_DATE)
RETURNS DATE
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _periodicity
    WHEN 'daily' THEN _ref
    WHEN 'weekly' THEN date_trunc('week', _ref)::date
    WHEN 'biweekly' THEN
      CASE WHEN EXTRACT(DAY FROM _ref) <= 15
        THEN date_trunc('month', _ref)::date
        ELSE (date_trunc('month', _ref) + INTERVAL '15 days')::date
      END
    WHEN 'monthly' THEN date_trunc('month', _ref)::date
  END;
$$;