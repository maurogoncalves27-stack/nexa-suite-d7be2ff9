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

  UPDATE public.bank_transactions
     SET reconciled_at = NULL, reconciled_by = NULL
   WHERE id = _transaction_id;

  RETURN jsonb_build_object('unreconciled', true);
END;
$function$;