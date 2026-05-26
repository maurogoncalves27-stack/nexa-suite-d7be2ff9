-- Tabela de notificações in-app
CREATE TABLE public.user_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  url TEXT,
  tag TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_notifications_user_unread 
  ON public.user_notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Usuário vê suas próprias
CREATE POLICY "Users view their own notifications"
ON public.user_notifications FOR SELECT
USING (auth.uid() = user_id);

-- Usuário marca como lida (update) suas próprias
CREATE POLICY "Users update their own notifications"
ON public.user_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Usuário pode deletar as próprias
CREATE POLICY "Users delete their own notifications"
ON public.user_notifications FOR DELETE
USING (auth.uid() = user_id);

-- Admins/gestores podem ver todas (usa has_role se existir)
CREATE POLICY "Admins view all notifications"
ON public.user_notifications FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Inserts feitos via service role (edge function notify-user) — sem policy de insert para usuários comuns
-- mas permitimos que usuários autenticados criem notificações para si mesmos (caso necessário em alguma trigger client-side)
CREATE POLICY "Users create their own notifications"
ON public.user_notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;