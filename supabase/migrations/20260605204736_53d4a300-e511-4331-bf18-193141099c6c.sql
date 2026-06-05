CREATE OR REPLACE FUNCTION public.list_shift_swap_candidates(_requester_employee_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  user_id uuid,
  position_name text,
  store_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.full_name,
    e.user_id,
    e.position AS position_name,
    s.name AS store_name
  FROM public.employees e
  LEFT JOIN public.stores s ON s.id = e.store_id
  WHERE e.id <> _requester_employee_id
    AND e.status = 'active'
    AND e.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.employees me
       WHERE me.id = _requester_employee_id
         AND me.user_id = auth.uid()
    )
  ORDER BY e.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_shift_swap_candidates(uuid) TO authenticated;