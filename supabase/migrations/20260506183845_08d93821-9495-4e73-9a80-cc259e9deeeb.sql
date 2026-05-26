
-- Função pública: lista freelancers ativos ainda sem conta vinculada
CREATE OR REPLACE FUNCTION public.list_unlinked_freelancers()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name
  FROM public.freelancers
  WHERE user_id IS NULL
    AND COALESCE(status, 'active') = 'active'
  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_unlinked_freelancers() TO anon, authenticated;

-- Vincula por id do freelancer (usuário escolhe na lista)
CREATE OR REPLACE FUNCTION public.link_freelancer_account_by_id(_freelancer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_existing uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  -- Já vinculado a este usuário?
  SELECT id INTO v_existing FROM public.freelancers WHERE user_id = v_user LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE public.freelancers
  SET user_id = v_user,
      email = COALESCE(email, v_email),
      status = 'active'
  WHERE id = _freelancer_id
    AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'freelancer_not_found_or_already_linked';
  END IF;

  RETURN _freelancer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_freelancer_account_by_id(uuid) TO authenticated;
