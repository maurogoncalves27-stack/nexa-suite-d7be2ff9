ALTER TABLE public.inventory_invoices DROP CONSTRAINT IF EXISTS inventory_invoices_extraction_status_check;
ALTER TABLE public.inventory_invoices ADD CONSTRAINT inventory_invoices_extraction_status_check
CHECK (extraction_status = ANY (ARRAY['pending'::text,'processing'::text,'done'::text,'failed'::text,'manual'::text,'no_invoice'::text]));