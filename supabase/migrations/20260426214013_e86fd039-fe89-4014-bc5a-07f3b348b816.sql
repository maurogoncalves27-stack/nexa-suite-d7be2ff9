CREATE OR REPLACE FUNCTION public.is_super_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id = ANY (ARRAY[
    '22404c0e-b66a-433b-a5ed-2ad93750afe3'::uuid  -- LILIAN BEZERRA LIMA
  ]::uuid[]);
$function$;