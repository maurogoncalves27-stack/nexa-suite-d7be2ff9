ALTER TABLE public.gas_voucher_requests
  DROP CONSTRAINT IF EXISTS gas_voucher_requests_status_check;

ALTER TABLE public.gas_voucher_requests
  ADD CONSTRAINT gas_voucher_requests_status_check
  CHECK (status IN ('requested', 'in_transit', 'received', 'cancelled'));