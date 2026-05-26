-- 1. Função que indica se o usuário tem acesso a TODAS as lojas (sem virar admin/manager).
--    Mantém em sincronia com o helper TS allHasStoresAccess em src/hooks/useAuth.tsx.
CREATE OR REPLACE FUNCTION public.has_all_stores_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id = ANY (ARRAY[
    'c70799e6-e9bb-4aa0-8d83-113106f6156b'::uuid  -- LILIAN LIMA
  ]::uuid[]);
$function$;

-- 2. user_accessible_stores agora devolve TODAS as lojas quando o usuário tem esse bypass.
CREATE OR REPLACE FUNCTION public.user_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Bypass: usuários com acesso a todas as lojas enxergam tudo (sem precisar de admin/manager).
  SELECT id FROM public.stores
   WHERE public.has_all_stores_access(_user_id)
  UNION
  -- Loja vinculada no profile do usuário
  SELECT public.get_user_store(_user_id)
   WHERE public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Filiais virtuais da loja vinculada
  SELECT s.id
    FROM public.stores s
   WHERE s.parent_store_id = public.get_user_store(_user_id)
     AND public.get_user_store(_user_id) IS NOT NULL;
$function$;