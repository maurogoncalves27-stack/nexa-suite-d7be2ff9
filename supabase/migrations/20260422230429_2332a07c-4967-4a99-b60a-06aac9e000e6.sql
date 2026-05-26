-- Remove fornecedor MINERVA e seu usuário associado
DO $$
DECLARE
  v_supplier_id UUID := 'eb61a55d-3da5-459a-a9a2-c7a73f1aeff1';
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM public.suppliers WHERE id = v_supplier_id;

  -- Remove roles
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
  END IF;

  -- Remove fornecedor (CASCADE remove categorias e propostas)
  DELETE FROM public.suppliers WHERE id = v_supplier_id;

  -- Remove o usuário do auth
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;
END $$;