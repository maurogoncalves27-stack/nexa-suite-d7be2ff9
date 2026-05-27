
-- automation_rules: restrict SELECT to staff
DROP POLICY IF EXISTS "Staff can view automation rules" ON public.automation_rules;
CREATE POLICY "Staff can view automation rules"
ON public.automation_rules FOR SELECT TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

-- customer_reviews: restrict UPDATE to admin/manager
DROP POLICY IF EXISTS "Equipe atualiza avaliações" ON public.customer_reviews;
CREATE POLICY "Admin/Manager atualiza avaliações"
ON public.customer_reviews FOR UPDATE TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- employees: remove the overly-permissive "all active colleagues" SELECT policy
DROP POLICY IF EXISTS "Employees view all active colleagues" ON public.employees;

-- job_interview_slots: tighten anonymous UPDATE
DROP POLICY IF EXISTS "Public can claim available slot" ON public.job_interview_slots;
CREATE POLICY "Public can claim available slot"
ON public.job_interview_slots FOR UPDATE TO public
USING (is_available = true)
WITH CHECK (
  is_available = false
  AND taken_by_application_id IS NOT NULL
);

-- payroll_night_addition_review: drop wide-open policies; staff-restricted ones remain
DROP POLICY IF EXISTS "Authenticated manage night review" ON public.payroll_night_addition_review;
DROP POLICY IF EXISTS "Authenticated read night review" ON public.payroll_night_addition_review;

-- pdv_tef_transactions: scope INSERT/UPDATE to operational roles
DROP POLICY IF EXISTS "Authenticated can insert TEF tx" ON public.pdv_tef_transactions;
DROP POLICY IF EXISTS "Authenticated can update TEF tx" ON public.pdv_tef_transactions;

CREATE POLICY "Staff can insert TEF tx"
ON public.pdv_tef_transactions FOR INSERT TO authenticated
WITH CHECK (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'employee'::app_role)
);

CREATE POLICY "Staff can update TEF tx"
ON public.pdv_tef_transactions FOR UPDATE TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'employee'::app_role)
)
WITH CHECK (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'employee'::app_role)
);

-- stores: revoke client SELECT on fiscal credential columns (used only by edge functions)
REVOKE SELECT (nfce_csc_id, nfce_csc_token, nfce_csc_id_prod, nfce_csc_token_prod)
  ON public.stores FROM anon, authenticated;
