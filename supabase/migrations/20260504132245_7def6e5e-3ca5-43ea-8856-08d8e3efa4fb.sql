ALTER TABLE public.pdv_printers DROP CONSTRAINT IF EXISTS pdv_printers_print_role_check;
ALTER TABLE public.pdv_printers ADD CONSTRAINT pdv_printers_print_role_check
  CHECK (print_role = ANY (ARRAY['customer'::text, 'kitchen'::text, 'both'::text, 'totem'::text]));