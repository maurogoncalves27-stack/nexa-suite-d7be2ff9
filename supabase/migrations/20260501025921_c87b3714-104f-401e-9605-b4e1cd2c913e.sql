CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction_batch(
  _transaction_id uuid,
  _payable_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _receivable_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tx RECORD;
  v_tx_abs numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_pay_count int := 0;
  v_rec_count int := 0;
  v_is_credit boolean;
  v_total_items int;
  v_diff numeric(14,2);
  TOL constant numeric := 0.02;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para conciliar';
  END IF;

  v_total_items := COALESCE(array_length(_payable_ids, 1), 0) + COALESCE(array_length(_receivable_ids, 1), 0);
  IF v_total_items = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma conta para conciliar';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já conciliada'; END IF;

  v_is_credit := v_tx.amount > 0;
  v_tx_abs := ABS(v_tx.amount);

  -- Crédito (entrada) só pode receber recebíveis; débito (saída) só pode pagar contas a pagar.
  IF v_is_credit AND COALESCE(array_length(_payable_ids, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Movimentação de crédito só pode conciliar contas a receber';
  END IF;
  IF NOT v_is_credit AND COALESCE(array_length(_receivable_ids, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Movimentação de débito só pode conciliar contas a pagar';
  END IF;

  -- Soma e valida payables
  IF COALESCE(array_length(_payable_ids, 1), 0) > 0 THEN
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
      INTO v_sum, v_pay_count
      FROM public.accounts_payable
     WHERE id = ANY(_payable_ids);
    IF v_pay_count <> array_length(_payable_ids, 1) THEN
      RAISE EXCEPTION 'Uma ou mais contas a pagar não foram encontradas';
    END IF;
    PERFORM 1 FROM public.accounts_payable
      WHERE id = ANY(_payable_ids) AND status = 'paid' LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Uma das contas selecionadas já está paga';
    END IF;
  END IF;

  -- Soma e valida receivables
  IF COALESCE(array_length(_receivable_ids, 1), 0) > 0 THEN
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
      INTO v_sum, v_rec_count
      FROM public.accounts_receivable
     WHERE id = ANY(_receivable_ids);
    IF v_rec_count <> array_length(_receivable_ids, 1) THEN
      RAISE EXCEPTION 'Uma ou mais contas a receber não foram encontradas';
    END IF;
    PERFORM 1 FROM public.accounts_receivable
      WHERE id = ANY(_receivable_ids) AND status = 'received' LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Uma das contas selecionadas já foi recebida';
    END IF;
  END IF;

  v_diff := ABS(v_sum - v_tx_abs);
  IF v_diff > TOL THEN
    RAISE EXCEPTION 'Soma dos itens (R$ %) difere do valor da transação (R$ %). Diferença: R$ %',
      v_sum, v_tx_abs, v_diff;
  END IF;

  -- Marca transação como conciliada
  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  -- Quita payables
  IF COALESCE(array_length(_payable_ids, 1), 0) > 0 THEN
    UPDATE public.accounts_payable
       SET status = 'paid',
           paid_at = v_tx.posted_at,
           paid_by = v_uid,
           bank_transaction_id = _transaction_id,
           bank_account_id = v_tx.bank_account_id,
           updated_at = now()
     WHERE id = ANY(_payable_ids);
  END IF;

  -- Quita receivables
  IF COALESCE(array_length(_receivable_ids, 1), 0) > 0 THEN
    UPDATE public.accounts_receivable
       SET status = 'received',
           received_at = v_tx.posted_at,
           received_by = v_uid,
           bank_transaction_id = _transaction_id,
           bank_account_id = v_tx.bank_account_id,
           updated_at = now()
     WHERE id = ANY(_receivable_ids);
  END IF;

  RETURN jsonb_build_object(
    'reconciled', true,
    'transaction_id', _transaction_id,
    'payable_count', v_pay_count,
    'receivable_count', v_rec_count,
    'total_amount', v_sum
  );
END;
$function$;