CREATE OR REPLACE FUNCTION public.validate_store_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_has_parent boolean;
BEGIN
  IF NEW.parent_store_id IS NOT NULL THEN
    IF NEW.parent_store_id = NEW.id THEN
      RAISE EXCEPTION 'Uma loja não pode ser matriz de si mesma';
    END IF;

    -- Marcas (is_virtual=true) podem ser vinculadas a qualquer loja física (matriz ou filial)
    IF NEW.is_virtual THEN
      RETURN NEW;
    END IF;

    -- Lojas físicas: hierarquia limitada a 2 níveis (matriz -> filial)
    SELECT (parent_store_id IS NOT NULL) INTO parent_has_parent
      FROM public.stores WHERE id = NEW.parent_store_id;
    IF parent_has_parent THEN
      RAISE EXCEPTION 'A loja matriz selecionada já é uma filial. Selecione uma matriz de primeiro nível.';
    END IF;
    -- Se esta loja é matriz de outras, não pode virar filial
    IF EXISTS (SELECT 1 FROM public.stores WHERE parent_store_id = NEW.id AND is_virtual = false) THEN
      RAISE EXCEPTION 'Esta loja já é matriz de outras filiais. Remova as filiais antes de torná-la subordinada.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;