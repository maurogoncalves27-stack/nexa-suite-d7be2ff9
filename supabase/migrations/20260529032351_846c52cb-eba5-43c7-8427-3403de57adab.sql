CREATE TABLE public.pdv_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  number int NOT NULL,
  label text,
  seats int NOT NULL DEFAULT 4,
  area text DEFAULT 'salao',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_tables TO authenticated;
GRANT ALL ON public.pdv_tables TO service_role;
ALTER TABLE public.pdv_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_tables" ON public.pdv_tables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers_manage_tables" ON public.pdv_tables
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_user(auth.uid()));

CREATE TABLE public.pdv_table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.pdv_tables(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  waiter_id uuid REFERENCES auth.users(id),
  guests int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  order_id uuid REFERENCES public.pdv_orders(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_pdv_table_sessions_open_unique
  ON public.pdv_table_sessions (table_id)
  WHERE status IN ('open','bill_requested');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_table_sessions TO authenticated;
GRANT ALL ON public.pdv_table_sessions TO service_role;
ALTER TABLE public.pdv_table_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_sessions" ON public.pdv_table_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "waiter_write_sessions" ON public.pdv_table_sessions
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'waiter')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'admin')
    OR is_super_user(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'waiter')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'admin')
    OR is_super_user(auth.uid())
  );

CREATE TABLE public.pdv_table_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.pdv_table_sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  delivered_at timestamptz,
  notes text,
  UNIQUE (session_id, round_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_table_rounds TO authenticated;
GRANT ALL ON public.pdv_table_rounds TO service_role;
ALTER TABLE public.pdv_table_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_rounds" ON public.pdv_table_rounds
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "waiter_write_rounds" ON public.pdv_table_rounds
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'waiter')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'admin')
    OR is_super_user(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'waiter')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'admin')
    OR is_super_user(auth.uid())
  );

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.pdv_table_rounds(id) ON DELETE SET NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pdv_table_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pdv_table_rounds;

CREATE TRIGGER trg_pdv_table_sessions_updated
  BEFORE UPDATE ON public.pdv_table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();