-- Tabela para rastrear eventos do iFood que falharam ao processar (retry)
CREATE TABLE IF NOT EXISTS public.pdv_ifood_failed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT NOT NULL,
  event_code TEXT,
  order_id_external TEXT,
  merchant_id TEXT,
  payload JSONB NOT NULL,
  error TEXT,
  attempts INT NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'poll',
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdv_ifood_failed_events_extid
  ON public.pdv_ifood_failed_events(external_event_id);

CREATE INDEX IF NOT EXISTS idx_pdv_ifood_failed_events_unresolved
  ON public.pdv_ifood_failed_events(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE public.pdv_ifood_failed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super users can view failed events"
  ON public.pdv_ifood_failed_events FOR SELECT
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pdv_ifood_failed_events_updated
  BEFORE UPDATE ON public.pdv_ifood_failed_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log bruto de webhooks recebidos do iFood (auditoria)
CREATE TABLE IF NOT EXISTS public.pdv_ifood_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_valid BOOLEAN,
  event_count INT,
  payload JSONB,
  processed_count INT,
  error TEXT
);

ALTER TABLE public.pdv_ifood_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super users can view webhook log"
  ON public.pdv_ifood_webhook_log FOR SELECT
  USING (public.is_super_user(auth.uid()) OR public.has_role(auth.uid(), 'admin'));