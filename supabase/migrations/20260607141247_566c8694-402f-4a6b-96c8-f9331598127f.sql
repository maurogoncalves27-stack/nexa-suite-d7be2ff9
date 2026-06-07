
-- 1. Canal WhatsApp para Asa Sul
INSERT INTO public.pdv_channels (store_id, code, name, is_active, sort_order)
VALUES ('fcf435c2-c382-444c-b499-4d95f07b2633', 'whatsapp', 'WhatsApp', true, 50)
ON CONFLICT (store_id, code) DO NOTHING;

-- 2. Config de vendas no WhatsApp Cliente
ALTER TABLE public.whatsapp_customer_config
  ADD COLUMN IF NOT EXISTS sales_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_off_message text;

-- 3. Carrinho de sessão
CREATE TABLE IF NOT EXISTS public.pdv_whatsapp_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name text,
  delivery_address jsonb,
  payment_method text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  pdv_order_id uuid REFERENCES public.pdv_orders(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pdv_whatsapp_carts_phone_store_open_idx
  ON public.pdv_whatsapp_carts(phone, store_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS pdv_whatsapp_carts_status_idx
  ON public.pdv_whatsapp_carts(status, expires_at);

GRANT SELECT ON public.pdv_whatsapp_carts TO authenticated;
GRANT ALL ON public.pdv_whatsapp_carts TO service_role;

ALTER TABLE public.pdv_whatsapp_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdv_whatsapp_carts_staff_read" ON public.pdv_whatsapp_carts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR is_super_user(auth.uid())
  );

CREATE TRIGGER update_pdv_whatsapp_carts_updated_at
  BEFORE UPDATE ON public.pdv_whatsapp_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
