CREATE OR REPLACE FUNCTION public.get_manager_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT user_id
  FROM public.user_roles
  WHERE role IN ('admin'::app_role, 'manager'::app_role);
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_user_ids() TO authenticated;