DROP VIEW IF EXISTS public.interview_slots_public;

CREATE OR REPLACE FUNCTION public.list_public_interview_slots()
RETURNS TABLE (id uuid, start_at timestamptz, duration_min int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.start_at, s.duration_min
  FROM public.interview_slots s
  WHERE s.is_available = true
    AND s.booked_by_candidate_id IS NULL
    AND s.start_at > now()
    AND EXISTS (
      SELECT 1 FROM public.job_openings o
      WHERE o.is_public = true AND o.status = 'open'
    )
  ORDER BY s.start_at
  LIMIT 60;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_interview_slots() TO anon, authenticated;