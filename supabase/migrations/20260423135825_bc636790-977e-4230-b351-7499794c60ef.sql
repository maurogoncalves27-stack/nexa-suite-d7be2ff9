-- =====================================================
-- MÓDULO FINANCEIRO UNIFICADO
-- =====================================================

-- 1) Categorias financeiras (despesa / receita)
CREATE TABLE public.finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','both')),
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, kind)
);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages finance categories"
  ON public.finance_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Authenticated reads finance categories"
  ON public.finance_categories
  FOR SELECT TO authenticated USING (TRUE);

CREATE TRIGGER tg_finance_categories_updated
  BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Categorias iniciais
INSERT INTO public.finance_categories (name, kind, sort_order) VALUES
  ('Fornecedores', 'expense', 10),
  ('Aluguel', 'expense', 20),
  ('Energia elétrica', 'expense', 30),
  ('Água', 'expense', 40),
  ('Internet/Telefonia', 'expense', 50),
  ('Folha de pagamento', 'expense', 60),
  ('Impostos', 'expense', 70),
  ('Manutenção', 'expense', 80),
  ('Marketing', 'expense', 90),
  ('Outras despesas', 'expense', 100),
  ('Vendas', 'income', 10),
  ('Recebimentos diversos', 'income', 20),
  ('Estorno', 'income', 30);

-- 2) Tornar invoice_id opcional em accounts_payable + novos campos
ALTER TABLE public.accounts_payable
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_category ON public.accounts_payable(category_id);

-- 3) Contas a receber
CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  payer_name TEXT,
  category_id UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  received_at DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','received','overdue','cancelled')),
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages receivables"
  ON public.accounts_receivable
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
    AND public.user_can_access_store(auth.uid(), store_id)
  )
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
    AND public.user_can_access_store(auth.uid(), store_id)
  );

CREATE INDEX idx_receivable_store ON public.accounts_receivable(store_id);
CREATE INDEX idx_receivable_status ON public.accounts_receivable(status);
CREATE INDEX idx_receivable_due_date ON public.accounts_receivable(due_date);
CREATE INDEX idx_receivable_bank_tx ON public.accounts_receivable(bank_transaction_id);

CREATE TRIGGER tg_receivable_updated
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Transferências entre contas próprias
CREATE TABLE public.bank_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  to_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  transferred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  notes TEXT,
  -- vínculo opcional com transações do OFX
  from_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  to_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages transfers"
  ON public.bank_transfers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE INDEX idx_transfer_from ON public.bank_transfers(from_account_id);
CREATE INDEX idx_transfer_to ON public.bank_transfers(to_account_id);
CREATE INDEX idx_transfer_date ON public.bank_transfers(transferred_at);

CREATE TRIGGER tg_transfer_updated
  BEFORE UPDATE ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Função de sugestão por histórico (usa pg_trgm já instalado)
