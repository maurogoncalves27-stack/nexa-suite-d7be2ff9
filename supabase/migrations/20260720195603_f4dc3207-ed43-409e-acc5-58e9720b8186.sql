CREATE OR REPLACE FUNCTION public.can_submit_climate_answer(_response_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.climate_responses r
    WHERE r.id = _response_id
      AND public.can_submit_climate_response(r.survey_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_submit_climate_answer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_climate_answer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_climate_answer(uuid) TO service_role;

DROP POLICY IF EXISTS "Authenticated insert climate answers" ON public.climate_response_answers;
CREATE POLICY "Authenticated insert climate answers"
ON public.climate_response_answers
FOR INSERT
TO authenticated
WITH CHECK (public.can_submit_climate_answer(response_id));