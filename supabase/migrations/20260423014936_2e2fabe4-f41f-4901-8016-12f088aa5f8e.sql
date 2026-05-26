-- =========================================================
-- Conciliação bancária via OFX
-- =========================================================

-- 1) Contas bancárias (globais, não por loja)
CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bank_code TEXT,
  bank_name TEXT,
  agency TEXT,
  account_number TEXT,
  account_type TEXT, -- 'checking', 'savings', etc.
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver contas bancárias"
ON public.bank_accounts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff pode criar contas bancárias"
ON public.bank_accounts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff pode editar contas bancárias"
ON public.bank_accounts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin pode excluir contas bancárias"
ON public.bank_accounts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_bank_accounts_updated
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) Extratos importados (cabeçalho do OFX)
CREATE TABLE public.bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  file_name TEXT,
  period_start DATE,
  period_end DATE,
  opening_balance NUMERIC(14,2),
  closing_balance NUMERIC(14,2),
  ofx_bank_id TEXT,
  ofx_account_id TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver extratos"
ON public.bank_statements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff pode importar extratos"
ON public.bank_statements FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin pode remover extratos"
ON public.bank_statements FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));


-- 3) Transações do extrato
CREATE TABLE public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  fit_id TEXT,                 -- ID único da transação no OFX
  posted_at DATE NOT NULL,     -- DTPOSTED
  amount NUMERIC(14,2) NOT NULL, -- positivo (crédito) ou negativo (débito)
  trn_type TEXT,               -- TRNTYPE: DEBIT, CREDIT, FEE, etc.
  memo TEXT,
  check_number TEXT,
  payee TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_fitid_unique UNIQUE (bank_account_id, fit_id)
);

CREATE INDEX idx_bank_tx_account_date ON public.bank_transactions (bank_account_id, posted_at DESC);
CREATE INDEX idx_bank_tx_statement ON public.bank_transactions (statement_id);
CREATE INDEX idx_bank_tx_unreconciled ON public.bank_transactions (bank_account_id, posted_at DESC) WHERE reconciled_at IS NULL;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver transações"
ON public.bank_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff pode inserir transações"
ON public.bank_transactions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff pode atualizar transações"
ON public.bank_transactions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin pode remover transações"
ON public.bank_transactions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_bank_transactions_updated
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4) Liga conta a pagar à transação bancária que a quitou
ALTER TABLE public.accounts_payable
  ADD COLUMN bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_accounts_payable_bank_tx ON public.accounts_payable (bank_transaction_id);


-- 5) RPC: aplicar match (concilia transação + dá baixa em conta a pagar)
CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction(
  _transaction_id UUID,
  _payable_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_payable RECORD;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para conciliar';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já conciliada'; END IF;

  SELECT * INTO v_payable FROM public.accounts_payable WHERE id = _payable_id;
  IF v_payable IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada'; END IF;
  IF v_payable.status = 'paid' THEN RAISE EXCEPTION 'Conta já está paga'; END IF;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  UPDATE public.accounts_payable
     SET status = 'paid',
         paid_at = v_tx.posted_at,
         paid_by = v_uid,
         bank_transaction_id = _transaction_id,
         bank_account_id = v_tx.bank_account_id,
         updated_at = now()
   WHERE id = _payable_id;

  RETURN jsonb_build_object('reconciled', true, 'payable_id', _payable_id, 'transaction_id', _transaction_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_bank_transaction(UUID, UUID) TO authenticated;


-- 6) RPC: desfazer conciliação
CREATE OR REPLACE FUNCTION public.unreconcile_bank_transaction(_transaction_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.accounts_payable
     SET status = 'open',
         paid_at = NULL,
         paid_by = NULL,
         bank_transaction_id = NULL,
         bank_account_id = NULL,
         updated_at = now()
   WHERE bank_transaction_id = _transaction_id;

  UPDATE public.bank_transactions
     SET reconciled_at = NULL, reconciled_by = NULL
   WHERE id = _transaction_id;

  RETURN jsonb_build_object('unreconciled', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.unreconcile_bank_transaction(UUID) TO authenticated;
