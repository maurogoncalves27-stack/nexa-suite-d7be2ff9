
-- Fix 1: climate_responses INSERT — exigir colaborador ativo
DROP POLICY IF EXISTS "Authenticated insert climate responses" ON public.climate_responses;
CREATE POLICY "Active employees insert climate responses"
ON public.climate_responses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.climate_surveys s
    WHERE s.id = climate_responses.survey_id AND s.status = 'open'
  )
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid() AND e.status = 'active'
  )
);

-- Fix 2: nutri_equipment INSERT — exigir nutricionista/admin/manager
DROP POLICY IF EXISTS "nutri_eq_insert" ON public.nutri_equipment;
CREATE POLICY "nutri_eq_insert"
ON public.nutri_equipment
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.is_super_user(auth.uid())
  )
);

-- Fix 3: nutri_items INSERT — exigir nutricionista/admin
DROP POLICY IF EXISTS "nutri_items_insert" ON public.nutri_items;
CREATE POLICY "nutri_items_insert"
ON public.nutri_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_user(auth.uid())
  )
);
