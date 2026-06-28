
-- Destinatários WhatsApp para alertas de temperatura
CREATE TABLE public.nutri_temperature_alert_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_nutri_temp_recipients_store ON public.nutri_temperature_alert_recipients(store_id) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutri_temperature_alert_recipients TO authenticated;
GRANT ALL ON public.nutri_temperature_alert_recipients TO service_role;
ALTER TABLE public.nutri_temperature_alert_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view temperature recipients"
ON public.nutri_temperature_alert_recipients FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'nutritionist')
);
CREATE POLICY "Staff can manage temperature recipients"
ON public.nutri_temperature_alert_recipients FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'nutritionist')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'nutritionist')
);

-- Histórico de alertas disparados
CREATE TABLE public.nutri_temperature_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sensor_code TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('out_of_range','offline','recovered')),
  last_temperature NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  measured_at TIMESTAMPTZ,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX idx_nutri_temp_alerts_sensor_open
  ON public.nutri_temperature_alerts(sensor_code, triggered_at DESC);
CREATE INDEX idx_nutri_temp_alerts_open
  ON public.nutri_temperature_alerts(sensor_code) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutri_temperature_alerts TO authenticated;
GRANT ALL ON public.nutri_temperature_alerts TO service_role;
ALTER TABLE public.nutri_temperature_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view temperature alerts"
ON public.nutri_temperature_alerts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'nutritionist')
);
CREATE POLICY "Admins can manage temperature alerts"
ON public.nutri_temperature_alerts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER trg_nutri_temp_recipients_updated
BEFORE UPDATE ON public.nutri_temperature_alert_recipients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
