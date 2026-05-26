-- Tabela mestre: 1 importação por mês/ano
CREATE TABLE public.payroll_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_year smallint NOT NULL,
  ref_month smallint NOT NULL CHECK (ref_month BETWEEN 1 AND 12),
  file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ref_year, ref_month)
);

-- Linhas da planilha
CREATE TABLE public.payroll_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.payroll_imports(id) ON DELETE CASCADE,
  cpf text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  full_name text,
  position text,
  store_name text,
  salary numeric NOT NULL DEFAULT 0,
  month_bonus numeric NOT NULL DEFAULT 0,
  infraction_discount numeric NOT NULL DEFAULT 0,
  vt_discount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_import_rows_import ON public.payroll_import_rows(import_id);
CREATE INDEX idx_payroll_import_rows_cpf ON public.payroll_import_rows(cpf);

-- Triggers updated_at
CREATE TRIGGER trg_payroll_imports_updated
BEFORE UPDATE ON public.payroll_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.payroll_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_import_rows ENABLE ROW LEVEL SECURITY;

-- Policies: apenas admin e manager
CREATE POLICY "Staff can view payroll imports"
ON public.payroll_imports FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can insert payroll imports"
ON public.payroll_imports FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update payroll imports"
ON public.payroll_imports FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete payroll imports"
ON public.payroll_imports FOR DELETE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can view payroll rows"
ON public.payroll_import_rows FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can insert payroll rows"
ON public.payroll_import_rows FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete payroll rows"
ON public.payroll_import_rows FOR DELETE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));