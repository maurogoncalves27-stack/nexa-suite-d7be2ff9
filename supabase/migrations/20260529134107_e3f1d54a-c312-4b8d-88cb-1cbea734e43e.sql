
-- 1. pdv_order_events: restrict INSERT to users with store access
DROP POLICY IF EXISTS "auth write pdv_order_events" ON public.pdv_order_events;
CREATE POLICY "auth write pdv_order_events scoped"
ON public.pdv_order_events
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (store_id IS NOT NULL AND user_can_access_store(auth.uid(), store_id))
);

-- 2. pdv_table_sessions: restrict SELECT to accessible stores
DROP POLICY IF EXISTS "auth_read_sessions" ON public.pdv_table_sessions;
CREATE POLICY "auth_read_sessions_scoped"
ON public.pdv_table_sessions
FOR SELECT
TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR user_can_access_store(auth.uid(), store_id)
);

-- 3. pdv_table_rounds: restrict SELECT via session -> store
DROP POLICY IF EXISTS "auth_read_rounds" ON public.pdv_table_rounds;
CREATE POLICY "auth_read_rounds_scoped"
ON public.pdv_table_rounds
FOR SELECT
TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.pdv_table_sessions s
    WHERE s.id = pdv_table_rounds.session_id
      AND user_can_access_store(auth.uid(), s.store_id)
  )
);

-- 4. nutri_visit_checklist_responses: restrict SELECT via visit_report -> store
DROP POLICY IF EXISTS "nutri_vcr_select" ON public.nutri_visit_checklist_responses;
CREATE POLICY "nutri_vcr_select"
ON public.nutri_visit_checklist_responses
FOR SELECT
TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'nutritionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.nutri_visit_reports r
    WHERE r.id = nutri_visit_checklist_responses.visit_report_id
      AND (r.user_id = auth.uid() OR user_can_access_store(auth.uid(), r.store_id))
  )
);

-- 5. gas_voucher_requests: restrict INSERT to accessible store
DROP POLICY IF EXISTS "Authenticated creates gas requests" ON public.gas_voucher_requests;
CREATE POLICY "Authenticated creates gas requests"
ON public.gas_voucher_requests
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR user_can_access_store(auth.uid(), store_id)
);

-- 6. job_interview_slots: tighten public claim — application must exist and target the same opening
DROP POLICY IF EXISTS "Public can claim available slot" ON public.job_interview_slots;
CREATE POLICY "Public can claim available slot"
ON public.job_interview_slots
FOR UPDATE
USING (
  is_available = true
  AND EXISTS (
    SELECT 1 FROM public.job_openings o
    WHERE o.id = job_interview_slots.job_opening_id
      AND o.is_public = true
      AND o.status = 'open'
  )
)
WITH CHECK (
  is_available = false
  AND taken_by_application_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.job_applications a
    WHERE a.id = job_interview_slots.taken_by_application_id
      AND a.job_opening_id = job_interview_slots.job_opening_id
  )
);
