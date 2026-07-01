
CREATE TABLE public.remote_access_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  machine_type text NOT NULL DEFAULT 'pdv',
  tool text NOT NULL DEFAULT 'rustdesk',
  remote_id text NOT NULL,
  password text,
  hostname text,
  notes text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_access_machines TO authenticated;
GRANT ALL ON public.remote_access_machines TO service_role;

ALTER TABLE public.remote_access_machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/manager view remote_access_machines"
  ON public.remote_access_machines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "admin/manager manage remote_access_machines"
  ON public.remote_access_machines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_remote_access_machines_updated_at
  BEFORE UPDATE ON public.remote_access_machines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_remote_access_machines_store ON public.remote_access_machines(store_id);

CREATE TABLE public.remote_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.remote_access_machines(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.remote_access_audit TO authenticated;
GRANT ALL ON public.remote_access_audit TO service_role;

ALTER TABLE public.remote_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/manager view remote_access_audit"
  ON public.remote_access_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "auth insert own remote_access_audit"
  ON public.remote_access_audit FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
