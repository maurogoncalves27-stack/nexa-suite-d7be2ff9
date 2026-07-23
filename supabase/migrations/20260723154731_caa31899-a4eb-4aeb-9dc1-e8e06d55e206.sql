
CREATE TABLE public.smart_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tuya_device_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('door','switch','plug','exhaust','other')),
  category TEXT,
  product_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_online BOOLEAN NOT NULL DEFAULT false,
  last_state JSONB,
  last_seen_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_devices TO authenticated;
GRANT ALL ON public.smart_devices TO service_role;

ALTER TABLE public.smart_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view smart devices"
  ON public.smart_devices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can manage smart devices"
  ON public.smart_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'nutritionist'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'nutritionist'));

CREATE TRIGGER update_smart_devices_updated_at
  BEFORE UPDATE ON public.smart_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_smart_devices_store ON public.smart_devices(store_id);
CREATE INDEX idx_smart_devices_kind ON public.smart_devices(kind);
