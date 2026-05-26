-- Enum do workflow da folha
DO $$ BEGIN
  CREATE TYPE public.payroll_workflow_status AS ENUM (
    'gerada',
    'em_revisao_contabilidade',
    'aprovada_contabilidade',
    'consolidada',
    'estornada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coluna de status + notas + flags de sub-etapas da consolidação
ALTER TABLE public.payroll_imports
  ADD COLUMN IF NOT EXISTS workflow_status public.payroll_workflow_status NOT NULL DEFAULT 'gerada',
  ADD COLUMN IF NOT EXISTS accounting_notes text,
  ADD COLUMN IF NOT EXISTS accounts_payable_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS signatures_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS c6_export_done_at timestamptz;

-- Backfill: folhas que já tinham timestamps recebem o status correspondente
UPDATE public.payroll_imports
SET workflow_status = CASE
  WHEN consolidated_at IS NOT NULL THEN 'consolidada'::public.payroll_workflow_status
  WHEN accounting_ok_at IS NOT NULL THEN 'aprovada_contabilidade'::public.payroll_workflow_status
  WHEN sent_to_accounting_at IS NOT NULL THEN 'em_revisao_contabilidade'::public.payroll_workflow_status
  ELSE 'gerada'::public.payroll_workflow_status
END
WHERE workflow_status = 'gerada';

CREATE INDEX IF NOT EXISTS idx_payroll_imports_workflow_status
  ON public.payroll_imports(workflow_status);