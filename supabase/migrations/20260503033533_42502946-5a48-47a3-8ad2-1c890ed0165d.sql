CREATE TABLE public.pdv_printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('usb','network')),
  host TEXT,
  port INTEGER DEFAULT 9100,
  usb_device_name TEXT,
  printer_model TEXT NOT NULL DEFAULT 'bematech_mp4200',
  print_role TEXT NOT NULL DEFAULT 'both' CHECK (print_role IN ('customer','kitchen','both')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_printers_store ON public.pdv_printers(store_id) WHERE is_active = true;

ALTER TABLE public.pdv_printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can view printers"
  ON public.pdv_printers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can insert printers"
  ON public.pdv_printers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can update printers"
  ON public.pdv_printers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins/managers can delete printers"
  ON public.pdv_printers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE TRIGGER pdv_printers_updated_at
  BEFORE UPDATE ON public.pdv_printers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();