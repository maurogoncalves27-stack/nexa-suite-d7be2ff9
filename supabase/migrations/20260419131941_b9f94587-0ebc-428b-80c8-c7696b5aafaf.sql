
-- Coluna para marcar avisos do tipo push
ALTER TABLE public.hr_announcements
ADD COLUMN IF NOT EXISTS send_push boolean NOT NULL DEFAULT false;

-- Tabela de inscrições Web Push (uma por dispositivo/navegador por usuário)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- O próprio usuário gerencia suas inscrições
CREATE POLICY "Users manage their push subscriptions select"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage their push subscriptions insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their push subscriptions update"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage their push subscriptions delete"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Admins podem visualizar (para diagnosticar) - opcional
CREATE POLICY "Admins can view all push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_push_subs_updated ON public.push_subscriptions;
CREATE TRIGGER trg_push_subs_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
