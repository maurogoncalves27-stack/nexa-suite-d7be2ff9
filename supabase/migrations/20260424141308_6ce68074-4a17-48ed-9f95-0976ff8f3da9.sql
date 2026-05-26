-- Adiciona coluna de tipo (congelador/refrigerador) e store_id ao equipamento NutriControle
ALTER TABLE public.nutri_equipment
  ADD COLUMN IF NOT EXISTS equipment_type text NOT NULL DEFAULT 'refrigerator',
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Validação do tipo via trigger (CHECK pode ser limitante; aqui é simples, mas usamos trigger por padrão do projeto)
CREATE OR REPLACE FUNCTION public.validate_nutri_equipment_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.equipment_type NOT IN ('freezer','refrigerator') THEN
    RAISE EXCEPTION 'equipment_type inválido: %. Use freezer ou refrigerator.', NEW.equipment_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_nutri_equipment_type ON public.nutri_equipment;
CREATE TRIGGER trg_validate_nutri_equipment_type
  BEFORE INSERT OR UPDATE ON public.nutri_equipment
  FOR EACH ROW EXECUTE FUNCTION public.validate_nutri_equipment_type();

CREATE INDEX IF NOT EXISTS idx_nutri_equipment_store_id ON public.nutri_equipment(store_id);