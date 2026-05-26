-- Admin e manager devem ter acesso a todas as lojas, alinhando com o resto do sistema
CREATE OR REPLACE FUNCTION public.user_can_access_store(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'manager')
    OR EXISTS (
      SELECT 1
      FROM public.user_accessible_stores(_user_id) AS s
      WHERE s = _store_id
    );
$function$;