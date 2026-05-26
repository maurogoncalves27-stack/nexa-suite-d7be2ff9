-- 1) Adiciona coluna de gravidade nos tipos de infração
ALTER TABLE public.infraction_types
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'low';

-- Validação de valores aceitos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'infraction_types_severity_check'
  ) THEN
    ALTER TABLE public.infraction_types
      ADD CONSTRAINT infraction_types_severity_check
      CHECK (severity IN ('critical','high','medium','low'));
  END IF;
END $$;

-- 2) Adiciona suspensão à ocorrência de infração
ALTER TABLE public.employee_infractions
  ADD COLUMN IF NOT EXISTS suspension_weeks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspension_start_date date,
  ADD COLUMN IF NOT EXISTS suspension_end_date date,
  ADD COLUMN IF NOT EXISTS suspension_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_revoked_by uuid,
  ADD COLUMN IF NOT EXISTS suspension_revoke_reason text;

-- Índice para consultas por colaborador/período
CREATE INDEX IF NOT EXISTS idx_employee_infractions_suspension
  ON public.employee_infractions (employee_id, suspension_end_date)
  WHERE suspension_weeks > 0;

-- 3) Trigger que calcula automaticamente a data final da suspensão
CREATE OR REPLACE FUNCTION public.set_infraction_suspension_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.suspension_weeks IS NULL OR NEW.suspension_weeks <= 0 THEN
    NEW.suspension_weeks := 0;
    NEW.suspension_start_date := NULL;
    NEW.suspension_end_date := NULL;
  ELSE
    IF NEW.suspension_start_date IS NULL THEN
      NEW.suspension_start_date := NEW.occurred_on;
    END IF;
    NEW.suspension_end_date := NEW.suspension_start_date + (NEW.suspension_weeks * 7 - 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_infraction_suspension_dates ON public.employee_infractions;
CREATE TRIGGER trg_set_infraction_suspension_dates
BEFORE INSERT OR UPDATE OF suspension_weeks, suspension_start_date, occurred_on
ON public.employee_infractions
FOR EACH ROW
EXECUTE FUNCTION public.set_infraction_suspension_dates();