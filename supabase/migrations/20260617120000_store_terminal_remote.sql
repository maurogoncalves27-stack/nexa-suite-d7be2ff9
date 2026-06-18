-- Terminais de loja (totem / PDV) — monitoramento e RustDesk ID
CREATE TABLE IF NOT EXISTS public.store_terminal_remote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  terminal_kind TEXT NOT NULL CHECK (terminal_kind IN ('totem', 'pdv')),
  machine_name TEXT NOT NULL,
  rustdesk_id TEXT,
  app_version TEXT,
  screen_spec TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_terminal_remote_unique UNIQUE (store_id, terminal_kind, machine_name)
);

CREATE INDEX IF NOT EXISTS idx_store_terminal_remote_store ON public.store_terminal_remote(store_id);
CREATE INDEX IF NOT EXISTS idx_store_terminal_remote_seen ON public.store_terminal_remote(last_seen_at DESC);

CREATE TRIGGER trg_store_terminal_remote_updated
BEFORE UPDATE ON public.store_terminal_remote
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.store_terminal_remote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff lê terminais remotos"
ON public.store_terminal_remote FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff grava terminais remotos"
ON public.store_terminal_remote FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff atualiza terminais remotos"
ON public.store_terminal_remote FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
