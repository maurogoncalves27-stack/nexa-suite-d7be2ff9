-- Função para conciliar transação com conta a receber
CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction_receivable(_transaction_id uuid, _receivable_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tx RECORD;
  v_rec RECORD;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para conciliar';
  END IF;

  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = _transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Transação já conciliada'; END IF;

  SELECT * INTO v_rec FROM public.accounts_receivable WHERE id = _receivable_id;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;
  IF v_rec.status = 'received' THEN RAISE EXCEPTION 'Conta já recebida'; END IF;

  UPDATE public.bank_transactions
     SET reconciled_at = now(), reconciled_by = v_uid
   WHERE id = _transaction_id;

  UPDATE public.accounts_receivable
     SET status = 'received',
         received_at = v_tx.posted_at,
         received_by = v_uid,
         bank_transaction_id = _transaction_id,
         bank_account_id = v_tx.bank_account_id,
         updated_at = now()
   WHERE id = _receivable_id;

  RETURN jsonb_build_object('reconciled', true, 'receivable_id', _receivable_id, 'transaction_id', _transaction_id);
END;
$function$;

-- Atualiza desfazer para cobrir tanto pagar quanto receber
CREATE OR REPLACE FUNCTION public.unreconcile_bank_transaction(_transaction_id uuid)
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