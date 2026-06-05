CREATE OR REPLACE FUNCTION public.list_shift_swap_partner_schedule(
  _requester_employee_id uuid,
  _partner_employee_id uuid
)
RETURNS TABLE (
  id uuid,
  schedule_date date,
  is_day_off boolean,
  is_home_office boolean,
  start_time time,
  end_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws.id, ws.schedule_date, ws.is_day_off, ws.is_home_office, ws.start_time, ws.end_time
  FROM public.work_schedules ws
  WHERE ws.employee_id = _partner_employee_id
    AND ws.schedule_date >= CURRENT_DATE
    AND ws.schedule_date <= CURRENT_DATE + INTERVAL '60 days'
    AND EXISTS (
      SELECT 1 FROM public.employees me
       WHERE me.id = _requester_employee_id
         AND me.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.employees p
       WHERE p.id = _partner_employee_id
         AND p.status = 'active'
    )
  ORDER BY ws.schedule_date;
$$;

GRANT EXECUTE ON FUNCTION public.list_shift_swap_partner_schedule(uuid, uuid) TO authenticated;