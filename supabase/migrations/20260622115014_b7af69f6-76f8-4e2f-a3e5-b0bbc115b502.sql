
CREATE TABLE public.ecommerce_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  address text,
  phone text,
  hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_open boolean NOT NULL DEFAULT true,
  accepts_pickup boolean NOT NULL DEFAULT true,
  accepts_delivery boolean NOT NULL DEFAULT false,
  min_pickup_minutes integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ecommerce_stores TO anon, authenticated;
GRANT ALL ON public.ecommerce_stores TO service_role;
ALTER TABLE public.ecommerce_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecommerce_stores public read" ON public.ecommerce_stores FOR SELECT USING (active = true);
CREATE POLICY "ecommerce_stores admin manage" ON public.ecommerce_stores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ecommerce_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  whatsapp_phone text,
  ecommerce_store_id uuid REFERENCES public.ecommerce_stores(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_document text,
  pickup_eta timestamptz,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  brand_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecom_carts_token ON public.ecommerce_carts(session_token);
CREATE INDEX idx_ecom_carts_phone ON public.ecommerce_carts(whatsapp_phone);
GRANT ALL ON public.ecommerce_carts TO service_role;
ALTER TABLE public.ecommerce_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecommerce_carts service only" ON public.ecommerce_carts FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE public.ecommerce_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.ecommerce_carts(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  brand_code text,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  notes text,
  complements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecom_cart_items_cart ON public.ecommerce_cart_items(cart_id);
GRANT ALL ON public.ecommerce_cart_items TO service_role;
ALTER TABLE public.ecommerce_cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecommerce_cart_items service only" ON public.ecommerce_cart_items FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE public.ecommerce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  session_token text,
  ecommerce_store_id uuid,
  cart_id uuid,
  order_id uuid,
  brand_code text,
  menu_item_id uuid,
  value numeric(10,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecom_events_name_date ON public.ecommerce_events(event_name, created_at DESC);
CREATE INDEX idx_ecom_events_store_date ON public.ecommerce_events(ecommerce_store_id, created_at DESC);
GRANT INSERT ON public.ecommerce_events TO anon, authenticated;
GRANT SELECT ON public.ecommerce_events TO authenticated;
GRANT ALL ON public.ecommerce_events TO service_role;
ALTER TABLE public.ecommerce_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecommerce_events public insert" ON public.ecommerce_events FOR INSERT WITH CHECK (true);
CREATE POLICY "ecommerce_events admin read" ON public.ecommerce_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS brand_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mp_preference_id text,
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS pickup_eta timestamptz;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_mp_payment ON public.pdv_orders(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_pdv_orders_mp_pref ON public.pdv_orders(mp_preference_id);

CREATE TRIGGER trg_ecom_stores_updated BEFORE UPDATE ON public.ecommerce_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ecom_carts_updated BEFORE UPDATE ON public.ecommerce_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ecommerce_stores (store_id, slug, display_name)
VALUES
  ('fcf435c2-c382-444c-b499-4d95f07b2633', 'asa-sul', 'Asa Sul'),
  ('b60e5cd6-ad59-4ac8-a309-e640641607b6', 'asa-norte', 'Asa Norte'),
  ('d9911bc0-5ab7-4264-9fe9-118062c4ba3c', 'aguas-claras', 'Águas Claras'),
  ('3eff1e46-d337-4df1-bbcf-6a6f3a920eac', 'lago-sul', 'Lago Sul')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pdv_channels (store_id, name, code, is_active)
SELECT s.id, 'Site Direto', 'site_direto', true
FROM public.stores s
WHERE s.id IN (
  'fcf435c2-c382-444c-b499-4d95f07b2633',
  'b60e5cd6-ad59-4ac8-a309-e640641607b6',
  'd9911bc0-5ab7-4264-9fe9-118062c4ba3c',
  '3eff1e46-d337-4df1-bbcf-6a6f3a920eac'
)
AND NOT EXISTS (SELECT 1 FROM public.pdv_channels c WHERE c.store_id = s.id AND c.code = 'site_direto');
