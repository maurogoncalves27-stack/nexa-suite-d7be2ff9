-- 1) Função que força caixa alta no nome do colaborador
CREATE OR REPLACE FUNCTION public.uppercase_employee_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS NOT NULL THEN
    NEW.full_name := UPPER(NEW.full_name);
  END IF;
  IF NEW.social_name IS NOT NULL THEN
    NEW.social_name := UPPER(NEW.social_name);
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Trigger antes de inserir/atualizar
DROP TRIGGER IF EXISTS trg_uppercase_employee_name ON public.employees;
CREATE TRIGGER trg_uppercase_employee_name
BEFORE INSERT OR UPDATE OF full_name, social_name ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.uppercase_employee_name();

-- 3) Atualiza dados existentes
UPDATE public.employees
SET full_name = UPPER(full_name)
WHERE full_name IS NOT NULL AND full_name <> UPPER(full_name);

UPDATE public.employees
SET social_name = UPPER(social_name)
WHERE social_name IS NOT NULL AND social_name <> UPPER(social_name);