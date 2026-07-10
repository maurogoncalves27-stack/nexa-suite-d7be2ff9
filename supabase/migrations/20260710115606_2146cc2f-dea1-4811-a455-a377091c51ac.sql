
ALTER TABLE public.custom_document_versions
  ADD COLUMN IF NOT EXISTS target_employee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

DROP POLICY IF EXISTS "Employees view versions of their docs" ON public.custom_document_versions;

CREATE POLICY "Employees view versions of their docs"
ON public.custom_document_versions
FOR SELECT
USING (
  (current_user_position() = ANY (target_positions))
  OR (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.id = ANY (custom_document_versions.target_employee_ids)
    )
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.custom_document_signatures s
      WHERE s.version_id = custom_document_versions.id
        AND s.user_id = auth.uid()
    )
  )
);
