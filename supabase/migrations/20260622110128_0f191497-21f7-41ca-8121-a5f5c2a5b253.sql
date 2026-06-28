-- Remove public SELECT exposing location/store_id/notes for all future interview_slots
DROP POLICY IF EXISTS "Public can view available future slots" ON public.interview_slots;

-- Public can only see slots when there is at least one PUBLIC, OPEN job opening,
-- and only via a view that hides location/store_id/notes.
CREATE OR REPLACE VIEW public.interview_slots_public
WITH (security_invoker = off) AS
SELECT s.id, s.start_at, s.duration_min
FROM public.interview_slots s
WHERE s.is_available = true
  AND s.booked_by_candidate_id IS NULL
  AND s.start_at > now()
  AND EXISTS (
    SELECT 1 FROM public.job_openings o
    WHERE o.is_public = true AND o.status = 'open'
  );

GRANT SELECT ON public.interview_slots_public TO anon, authenticated;