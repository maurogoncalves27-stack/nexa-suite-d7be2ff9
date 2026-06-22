
CREATE OR REPLACE FUNCTION public.create_payables_from_bank_tx(
  _transaction_id uuid,
  _lines jsonb
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_line jsonb;
  v_sum numeric := 0;
  v_id UUID;
  v_competence date;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.amount >= 0 THEN RAISE EXCEPTION 'Apenas débitos podem virar contas a pagar'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já está conciliada'; END IF;

  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas inválidas';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_sum := v_sum + COALESCE((v_line->>'amount')::numeric, 0);
  END LOOP;

  IF abs(v_sum - abs(v_tx.amount)) > 0.01 THEN
    RAISE EXCEPTION 'Soma das linhas (%) difere do total da transação (%)', v_sum, abs(v_tx.amount);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF NULLIF(v_line->>'store_id','') IS NULL THEN
      RAISE EXCEPTION 'Loja obrigatória em todas as linhas';
    END IF;
    IF NULLIF(v_line->>'description','') IS NULL THEN
      RAISE EXCEPTION 'Descrição obrigatória em todas as linhas';
    END IF;
    v_competence := COALESCE(NULLIF(v_line->>'competence_date','')::date, v_tx.posted_at);

    INSERT INTO public.accounts_payable (
      store_id, invoice_id, amount, due_date, paid_at, paid_by,
      bank_account_id, bank_transaction_id, status,
      description, supplier_name, category_id, created_by, competence_date
    ) VALUES (
      (v_line->>'store_id')::uuid, NULL,
      (v_line->>'amount')::numeric,
      v_tx.posted_at, v_tx.posted_at, v_uid,
      v_tx.bank_account_id, _transaction_id, 'paid',
      v_line->>'description',
      NULLIF(v_line->>'party_name',''),
      NULLIF(v_line->>'category_id','')::uuid,
      v_uid, v_competence
    ) RETURNING id INTO v_id;
    RETURN NEXT v_id;
  END LOOP;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_receivables_from_bank_tx(
  _transaction_id uuid,
  _lines jsonb
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_line jsonb;
  v_sum numeric := 0;
  v_id UUID;
  v_competence date;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.amount <= 0 THEN RAISE EXCEPTION 'Apenas créditos podem virar contas a receber'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já está conciliada'; END IF;

  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas inválidas';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_sum := v_sum + COALESCE((v_line->>'amount')::numeric, 0);
  END LOOP;

  IF abs(v_sum - abs(v_tx.amount)) > 0.01 THEN
    RAISE EXCEPTION 'Soma das linhas (%) difere do total da transação (%)', v_sum, abs(v_tx.amount);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF NULLIF(v_line->>'store_id','') IS NULL THEN
      RAISE EXCEPTION 'Loja obrigatória em todas as linhas';
    END IF;
    IF NULLIF(v_line->>'description','') IS NULL THEN
      RAISE EXCEPTION 'Descrição obrigatória em todas as linhas';
    END IF;
    v_competence := COALESCE(NULLIF(v_line->>'competence_date','')::date, v_tx.posted_at);

    INSERT INTO public.accounts_receivable (
      store_id, description, payer_name, category_id, amount,
      due_date, received_at, status, bank_account_id, bank_transaction_id,
      created_by, received_by, competence_date
    ) VALUES (
      (v_line->>'store_id')::uuid,
      v_line->>'description',
      NULLIF(v_line->>'party_name',''),
      NULLIF(v_line->>'category_id','')::uuid,
      (v_line->>'amount')::numeric,
      v_tx.posted_at, v_tx.posted_at, 'received',
      v_tx.bank_account_id, _transaction_id,
      v_uid, v_uid, v_competence
    ) RETURNING id INTO v_id;
    RETURN NEXT v_id;
  END LOOP;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;
END;
$function$;
