CREATE TABLE IF NOT EXISTS public.network_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  webhook_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  wan_primary_label TEXT NOT NULL DEFAULT 'Fibra',
  wan_secondary_label TEXT NOT NULL DEFAULT '4G',
  heartbeat_interval_seconds INT NOT NULL DEFAULT 120,
  heartbeat_tolerance_seconds INT NOT NULL DEFAULT 360,
  flap_debounce_seconds INT NOT NULL DEFAULT 60,
  current_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (current_status IN ('unknown','online_primary','online_secondary','offline')),
  last_heartbeat_at TIMESTAMPTZ,
  last_public_ip TEXT,
  last_event_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_devices TO authenticated;
GRANT ALL ON public.network_devices TO service_role;

ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can view network devices"
  ON public.network_devices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "admins can manage network devices"
  ON public.network_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX idx_network_devices_store ON public.network_devices(store_id);
CREATE INDEX idx_network_devices_heartbeat ON public.network_devices(last_heartbeat_at);


CREATE TABLE IF NOT EXISTS public.network_wan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.network_devices(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('wan_down','wan_up','failover','recovery','heartbeat_ok','heartbeat_lost','heartbeat_restored','offline','online','info')),
  wan_active TEXT,
  public_ip TEXT,
  duration_seconds INT,
  payload JSONB,
  suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  suppress_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.network_wan_events TO authenticated;
GRANT ALL ON public.network_wan_events TO service_role;

ALTER TABLE public.network_wan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can view network events"
  ON public.network_wan_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE INDEX idx_network_events_device ON public.network_wan_events(device_id, created_at DESC);
CREATE INDEX idx_network_events_store ON public.network_wan_events(store_id, created_at DESC);


CREATE TABLE IF NOT EXISTS public.network_alert_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_alert_recipients TO authenticated;
GRANT ALL ON public.network_alert_recipients TO service_role;

ALTER TABLE public.network_alert_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can view alert recipients"
  ON public.network_alert_recipients FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "admins can manage alert recipients"
  ON public.network_alert_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_network_devices_updated
  BEFORE UPDATE ON public.network_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_network_alert_recipients_updated
  BEFORE UPDATE ON public.network_alert_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
