-- 1) Matrícula
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS registration_number text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_registration_number_unique
  ON public.employees (registration_number)
  WHERE registration_number IS NOT NULL AND length(btrim(registration_number)) > 0;

-- 2) Campos extras nas linhas
ALTER TABLE public.payroll_import_rows
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS fgts_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS irrf_discount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS payroll_import_rows_registration_idx
  ON public.payroll_import_rows (registration_number);

-- 3) Rubricas detalhadas
CREATE TABLE IF NOT EXISTS public.payroll_import_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL REFERENCES public.payroll_import_rows(id) ON DELETE CASCADE,
  code text,
  description text,
  reference text,
  kind text NOT NULL CHECK (kind IN ('earning','deduction','informative')),
  value numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_import_rubrics_row_idx
  ON public.payroll_import_rubrics (row_id);

ALTER TABLE public.payroll_import_rubrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Staff can view payroll rubrics"
    ON public.payroll_import_rubrics FOR SELECT
    USING (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can insert payroll rubrics"
    ON public.payroll_import_rubrics FOR INSERT
    WITH CHECK (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can update payroll rubrics"
    ON public.payroll_import_rubrics FOR UPDATE
    USING (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can delete payroll rubrics"
    ON public.payroll_import_rubrics FOR DELETE
    USING (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-imports', 'payroll-imports', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Staff can read payroll import files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'payroll-imports' AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can upload payroll import files"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'payroll-imports' AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can delete payroll import files"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'payroll-imports' AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;