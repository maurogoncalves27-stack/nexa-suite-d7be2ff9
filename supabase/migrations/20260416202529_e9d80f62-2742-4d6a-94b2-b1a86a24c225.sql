-- 1) Coluna de alocação atual
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS allocated_store_id uuid REFERENCES public.stores(id);

-- 2) Função de validação
CREATE OR REPLACE FUNCTION public.validate_employee_stores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contracting_is_branch boolean;
  alloc_parent uuid;
BEGIN
  -- Loja contratante (store_id) deve ser matriz (parent_store_id IS NULL)
  SELECT (parent_store_id IS NOT NULL) INTO contracting_is_branch
    FROM public.stores WHERE id = NEW.store_id;

  IF contracting_is_branch IS NULL THEN
    RAISE EXCEPTION 'Loja contratante inválida.';
  END IF;
  IF contracting_is_branch THEN
    RAISE EXCEPTION 'A loja contratante deve ser uma matriz, não uma filial.';
  END IF;

  -- Default: alocação = matriz contratante
  IF NEW.allocated_store_id IS NULL THEN
    NEW.allocated_store_id := NEW.store_id;
  END IF;

  -- Alocação deve ser a própria matriz OU uma filial dela
  IF NEW.allocated_store_id <> NEW.store_id THEN
    SELECT parent_store_id INTO alloc_parent
      FROM public.stores WHERE id = NEW.allocated_store_id;
    IF alloc_parent IS DISTINCT FROM NEW.store_id THEN
      RAISE EXCEPTION 'A loja de alocação deve ser a matriz contratante ou uma filial subordinada a ela.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS validate_employee_stores_trg ON public.employees;
CREATE TRIGGER validate_employee_stores_trg
  BEFORE INSERT OR UPDATE OF store_id, allocated_store_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.validate_employee_stores();

-- 4) Backfill: alocação inicial = loja contratante atual
UPDATE public.employees
SET allocated_store_id = store_id
WHERE allocated_store_id IS NULL;

-- 5) Índice para filtros por filial
CREATE INDEX IF NOT EXISTS idx_employees_allocated_store ON public.employees(allocated_store_id);