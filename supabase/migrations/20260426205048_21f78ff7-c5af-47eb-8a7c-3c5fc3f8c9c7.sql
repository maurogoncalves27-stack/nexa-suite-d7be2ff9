-- Função que identifica usuárias com permissão especial total.
-- Coloque aqui a lista de user_ids autorizados.
CREATE OR REPLACE FUNCTION public.is_super_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = ANY (ARRAY[
    'c70799e6-e9bb-4aa0-8d83-113106f6156b'::uuid, -- LILIAN LIMA
    '22404c0e-b66a-433b-a5ed-2ad93750afe3'::uuid  -- LILIAN BEZERRA LIMA
  ]::uuid[]);
$$;

GRANT EXECUTE ON FUNCTION public.is_super_user(uuid) TO authenticated, anon;

-- Atualiza has_role para tratar super_user como admin/manager automaticamente,
-- garantindo acesso total nas RLS sem precisar mexer em cada policy individual.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_user(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    );
$$;