-- Histórico de XMLs
CREATE TABLE IF NOT EXISTS public.payroll_xml_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.payroll_imports(id) ON DELETE CASCADE,
  ref_year smallint NOT NULL,
  ref_month smallint NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('gestor', 'contabilidade', 'admin')),
  kind text NOT NULL CHECK (kind IN ('inicial', 'reimportacao_contabilidade', 'reimportacao_gestor')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_xml_history_import ON public.payroll_xml_history(import_id);
CREATE INDEX IF NOT EXISTS idx_payroll_xml_history_period ON public.payroll_xml_history(ref_year, ref_month);

ALTER TABLE public.payroll_xml_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view xml history" ON public.payroll_xml_history;
DROP POLICY IF EXISTS "Staff can insert xml history" ON public.payroll_xml_history;

CREATE POLICY "Staff can view xml history"
  ON public.payroll_xml_history FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );

CREATE POLICY "Staff can insert xml history"
  ON public.payroll_xml_history FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );

-- payroll_imports — recria policies incluindo contabilidade
DROP POLICY IF EXISTS "Staff can view payroll imports" ON public.payroll_imports;
DROP POLICY IF EXISTS "Staff can insert payroll imports" ON public.payroll_imports;
DROP POLICY IF EXISTS "Staff can update payroll imports" ON public.payroll_imports;
DROP POLICY IF EXISTS "Staff can delete payroll imports" ON public.payroll_imports;

CREATE POLICY "Staff can view payroll imports" ON public.payroll_imports
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );
CREATE POLICY "Staff can insert payroll imports" ON public.payroll_imports
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );
CREATE POLICY "Staff can update payroll imports" ON public.payroll_imports
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );
CREATE POLICY "Staff can delete payroll imports" ON public.payroll_imports
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- payroll_import_rows
DO $$
DECLARE pol text;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_import_rows'
  LOOP EXECUTE format('DROP POLICY %I ON public.payroll_import_rows', pol); END LOOP;
END $$;

CREATE POLICY "Staff can view import rows" ON public.payroll_import_rows
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );
CREATE POLICY "Staff can manage import rows" ON public.payroll_import_rows
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );

-- payroll_import_rubrics
DO $$
DECLARE pol text;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_import_rubrics'
  LOOP EXECUTE format('DROP POLICY %I ON public.payroll_import_rubrics', pol); END LOOP;
END $$;

CREATE POLICY "Staff can manage import rubrics" ON public.payroll_import_rubrics
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'contabilidade'::public.app_role)
  );

-- employees: contabilidade pode ler dados básicos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employees' AND policyname='Contabilidade can view basic employees') THEN
    CREATE POLICY "Contabilidade can view basic employees" ON public.employees
      FOR SELECT TO authenticated USING (
        public.has_role(auth.uid(), 'contabilidade'::public.app_role)
      );
  END IF;
END $$;