CREATE OR REPLACE FUNCTION public.suggest_finance_entry(_memo TEXT, _kind TEXT)
RETURNS TABLE (
  description TEXT,
  party_name TEXT,
  category_id UUID,
  similarity_score REAL,
  source TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _memo IS NULL OR length(trim(_memo)) < 3 THEN
    RETURN;
  END IF;

  IF _kind = 'expense' THEN
    RETURN QUERY
      SELECT
        ap.description,
        ap.supplier_name AS party_name,
        ap.category_id,
        similarity(coalesce(ap.description,'') || ' ' || coalesce(ap.supplier_name,''), _memo) AS similarity_score,
        'payable'::TEXT AS source
      FROM public.accounts_payable ap
      WHERE ap.description IS NOT NULL
        AND similarity(coalesce(ap.description,'') || ' ' || coalesce(ap.supplier_name,''), _memo) > 0.25
      ORDER BY similarity_score DESC
      LIMIT 5;
  ELSIF _kind = 'income' THEN
    RETURN QUERY
      SELECT
        ar.description,
        ar.payer_name AS party_name,
        ar.category_id,
        similarity(coalesce(ar.description,'') || ' ' || coalesce(ar.payer_name,''), _memo) AS similarity_score,
        'receivable'::TEXT AS source
      FROM public.accounts_receivable ar
      WHERE ar.description IS NOT NULL
        AND similarity(coalesce(ar.description,'') || ' ' || coalesce(ar.payer_name,''), _memo) > 0.25
      ORDER BY similarity_score DESC
      LIMIT 5;
  END IF;
END;
$$;

-- 6) Função para criar conta a pagar a partir de transação OFX
CREATE OR REPLACE FUNCTION public.create_payable_from_bank_tx(
  _transaction_id UUID,
  _store_id UUID,
  _description TEXT,
  _supplier_name TEXT,
  _category_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_payable_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.amount >= 0 THEN RAISE EXCEPTION 'Apenas débitos podem virar contas a pagar'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já está conciliada'; END IF;

  INSERT INTO public.accounts_payable (
    store_id, invoice_id, amount, due_date, paid_at, paid_by,
    bank_account_id, bank_transaction_id, status,
    description, supplier_name, category_id, created_by
  ) VALUES (
    _store_id, NULL, abs(v_tx.amount), v_tx.posted_at, v_tx.posted_at, v_uid,
    v_tx.bank_account_id, _transaction_id, 'paid',
    _description, _supplier_name, _category_id, v_uid
  ) RETURNING id INTO v_payable_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  RETURN v_payable_id;
END;
$$;

-- 7) Função para criar conta a receber a partir de transação OFX
CREATE OR REPLACE FUNCTION public.create_receivable_from_bank_tx(
  _transaction_id UUID,
  _store_id UUID,
  _description TEXT,
  _payer_name TEXT,
  _category_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_recv_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.amount <= 0 THEN RAISE EXCEPTION 'Apenas créditos podem virar contas a receber'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já está conciliada'; END IF;

  INSERT INTO public.accounts_receivable (
    store_id, description, payer_name, category_id, amount,
    due_date, received_at, status, bank_account_id, bank_transaction_id,
    created_by, received_by
  ) VALUES (
    _store_id, _description, _payer_name, _category_id, v_tx.amount,
    v_tx.posted_at, v_tx.posted_at, 'received', v_tx.bank_account_id, _transaction_id,
    v_uid, v_uid
  ) RETURNING id INTO v_recv_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  RETURN v_recv_id;
END;
$$;

-- 8) Função para marcar par de transações como transferência interna
CREATE OR REPLACE FUNCTION public.create_transfer_from_bank_txs(
  _from_tx_id UUID,
  _to_tx_id UUID,
  _description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_from RECORD;
  v_to RECORD;
  v_transfer_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_from FROM public.bank_transactions WHERE id = _from_tx_id;
  SELECT * INTO v_to   FROM public.bank_transactions WHERE id = _to_tx_id;

  IF v_from IS NULL OR v_to IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_from.amount >= 0 THEN RAISE EXCEPTION 'A transação de origem deve ser um débito'; END IF;
  IF v_to.amount <= 0 THEN RAISE EXCEPTION 'A transação de destino deve ser um crédito'; END IF;
  IF v_from.bank_account_id = v_to.bank_account_id THEN RAISE EXCEPTION 'As contas devem ser diferentes'; END IF;
  IF abs(v_from.amount) <> v_to.amount THEN RAISE EXCEPTION 'Os valores devem ser iguais (% vs %)', abs(v_from.amount), v_to.amount; END IF;
  IF v_from.reconciled_at IS NOT NULL OR v_to.reconciled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Uma das transações já está conciliada';
  END IF;

  INSERT INTO public.bank_transfers (
    from_account_id, to_account_id, amount, transferred_at,
    description, from_transaction_id, to_transaction_id, created_by
  ) VALUES (
    v_from.bank_account_id, v_to.bank_account_id, v_to.amount, v_from.posted_at,
    _description, _from_tx_id, _to_tx_id, v_uid
  ) RETURNING id INTO v_transfer_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id IN (_from_tx_id, _to_tx_id);

  RETURN v_transfer_id;
END;
$$;

-- 9) Índice trgm para acelerar a busca por similaridade
CREATE INDEX IF NOT EXISTS idx_payable_desc_trgm
  ON public.accounts_payable USING GIN ((coalesce(description,'') || ' ' || coalesce(supplier_name,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_receivable_desc_trgm
  ON public.accounts_receivable USING GIN ((coalesce(description,'') || ' ' || coalesce(payer_name,'')) gin_trgm_ops);