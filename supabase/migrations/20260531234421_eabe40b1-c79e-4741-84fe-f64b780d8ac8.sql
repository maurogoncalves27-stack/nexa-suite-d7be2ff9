-- Fase 1: WhatsApp Cliente (SAC) — tabelas base

CREATE TABLE public.whatsapp_customer_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  customer_name TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','idle','closed')),
  context_summary TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone, store_id)
);
CREATE INDEX idx_wcc_phone ON public.whatsapp_customer_conversations(phone);
CREATE INDEX idx_wcc_last_msg ON public.whatsapp_customer_conversations(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_customer_conversations TO authenticated;
GRANT ALL ON public.whatsapp_customer_conversations TO service_role;
ALTER TABLE public.whatsapp_customer_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todas as conversas WA cliente"
ON public.whatsapp_customer_conversations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins atualizam conversas WA cliente"
ON public.whatsapp_customer_conversations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ===== Mensagens =====
CREATE TABLE public.whatsapp_customer_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_customer_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  zapi_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wcm_conv ON public.whatsapp_customer_messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.whatsapp_customer_messages TO authenticated;
GRANT ALL ON public.whatsapp_customer_messages TO service_role;
ALTER TABLE public.whatsapp_customer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem mensagens WA cliente"
ON public.whatsapp_customer_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.is_super_user(auth.uid()));

-- ===== Reclamações =====
CREATE TABLE public.whatsapp_customer_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.whatsapp_customer_conversations(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_customer_complaints TO authenticated;
GRANT ALL ON public.whatsapp_customer_complaints TO service_role;
ALTER TABLE public.whatsapp_customer_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem reclamacoes WA cliente"
ON public.whatsapp_customer_complaints FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.is_super_user(auth.uid()));

CREATE POLICY "Admins atualizam reclamacoes WA cliente"
ON public.whatsapp_customer_complaints FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ===== Numeros bloqueados =====
CREATE TABLE public.whatsapp_blocked_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_blocked_numbers TO authenticated;
GRANT ALL ON public.whatsapp_blocked_numbers TO service_role;
ALTER TABLE public.whatsapp_blocked_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam bloqueios WA cliente"
ON public.whatsapp_blocked_numbers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ===== Config por loja =====
CREATE TABLE public.whatsapp_customer_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  system_prompt TEXT,
  opening_hours TEXT,
  off_hours_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_customer_config TO authenticated;
GRANT ALL ON public.whatsapp_customer_config TO service_role;
ALTER TABLE public.whatsapp_customer_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam config WA cliente"
ON public.whatsapp_customer_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_wcc_updated_at
BEFORE UPDATE ON public.whatsapp_customer_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_wcconfig_updated_at
BEFORE UPDATE ON public.whatsapp_customer_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();