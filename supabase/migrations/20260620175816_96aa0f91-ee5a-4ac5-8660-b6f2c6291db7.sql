-- Reset: schema anterior tinha colunas diferentes
DROP TABLE IF EXISTS public.parme_reservations CASCADE;
DROP TABLE IF EXISTS public.parme_tickets CASCADE;
DROP TABLE IF EXISTS public.parme_conversations CASCADE;
DROP TABLE IF EXISTS public.parme_events CASCADE;

-- ============================================================
-- parme_reservations
-- ============================================================
CREATE TABLE public.parme_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id uuid NOT NULL UNIQUE,
  name text,
  phone text,
  email text,
  reservation_date date,
  reservation_time time,
  party_size integer,
  notes text,
  status text,
  created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parme_reservations_phone ON public.parme_reservations(phone);
CREATE INDEX idx_parme_reservations_date ON public.parme_reservations(reservation_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parme_reservations TO authenticated;
GRANT ALL ON public.parme_reservations TO service_role;

ALTER TABLE public.parme_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem reservas Parmê"
  ON public.parme_reservations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ============================================================
-- parme_tickets
-- ============================================================
CREATE TABLE public.parme_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id uuid NOT NULL UNIQUE,
  description text,
  order_number text,
  contact text,
  status text,
  created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parme_tickets_contact ON public.parme_tickets(contact);
CREATE INDEX idx_parme_tickets_status ON public.parme_tickets(status);
CREATE INDEX idx_parme_tickets_created ON public.parme_tickets(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parme_tickets TO authenticated;
GRANT ALL ON public.parme_tickets TO service_role;

ALTER TABLE public.parme_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem tickets Parmê"
  ON public.parme_tickets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ============================================================
-- parme_conversations
-- ============================================================
CREATE TABLE public.parme_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id uuid NOT NULL UNIQUE,
  session_id text,
  message_count integer,
  last_message_at timestamptz,
  extracted jsonb,
  extracted_at timestamptz,
  client_meta jsonb,
  created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parme_conversations_session ON public.parme_conversations(session_id);
CREATE INDEX idx_parme_conversations_extracted ON public.parme_conversations(extracted_at DESC);
CREATE INDEX idx_parme_conversations_marca ON public.parme_conversations((extracted->>'marca'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parme_conversations TO authenticated;
GRANT ALL ON public.parme_conversations TO service_role;

ALTER TABLE public.parme_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem conversas Parmê"
  ON public.parme_conversations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ============================================================
-- parme_events (log/idempotência)
-- ============================================================
CREATE TABLE public.parme_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_type text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parme_events_type ON public.parme_events(event_type);
CREATE INDEX idx_parme_events_received ON public.parme_events(received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parme_events TO authenticated;
GRANT ALL ON public.parme_events TO service_role;

ALTER TABLE public.parme_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem eventos Parmê"
  ON public.parme_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));