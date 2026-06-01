
-- 1) Add position_id FK to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_position_id ON public.employees(position_id);

-- 2) Trigger: when position_id is set, copy name/cbo from positions to employees
CREATE OR REPLACE FUNCTION public.sync_employee_position_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.position_id IS NOT NULL THEN
    SELECT name, cbo_code, cbo_title
      INTO p
      FROM public.positions
     WHERE id = NEW.position_id;
    IF FOUND THEN
      NEW.position   := p.name;
      NEW.cbo_code   := p.cbo_code;
      NEW.cbo_title  := p.cbo_title;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_position_fields ON public.employees;
CREATE TRIGGER trg_sync_employee_position_fields
  BEFORE INSERT OR UPDATE OF position_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_position_fields();

-- 3) Trigger: when a position is renamed or has its CBO changed,
--    propagate to employees and to legacy text-keyed tables
CREATE OR REPLACE FUNCTION public.propagate_position_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.cbo_code IS DISTINCT FROM OLD.cbo_code
     OR NEW.cbo_title IS DISTINCT FROM OLD.cbo_title THEN

    UPDATE public.employees
       SET position  = NEW.name,
           cbo_code  = NEW.cbo_code,
           cbo_title = NEW.cbo_title
     WHERE position_id = NEW.id;

    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE public.position_bonuses
         SET position = NEW.name
       WHERE position_id = NEW.id;

      UPDATE public.position_responsibilities
         SET position = NEW.name
       WHERE position = OLD.name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_position_change ON public.positions;
CREATE TRIGGER trg_propagate_position_change
  AFTER UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_position_change();
