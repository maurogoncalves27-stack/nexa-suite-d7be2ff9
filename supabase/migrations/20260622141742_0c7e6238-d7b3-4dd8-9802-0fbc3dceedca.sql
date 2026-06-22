
ALTER TABLE public.accounts_receivable ADD COLUMN IF NOT EXISTS competence_date date;

CREATE OR REPLACE FUNCTION public.create_payable_from_bank_tx(
  _transaction_id uuid,
  _store_id uuid,
  _description text,
  _supplier_name text,
  _category_id uuid,
  _competence_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    description, supplier_name, category_id, created_by, competence_date
  ) VALUES (
    _store_id, NULL, abs(v_tx.amount), v_tx.posted_at, v_tx.posted_at, v_uid,
    v_tx.bank_account_id, _transaction_id, 'paid',
    _description, _supplier_name, _category_id, v_uid,
    COALESCE(_competence_date, v_tx.posted_at)
  ) RETURNING id INTO v_payable_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  RETURN v_payable_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_receivable_from_bank_tx(
  _transaction_id uuid,
  _store_id uuid,
  _description text,
  _payer_name text,
  _category_id uuid,
  _competence_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    created_by, received_by, competence_date
  ) VALUES (
    _store_id, _description, _payer_name, _category_id, v_tx.amount,
    v_tx.posted_at, v_tx.posted_at, 'received', v_tx.bank_account_id, _transaction_id,
    v_uid, v_uid,
    COALESCE(_competence_date, v_tx.posted_at)
  ) RETURNING id INTO v_recv_id;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  RETURN v_recv_id;
END;
$function$;
