DO $$ BEGIN CREATE TYPE public.payroll_advance_type AS ENUM ('advance','deduction','loan'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payroll_advance_status AS ENUM ('pending','partially_applied','applied','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payroll_installment_status AS ENUM ('pending','applied','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.payroll_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  type public.payroll_advance_type NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  start_year INTEGER NOT NULL,
  start_month INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  description TEXT,
  attachment_url TEXT,
  status public.payroll_advance_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_advances_employee ON public.payroll_advances(employee_id);
CREATE INDEX idx_payroll_advances_store ON public.payroll_advances(store_id);
CREATE INDEX idx_payroll_advances_status ON public.payroll_advances(status);

CREATE TABLE public.payroll_advance_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id UUID NOT NULL REFERENCES public.payroll_advances(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference_year INTEGER NOT NULL,
  reference_month INTEGER NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  status public.payroll_installment_status NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  payroll_calculated_id UUID REFERENCES public.payroll_calculated(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_inst_advance ON public.payroll_advance_installments(advance_id);
CREATE INDEX idx_payroll_inst_employee_ref ON public.payroll_advance_installments(employee_id, reference_year, reference_month);
CREATE INDEX idx_payroll_inst_status ON public.payroll_advance_installments(status);

CREATE TRIGGER trg_payroll_advances_updated BEFORE UPDATE ON public.payroll_advances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payroll_inst_updated BEFORE UPDATE ON public.payroll_advance_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_advance_installments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i INTEGER; parcela_valor NUMERIC(12,2); ano INTEGER; mes INTEGER; resto NUMERIC(12,2);
BEGIN
  parcela_valor := ROUND(NEW.total_amount / NEW.installments_count, 2);
  resto := NEW.total_amount - (parcela_valor * NEW.installments_count);
  FOR i IN 1..NEW.installments_count LOOP
    ano := NEW.start_year; mes := NEW.start_month + (i - 1);
    WHILE mes > 12 LOOP mes := mes - 12; ano := ano + 1; END LOOP;
    INSERT INTO public.payroll_advance_installments (advance_id, employee_id, installment_number, amount, reference_year, reference_month, status)
    VALUES (NEW.id, NEW.employee_id, i, CASE WHEN i=1 THEN parcela_valor + resto ELSE parcela_valor END, ano, mes, 'pending');
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_generate_installments AFTER INSERT ON public.payroll_advances FOR EACH ROW EXECUTE FUNCTION public.generate_advance_installments();

CREATE OR REPLACE FUNCTION public.cascade_cancel_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE public.payroll_advance_installments SET status='cancelled' WHERE advance_id=NEW.id AND status='pending';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cascade_cancel_advance AFTER UPDATE ON public.payroll_advances FOR EACH ROW EXECUTE FUNCTION public.cascade_cancel_advance();

ALTER TABLE public.payroll_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advance_installments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_employee(_user_id UUID, _employee_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = _employee_id AND (e.store_id IS NULL OR public.user_can_access_store(_user_id, e.store_id)));
$$;

CREATE POLICY "advances_select" ON public.payroll_advances FOR SELECT TO authenticated
USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.user_can_access_employee(auth.uid(), employee_id) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.user_id=auth.uid()));

CREATE POLICY "advances_insert" ON public.payroll_advances FOR INSERT TO authenticated
WITH CHECK (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.user_can_access_employee(auth.uid(), employee_id));

CREATE POLICY "advances_update" ON public.payroll_advances FOR UPDATE TO authenticated
USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR (public.user_can_access_employee(auth.uid(), employee_id) AND status='pending'));

CREATE POLICY "advances_delete" ON public.payroll_advances FOR DELETE TO authenticated
USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE POLICY "installments_select" ON public.payroll_advance_installments FOR SELECT TO authenticated
USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.user_can_access_employee(auth.uid(), employee_id) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.user_id=auth.uid()));

CREATE POLICY "installments_update" ON public.payroll_advance_installments FOR UPDATE TO authenticated
USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));