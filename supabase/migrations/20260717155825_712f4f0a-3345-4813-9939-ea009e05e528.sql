
-- 1) Consolidar registros existentes: mover para segunda-feira ISO, mantendo o mais recente em caso de duplicidade
WITH normalized AS (
  SELECT id, employee_id,
         (week_start - ((EXTRACT(ISODOW FROM week_start)::int - 1)))::date AS iso_monday,
         created_at
  FROM public.mood_checkins
),
ranked AS (
  SELECT n.id,
         ROW_NUMBER() OVER (PARTITION BY n.employee_id, n.iso_monday ORDER BY n.created_at DESC) AS rn
  FROM normalized n
)
DELETE FROM public.mood_checkins m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

UPDATE public.mood_checkins
SET week_start = (week_start - ((EXTRACT(ISODOW FROM week_start)::int - 1)))::date
WHERE EXTRACT(ISODOW FROM week_start) <> 1;

-- 2) Trigger para forçar week_start = segunda-feira ISO em qualquer insert/update futuro
CREATE OR REPLACE FUNCTION public.normalize_mood_week_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.week_start IS NOT NULL THEN
    NEW.week_start := (NEW.week_start - ((EXTRACT(ISODOW FROM NEW.week_start)::int - 1)))::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_mood_week_start ON public.mood_checkins;
CREATE TRIGGER trg_normalize_mood_week_start
  BEFORE INSERT OR UPDATE ON public.mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.normalize_mood_week_start();
