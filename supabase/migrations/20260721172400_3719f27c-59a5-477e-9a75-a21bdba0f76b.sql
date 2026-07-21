
-- Tabela de configuração da integração Yolo
CREATE TABLE public.yolo_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  base_url TEXT NOT NULL DEFAULT 'https://api-sandbox.yoloclub.com.br',
  partner_id TEXT,
  store_mapping JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "<nexa_store_id>": "<yolo_store_id>" }
  enabled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yolo_config TO authenticated;
GRANT ALL ON public.yolo_config TO service_role;

ALTER TABLE public.yolo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage yolo_config"
ON public.yolo_config FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE POLICY "Managers can view yolo_config"
ON public.yolo_config FOR SELECT
USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_yolo_config_updated_at
BEFORE UPDATE ON public.yolo_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de log/auditoria de vouchers Yolo
CREATE TABLE public.yolo_vouchers_used (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  voucher_id TEXT,
  order_id TEXT, -- id do pedido NEXA (idempotency key no redeem)
  store_id UUID REFERENCES public.stores(id),
  channel TEXT NOT NULL CHECK (channel IN ('totem','garcom','online','pdv')),
  status TEXT NOT NULL CHECK (status IN ('validated','redeemed','voided','failed')),
  benefit_snapshot JSONB, -- cópia do benefit retornado pela Yolo
  discount_applied_cents INTEGER,
  order_total_cents INTEGER,
  failure_reason TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_yolo_vouchers_used_code ON public.yolo_vouchers_used(code);
CREATE INDEX idx_yolo_vouchers_used_order ON public.yolo_vouchers_used(order_id);
CREATE INDEX idx_yolo_vouchers_used_store_status ON public.yolo_vouchers_used(store_id, status);
CREATE UNIQUE INDEX idx_yolo_vouchers_redeem_unique ON public.yolo_vouchers_used(order_id, voucher_id) WHERE status = 'redeemed';

GRANT SELECT, INSERT, UPDATE ON public.yolo_vouchers_used TO authenticated;
GRANT ALL ON public.yolo_vouchers_used TO service_role;

ALTER TABLE public.yolo_vouchers_used ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view yolo vouchers log"
ON public.yolo_vouchers_used FOR SELECT
USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE POLICY "Service role writes yolo vouchers log"
ON public.yolo_vouchers_used FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role updates yolo vouchers log"
ON public.yolo_vouchers_used FOR UPDATE
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_yolo_vouchers_used_updated_at
BEFORE UPDATE ON public.yolo_vouchers_used
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed de config inicial (desabilitado)
INSERT INTO public.yolo_config (environment, base_url, enabled, notes)
VALUES ('sandbox', 'https://api-sandbox.yoloclub.com.br', false, 'Aguardando credenciais e URL definitiva do dev da Yolo Club');
