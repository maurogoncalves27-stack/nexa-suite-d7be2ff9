CREATE OR REPLACE FUNCTION public.is_super_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = ANY (ARRAY[
    'ec5e52b2-a4c3-46c7-8d11-a5b6cf406866'::uuid,  -- Mauro Souza
    'c6b6e4e0-a0a3-4fce-9214-8ccf23782fa1'::uuid   -- Luiz Cesar (lrasec2505@gmail.com)
  ]::uuid[]);
$$;