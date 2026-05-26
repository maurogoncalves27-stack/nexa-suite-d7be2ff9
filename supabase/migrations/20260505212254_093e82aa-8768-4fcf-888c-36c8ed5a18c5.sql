CREATE OR REPLACE FUNCTION public.can_receive_inventory(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'manager')
    OR EXISTS (
      SELECT 1
        FROM public.employees e
        JOIN public.inventory_receiving_positions p ON p.position = e.position
       WHERE e.user_id = _user_id
         AND e.status IN ('active','in_training')
    )
    OR EXISTS (
      SELECT 1
        FROM public.employees e
        JOIN public.user_access_overrides o ON o.user_id = e.user_id
       WHERE e.user_id = _user_id
         AND e.status IN ('active','in_training')
         AND COALESCE(o.can_receive_invoices, false) = true
    );
$$;