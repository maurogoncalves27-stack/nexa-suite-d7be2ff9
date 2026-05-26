-- Permitir que o colaborador marque suas infrações como vistas
ALTER TABLE public.employee_infractions
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

-- Política: o próprio colaborador pode dar UPDATE apenas para marcar como visto
DROP POLICY IF EXISTS "Employee acknowledges own infraction" ON public.employee_infractions;
CREATE POLICY "Employee acknowledges own infraction"
ON public.employee_infractions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_infractions.employee_id
      AND e.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_infractions.employee_id
      AND e.user_id = auth.uid()
  )
);