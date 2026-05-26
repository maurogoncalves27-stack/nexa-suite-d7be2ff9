-- Cache de tokens iFood (1 linha por ambiente)
CREATE TABLE public.pdv_ifood_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL UNIQUE CHECK (environment IN ('sandbox','production')),
  access_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'bearer',
  expires_at timestamptz NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdv_ifood_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifood_tokens_read_admin" ON public.pdv_ifood_tokens
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR is_super_user(auth.uid()));

CREATE POLICY "ifood_tokens_write_admin" ON public.pdv_ifood_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_super_user(auth.uid()));

CREATE TRIGGER trg_pdv_ifood_tokens_upd
  BEFORE UPDATE ON public.pdv_ifood_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Campos extras pra pedidos iFood
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS external_display_id text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_display ON public.pdv_orders(external_display_id) WHERE external_display_id IS NOT NULL;