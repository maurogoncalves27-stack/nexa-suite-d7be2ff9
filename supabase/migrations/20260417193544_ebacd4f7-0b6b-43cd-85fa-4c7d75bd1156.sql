-- 1) Adicionar coluna semester (nullable temporariamente)
ALTER TABLE public.climate_surveys
  ADD COLUMN IF NOT EXISTS semester smallint;

-- 2) Mapear quarter -> semester
UPDATE public.climate_surveys
   SET semester = CASE WHEN quarter <= 2 THEN 1 ELSE 2 END
 WHERE semester IS NULL;

-- 3) Consolidar eventuais duplicatas (mesmo year+semester) mantendo o registro mais antigo
WITH ranked AS (
  SELECT id,
         year,
         semester,
         ROW_NUMBER() OVER (PARTITION BY year, semester ORDER BY created_at ASC, id ASC) AS rn
    FROM public.climate_surveys
)
DELETE FROM public.climate_surveys s
 USING ranked r
 WHERE s.id = r.id AND r.rn > 1
   AND NOT EXISTS (
     SELECT 1 FROM public.climate_responses cr WHERE cr.survey_id = s.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.climate_response_tokens t WHERE t.survey_id = s.id
   );

-- Para duplicatas que possuem respostas, mantemos como estão; a unique abaixo só é criada onde não houver conflito.

-- 4) Tornar semester NOT NULL e remover quarter
ALTER TABLE public.climate_surveys
  ALTER COLUMN semester SET NOT NULL;

ALTER TABLE public.climate_surveys
  DROP COLUMN quarter;

-- 5) Restringir valores e criar unique (year, semester) onde possível
ALTER TABLE public.climate_surveys
  DROP CONSTRAINT IF EXISTS climate_surveys_semester_check;
ALTER TABLE public.climate_surveys
  ADD CONSTRAINT climate_surveys_semester_check CHECK (semester IN (1,2));

-- Índice (não unique) para acelerar buscas; unique pode ser criado depois se desejado.
CREATE INDEX IF NOT EXISTS idx_climate_surveys_year_semester
  ON public.climate_surveys (year, semester);

-- 6) Atualizar função para criar campanha semestral atual
CREATE OR REPLACE FUNCTION public.ensure_current_climate_survey()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_year SMALLINT;
  cur_semester SMALLINT;
  s_start DATE;
  s_end DATE;
BEGIN
  cur_year := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  cur_semester := CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 1 ELSE 2 END;

  IF EXISTS (SELECT 1 FROM public.climate_surveys WHERE year = cur_year AND semester = cur_semester) THEN
    RETURN;
  END IF;

  s_start := CASE WHEN cur_semester = 1
                  THEN make_date(cur_year, 1, 1)
                  ELSE make_date(cur_year, 7, 1)
             END;
  s_end := CASE WHEN cur_semester = 1
                THEN make_date(cur_year, 6, 30)
                ELSE make_date(cur_year, 12, 31)
           END;

  INSERT INTO public.climate_surveys (name, year, semester, start_date, end_date, status)
  VALUES (
    format('Clima S%s/%s', cur_semester, cur_year),
    cur_year,
    cur_semester,
    s_start,
    s_end,
    'open'
  );
END;
$function$;