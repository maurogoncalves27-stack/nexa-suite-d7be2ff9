
CREATE OR REPLACE VIEW public.v_mood_weekly_store_agg
WITH (security_invoker=on) AS
WITH emp_week_store AS (
  SELECT
    m.employee_id,
    m.week_start,
    COALESCE(
      (SELECT ws.store_id
         FROM public.work_schedules ws
        WHERE ws.employee_id = m.employee_id
          AND ws.schedule_date >= m.week_start
          AND ws.schedule_date < (m.week_start + 7)
          AND ws.is_day_off = false
        GROUP BY ws.store_id
        ORDER BY count(*) DESC
        LIMIT 1),
      e.store_id
    ) AS store_id
  FROM public.mood_checkins m
  JOIN public.employees e ON e.id = m.employee_id
)
SELECT
  ews.store_id,
  s.name AS store_name,
  m.week_start,
  count(*) FILTER (WHERE NOT m.skipped) AS respondents,
  round(avg(m.mood_score) FILTER (WHERE NOT m.skipped), 2) AS avg_mood,
  count(*) FILTER (WHERE m.mood_score <= 2 AND NOT m.skipped) AS low_count,
  count(*) FILTER (WHERE m.skipped) AS skipped_count
FROM public.mood_checkins m
JOIN emp_week_store ews
  ON ews.employee_id = m.employee_id
 AND ews.week_start = m.week_start
LEFT JOIN public.stores s ON s.id = ews.store_id
GROUP BY ews.store_id, s.name, m.week_start;
