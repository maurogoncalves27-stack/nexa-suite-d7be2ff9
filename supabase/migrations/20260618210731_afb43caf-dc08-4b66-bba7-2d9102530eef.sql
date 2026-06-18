
-- Fix 1: appointments — restringir SELECT a usuários autenticados
DROP POLICY IF EXISTS "Employees view their appointments" ON public.appointments;
CREATE POLICY "Employees view their appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  (scope = 'all')
  OR (scope = 'store' AND store_id IN (
    SELECT COALESCE(employees.allocated_store_id, employees.store_id)
    FROM employees WHERE employees.user_id = auth.uid()
  ))
  OR (scope = 'employee' AND employee_id IN (
    SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()
  ))
);

-- Fix 2: storage nutri_maintenance_photos_insert — corrigir EXISTS para usar objects.name
DROP POLICY IF EXISTS "nutri_maintenance_photos_insert" ON storage.objects;
CREATE POLICY "nutri_maintenance_photos_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nutri-maintenance-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id::text = (storage.foldername(objects.name))[1]
      AND s.is_virtual = false
  )
  AND (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'nutritionist'::app_role)
    OR public.user_can_access_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);
