
-- =========================================================================
-- 1) PAYROLL_* — restrict to admin/hr/manager + super_user
-- =========================================================================

-- payroll_holiday_worked
DROP POLICY IF EXISTS "Authenticated can delete holiday worked" ON public.payroll_holiday_worked;
DROP POLICY IF EXISTS "Authenticated can insert holiday worked" ON public.payroll_holiday_worked;
DROP POLICY IF EXISTS "Authenticated can read holiday worked" ON public.payroll_holiday_worked;

CREATE POLICY "Payroll staff read holiday worked" ON public.payroll_holiday_worked
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert holiday worked" ON public.payroll_holiday_worked
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update holiday worked" ON public.payroll_holiday_worked
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete holiday worked" ON public.payroll_holiday_worked
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_holiday_worked_review
DROP POLICY IF EXISTS "Authenticated can delete holiday review" ON public.payroll_holiday_worked_review;
DROP POLICY IF EXISTS "Authenticated can insert holiday review" ON public.payroll_holiday_worked_review;
DROP POLICY IF EXISTS "Authenticated can view holiday review" ON public.payroll_holiday_worked_review;

CREATE POLICY "Payroll staff read holiday review" ON public.payroll_holiday_worked_review
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert holiday review" ON public.payroll_holiday_worked_review
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update holiday review" ON public.payroll_holiday_worked_review
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete holiday review" ON public.payroll_holiday_worked_review
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_vt_review
DROP POLICY IF EXISTS "Authenticated can delete vt review" ON public.payroll_vt_review;
DROP POLICY IF EXISTS "Authenticated can insert vt review" ON public.payroll_vt_review;
DROP POLICY IF EXISTS "Authenticated can view vt review" ON public.payroll_vt_review;

CREATE POLICY "Payroll staff read vt review" ON public.payroll_vt_review
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert vt review" ON public.payroll_vt_review
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update vt review" ON public.payroll_vt_review
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete vt review" ON public.payroll_vt_review
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_advances_review
DROP POLICY IF EXISTS "Authenticated can delete advances review" ON public.payroll_advances_review;
DROP POLICY IF EXISTS "Authenticated can insert advances review" ON public.payroll_advances_review;
DROP POLICY IF EXISTS "Authenticated can view advances review" ON public.payroll_advances_review;

CREATE POLICY "Payroll staff read advances review" ON public.payroll_advances_review
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert advances review" ON public.payroll_advances_review
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update advances review" ON public.payroll_advances_review
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete advances review" ON public.payroll_advances_review
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_night_addition
DROP POLICY IF EXISTS "Authenticated manage night addition" ON public.payroll_night_addition;
DROP POLICY IF EXISTS "Authenticated read night addition" ON public.payroll_night_addition;

CREATE POLICY "Payroll staff read night addition" ON public.payroll_night_addition
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert night addition" ON public.payroll_night_addition
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update night addition" ON public.payroll_night_addition
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete night addition" ON public.payroll_night_addition
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_night_addition_review
DROP POLICY IF EXISTS "Authenticated manage night addition review" ON public.payroll_night_addition_review;
DROP POLICY IF EXISTS "Authenticated read night addition review" ON public.payroll_night_addition_review;

CREATE POLICY "Payroll staff read night addition review" ON public.payroll_night_addition_review
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff insert night addition review" ON public.payroll_night_addition_review
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff update night addition review" ON public.payroll_night_addition_review
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff delete night addition review" ON public.payroll_night_addition_review
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- payroll_edit_locks (mantém INSERT/UPDATE com user_id=auth.uid, restringe leitura/delete)
DROP POLICY IF EXISTS "Authenticated can release payroll lock" ON public.payroll_edit_locks;
DROP POLICY IF EXISTS "Authenticated can view payroll locks" ON public.payroll_edit_locks;
DROP POLICY IF EXISTS "Authenticated can take over payroll lock" ON public.payroll_edit_locks;

CREATE POLICY "Payroll staff read locks" ON public.payroll_edit_locks
  FOR SELECT TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Payroll staff take over lock" ON public.payroll_edit_locks
  FOR UPDATE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Payroll staff release lock" ON public.payroll_edit_locks
  FOR DELETE TO authenticated
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'manager'));

-- =========================================================================
-- 2) EMPLOYEES_DIRECTORY view (safe columns only)
-- =========================================================================
CREATE OR REPLACE VIEW public.employees_directory
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  full_name,
  social_name,
  position,
  department,
  store_id,
  allocated_store_id,
  avatar_path,
  status,
  hire_date,
  termination_date
FROM public.employees;

GRANT SELECT ON public.employees_directory TO authenticated;
