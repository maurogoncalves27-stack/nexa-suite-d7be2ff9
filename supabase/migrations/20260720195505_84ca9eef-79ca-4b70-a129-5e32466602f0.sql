CREATE OR REPLACE FUNCTION public.can_submit_climate_response(_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.climate_surveys s
      WHERE s.id = _survey_id
        AND s.status = 'open'
        AND CURRENT_DATE BETWEEN s.start_date AND s.end_date
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.can_submit_climate_response(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_climate_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_climate_response(uuid) TO service_role;

DROP POLICY IF EXISTS "Active employees insert climate responses" ON public.climate_responses;
CREATE POLICY "Active employees insert climate responses"
ON public.climate_responses
FOR INSERT
TO authenticated
WITH CHECK (public.can_submit_climate_response(survey_id));

DROP POLICY IF EXISTS "Authenticated insert climate answers" ON public.climate_response_answers;
CREATE POLICY "Authenticated insert climate answers"
ON public.climate_response_answers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.climate_responses r
    WHERE r.id = climate_response_answers.response_id
      AND public.can_submit_climate_response(r.survey_id)
  )
);