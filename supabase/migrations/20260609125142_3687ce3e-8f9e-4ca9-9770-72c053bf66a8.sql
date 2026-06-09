CREATE OR REPLACE FUNCTION public.is_super_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id = ANY (ARRAY[
    'ec5e52b2-a4c3-46c7-8d11-a5b6cf406866'::uuid,  -- Mauro Souza
    'c23ee5c2-9fd8-415d-b5a6-f1fc77b5dbcf'::uuid   -- Luiz Cesar (lrasec2505@gmail.com)
  ]::uuid[]);
$function$;