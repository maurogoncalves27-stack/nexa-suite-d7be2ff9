
-- ============================================
-- delivery_provider_config: config por loja
-- ============================================
CREATE TABLE public.delivery_provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('lalamove', 'uber_direct', 'mock')),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1,
  service_type text NOT NULL DEFAULT 'MOTORCYCLE',
  pickup_address jsonb,
  extra_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider)
);

CREATE INDEX idx_delivery_provider_config_store ON public.delivery_provider_config(store_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_provider_config TO authenticated;
GRANT ALL ON public.delivery_provider_config TO service_role;

ALTER TABLE public.delivery_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage delivery config"
  ON public.delivery_provider_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE POLICY "Store staff read delivery config"
  ON public.delivery_provider_config FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_delivery_provider_config_updated_at
  BEFORE UPDATE ON public.delivery_provider_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- delivery_jobs: cada corrida solicitada
-- ============================================
CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.pdv_orders(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('lalamove', 'uber_direct', 'mock')),
  status text NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted', 'requested', 'assigned', 'picked_up', 'delivered', 'cancelled', 'failed', 'expired')),
  provider_quote_id text,
  provider_order_id text,
  fee_cents integer,
  eta_minutes integer,
  driver_name text,
  driver_phone text,
  tracking_url text,
  pickup_address jsonb,
  dropoff_address jsonb,
  raw_quote jsonb,
  raw_order jsonb,
  error_message text,
  quoted_at timestamp with time zone NOT NULL DEFAULT now(),
  requested_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  delivered_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_jobs_order ON public.delivery_jobs(order_id);
CREATE INDEX idx_delivery_jobs_store_status ON public.delivery_jobs(store_id, status);
CREATE INDEX idx_delivery_jobs_provider_order ON public.delivery_jobs(provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX idx_delivery_jobs_created ON public.delivery_jobs(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.delivery_jobs TO authenticated;
GRANT ALL ON public.delivery_jobs TO service_role;

ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage delivery jobs"
  ON public.delivery_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE POLICY "Staff read delivery jobs"
  ON public.delivery_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_delivery_jobs_updated_at
  BEFORE UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- delivery_job_events: log bruto dos webhooks
-- ============================================
CREATE TABLE public.delivery_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_job_events_job ON public.delivery_job_events(job_id, received_at DESC);

GRANT SELECT ON public.delivery_job_events TO authenticated;
GRANT ALL ON public.delivery_job_events TO service_role;

ALTER TABLE public.delivery_job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read delivery events"
  ON public.delivery_job_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ============================================
-- pdv_orders: campos extras pra rastreio
-- ============================================
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS delivery_provider text,
  ADD COLUMN IF NOT EXISTS delivery_tracking_url text,
  ADD COLUMN IF NOT EXISTS delivery_job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL;
