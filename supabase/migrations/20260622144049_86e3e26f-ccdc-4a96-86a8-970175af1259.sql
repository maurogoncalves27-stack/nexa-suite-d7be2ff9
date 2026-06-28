
CREATE TABLE public.c6_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('payroll','weekly_bonus','internship','freelancer','rescission','training','other')),
  source_ref text,
  payment_date date NOT NULL,
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  line_count int NOT NULL CHECK (line_count >= 0),
  file_name text,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  default_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  reconciled_at timestamptz,
  reconciled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_c6_batches_open ON public.c6_payment_batches (payment_date, total) WHERE reconciled_at IS NULL;
CREATE INDEX idx_c6_batches_tx ON public.c6_payment_batches (bank_transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.c6_payment_batches TO authenticated;
GRANT ALL ON public.c6_payment_batches TO service_role;

ALTER TABLE public.c6_payment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers manage c6 batches"
  ON public.c6_payment_batches FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TABLE public.c6_payment_batch_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.c6_payment_batches(id) ON DELETE CASCADE,
  name text NOT NULL,
  pix_key text,
  pix_key_type text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  description text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  created_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_c6_batch_lines_batch ON public.c6_payment_batch_lines (batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.c6_payment_batch_lines TO authenticated;
GRANT ALL ON public.c6_payment_batch_lines TO service_role;

ALTER TABLE public.c6_payment_batch_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers manage c6 batch lines"
  ON public.c6_payment_batch_lines FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RPC: conciliar lote C6 -> cria N accounts_payable
CREATE OR REPLACE FUNCTION public.reconcile_bank_tx_with_c6_batch(
  _transaction_id uuid,
  _batch_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_batch RECORD;
  v_line RECORD;
  v_store uuid;
  v_payable_id uuid;
  v_count int := 0;
  v_desc_suffix text;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.amount >= 0 THEN RAISE EXCEPTION 'Apenas débitos podem ser conciliados com lote C6'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já está conciliada'; END IF;

  SELECT * INTO v_batch FROM public.c6_payment_batches WHERE id = _batch_id;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF v_batch.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Lote já está conciliado'; END IF;
  IF abs(v_batch.total - abs(v_tx.amount)) > 0.01 THEN
    RAISE EXCEPTION 'Total do lote (%) difere do valor da transação (%)', v_batch.total, abs(v_tx.amount);
  END IF;

  v_desc_suffix := COALESCE(' — ' || NULLIF(v_batch.source_ref,''), '');

  FOR v_line IN SELECT * FROM public.c6_payment_batch_lines WHERE batch_id = _batch_id LOOP
    v_store := COALESCE(v_line.store_id, v_batch.default_store_id);
    IF v_store IS NULL THEN
      RAISE EXCEPTION 'Linha "%" sem loja definida (e o lote não tem loja padrão)', v_line.name;
    END IF;

    INSERT INTO public.accounts_payable (
      store_id, invoice_id, amount, due_date, paid_at, paid_by,
      bank_account_id, bank_transaction_id, status,
      description, supplier_name, category_id, created_by, competence_date
    ) VALUES (
      v_store, NULL, v_line.amount,
      v_tx.posted_at, v_tx.posted_at, v_uid,
      v_tx.bank_account_id, _transaction_id, 'paid',
      v_line.name || v_desc_suffix,
      v_line.name,
      COALESCE(v_line.category_id, v_batch.category_id),
      v_uid,
      v_batch.payment_date
    ) RETURNING id INTO v_payable_id;

    UPDATE public.c6_payment_batch_lines SET created_payable_id = v_payable_id WHERE id = v_line.id;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.c6_payment_batches
     SET bank_transaction_id = _transaction_id,
         reconciled_at = now(),
         reconciled_by = v_uid
   WHERE id = _batch_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  RETURN v_count;
END;
$function$;

-- Mantém o retorno jsonb existente; adiciona handling de lotes C6
CREATE OR REPLACE FUNCTION public.unreconcile_bank_transaction(_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO v_batch_id FROM public.c6_payment_batches WHERE bank_transaction_id = _transaction_id;
  IF v_batch_id IS NOT NULL THEN
    DELETE FROM public.accounts_payable
     WHERE id IN (
       SELECT created_payable_id FROM public.c6_payment_batch_lines
        WHERE batch_id = v_batch_id AND created_payable_id IS NOT NULL
     );
    UPDATE public.c6_payment_batch_lines
       SET created_payable_id = NULL
     WHERE batch_id = v_batch_id;
    UPDATE public.c6_payment_batches
       SET bank_transaction_id = NULL,
           reconciled_at = NULL,
           reconciled_by = NULL
     WHERE id = v_batch_id;
  END IF;

  UPDATE public.accounts_payable
     SET status = 'pending',
         paid_at = NULL,
         paid_by = NULL,
         bank_transaction_id = NULL,
         bank_account_id = NULL,
         updated_at = now()
   WHERE bank_transaction_id = _transaction_id;

  UPDATE public.accounts_receivable
     SET status = 'pending',
         received_at = NULL,
         received_by = NULL,
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
