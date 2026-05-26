-- Adiciona campos de agendamento e recorrência aos avisos
ALTER TABLE public.hr_announcements
  ADD COLUMN IF NOT EXISTS schedule_start_date date,
  ADD COLUMN IF NOT EXISTS schedule_end_date date,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_day smallint;

-- Validação simples do tipo de recorrência
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_announcements_recurrence_check'
  ) THEN
    ALTER TABLE public.hr_announcements
      ADD CONSTRAINT hr_announcements_recurrence_check
      CHECK (recurrence IN ('none','daily','weekly','biweekly','monthly'));
  END IF;
END $$;

-- Função: verifica se um aviso está ativo hoje considerando agendamento + recorrência
CREATE OR REPLACE FUNCTION public.announcement_is_due(
  _is_active boolean,
  _start date,
  _end date,
  _recurrence text,
  _rec_day smallint,
  _today date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _is_active
    AND (_start IS NULL OR _today >= _start)
    AND (_end IS NULL OR _today <= _end)
    AND CASE COALESCE(_recurrence,'none')
          WHEN 'none' THEN true
          WHEN 'daily' THEN true
          WHEN 'weekly' THEN
            -- _rec_day: 0=domingo..6=sábado (mesmo padrão extract dow)
            EXTRACT(DOW FROM _today)::int = COALESCE(_rec_day, EXTRACT(DOW FROM COALESCE(_start, _today))::int)
          WHEN 'biweekly' THEN
            (_start IS NOT NULL
              AND _today >= _start
              AND ((_today - _start) % 14) = 0)
          WHEN 'monthly' THEN
            EXTRACT(DAY FROM _today)::int = COALESCE(_rec_day, EXTRACT(DAY FROM COALESCE(_start, _today))::int)
          ELSE true
        END;
$$;