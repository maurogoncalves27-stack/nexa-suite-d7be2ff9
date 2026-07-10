-- Permite gravar pendências PayGo com status pending_confirmation no Extrator/auditoria.
ALTER TABLE public.pdv_tef_transactions
  DROP CONSTRAINT IF EXISTS pdv_tef_transactions_status_check;

ALTER TABLE public.pdv_tef_transactions
  ADD CONSTRAINT pdv_tef_transactions_status_check
  CHECK (status IN (
    'pending',
    'waiting_card',
    'processing',
    'approved',
    'declined',
    'cancelled',
    'error',
    'timeout',
    'pending_confirmation'
  ));
