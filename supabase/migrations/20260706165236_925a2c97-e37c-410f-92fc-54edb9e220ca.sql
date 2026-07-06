
-- 1) Tabela vacation_receipts
CREATE TABLE public.vacation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_schedule_id uuid NOT NULL UNIQUE REFERENCES public.vacation_schedules(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_year integer NOT NULL,
  reference_month integer NOT NULL,

  -- Bases
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0,
  vacation_days integer NOT NULL DEFAULT 0,
  sell_days integer NOT NULL DEFAULT 0,

  -- Cálculo
  vacation_base numeric(12,2) NOT NULL DEFAULT 0,
  one_third numeric(12,2) NOT NULL DEFAULT 0,
  sell_amount numeric(12,2) NOT NULL DEFAULT 0,
  sell_one_third numeric(12,2) NOT NULL DEFAULT 0,
  gross_total numeric(12,2) NOT NULL DEFAULT 0,
  inss numeric(12,2) NOT NULL DEFAULT 0,
  irrf numeric(12,2) NOT NULL DEFAULT 0,
  fgts numeric(12,2) NOT NULL DEFAULT 0,
  net_total numeric(12,2) NOT NULL DEFAULT 0,

  -- Pagamento
  payment_due_date date,
  payment_status text NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
  paid_at timestamptz,
  accounts_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,

  -- PDF
  pdf_url text,
  pdf_generated_at timestamptz,
  calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_by uuid
);

CREATE INDEX idx_vacation_receipts_employee ON public.vacation_receipts(employee_id);
CREATE INDEX idx_vacation_receipts_status ON public.vacation_receipts(payment_status);
CREATE INDEX idx_vacation_receipts_due ON public.vacation_receipts(payment_due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_receipts TO authenticated;
GRANT ALL ON public.vacation_receipts TO service_role;

ALTER TABLE public.vacation_receipts ENABLE ROW LEVEL SECURITY;

-- Admin / RH / super-user: gerenciam tudo
CREATE POLICY "Admin/HR gerenciam vacation_receipts"
ON public.vacation_receipts FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.is_super_user(auth.uid())
);

-- Colaborador vê os próprios
CREATE POLICY "Colaborador vê seus vacation_receipts"
ON public.vacation_receipts FOR SELECT
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Trigger updated_at
CREATE TRIGGER trg_vacation_receipts_updated_at
BEFORE UPDATE ON public.vacation_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Colunas em payroll_calculated
ALTER TABLE public.payroll_calculated
  ADD COLUMN IF NOT EXISTS vacation_days_in_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_deduction numeric(12,2) NOT NULL DEFAULT 0;

-- 3) Trigger de auto-geração ao aprovar férias
-- Chama edge function `calculate-vacation-receipt` via pg_net.
CREATE OR REPLACE FUNCTION public.trg_vacation_schedule_auto_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text := 'https://ixjgmerxxakdkfdzgumy.supabase.co';
  service_key text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- Dispara edge function assíncrona (best-effort — falha não bloqueia aprovação)
    BEGIN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/calculate-vacation-receipt',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('vacation_schedule_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto vacation receipt failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_schedule_auto_receipt ON public.vacation_schedules;
CREATE TRIGGER trg_vacation_schedule_auto_receipt
AFTER UPDATE OF status ON public.vacation_schedules
FOR EACH ROW EXECUTE FUNCTION public.trg_vacation_schedule_auto_receipt();
