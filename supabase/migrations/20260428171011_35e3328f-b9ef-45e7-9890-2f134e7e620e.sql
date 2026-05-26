-- Função que dispara a edge function send-push-on-notification de forma assíncrona via pg_net
CREATE OR REPLACE FUNCTION public.tg_user_notifications_dispatch_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url TEXT := 'https://xmswsrhfofwhwtykjqef.supabase.co/functions/v1/send-push-on-notification';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtc3dzcmhmb2Z3aHd0eWtqcWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTEzMDEsImV4cCI6MjA5MjAyNzMwMX0.FWYpv_jpnLo0Azs7tVi4e05xEEIFbH4vyIOlvut5vOg';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não falha o INSERT se o push der erro
  RAISE WARNING 'push dispatch failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_notifications_push ON public.user_notifications;

CREATE TRIGGER trg_user_notifications_push
AFTER INSERT ON public.user_notifications
FOR EACH ROW
EXECUTE FUNCTION public.tg_user_notifications_dispatch_push();