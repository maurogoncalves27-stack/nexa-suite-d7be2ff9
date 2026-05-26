CREATE OR REPLACE FUNCTION public.user_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Loja vinculada no profile
  SELECT public.get_user_store(_user_id)
   WHERE public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Filiais virtuais da loja vinculada
  SELECT s.id
    FROM public.stores s
   WHERE s.parent_store_id = public.get_user_store(_user_id)
     AND public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Lojas extras concedidas pelo override
  SELECT unnest(extra_store_ids)
    FROM public.user_access_overrides
   WHERE user_id = _user_id;
$function$;

DROP FUNCTION IF EXISTS public.has_all_stores_access(uuid);