
-- Função auxiliar: retorna store_id atual do perfil do usuário
CREATE OR REPLACE FUNCTION public.current_profile_store_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Recria política de UPDATE adicionando WITH CHECK que impede alterar store_id
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::app_role)
  )
  OR (
    auth.uid() = user_id
    AND store_id IS NOT DISTINCT FROM public.current_profile_store_id(auth.uid())
  )
);
