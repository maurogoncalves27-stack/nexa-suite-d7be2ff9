
DROP POLICY IF EXISTS "Employees view documents for their position" ON public.custom_documents;

CREATE POLICY "Employees view documents targeted to them"
  ON public.custom_documents FOR SELECT
  USING (
    is_active AND EXISTS (
      SELECT 1 FROM public.custom_document_versions v
      WHERE v.document_id = custom_documents.id
        AND v.version_number = custom_documents.current_version
        AND (
          public.current_user_position() = ANY (v.target_positions)
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.user_id = auth.uid()
              AND e.id = ANY (v.target_employee_ids)
          )
        )
    )
  );
