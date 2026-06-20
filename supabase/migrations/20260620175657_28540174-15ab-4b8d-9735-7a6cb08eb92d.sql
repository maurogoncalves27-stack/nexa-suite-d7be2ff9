-- ============================================================
-- Parmê CRM Integration
-- ============================================================

-- Helper: reuse existing has_role + is_super_user
-- (already exist in this project)

-- ============================================================
-- 1) parme_events: webhook log (idempotent)
-- ============================================================
CREATE TABLE public.parme_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  process_error text
);

CREATE INDEX idx_parme_events_type ON public.parme_events(event_type);
CREATE INDEX idx_parme_events_received_at ON public.parme_events(received_at DESC);

GRANT SELECT ON public.parme_events TO authenticated;
GRANT ALL ON public.parme_events TO service_role;

ALTER TABLE public.parme_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem eventos Parmê"
  ON public.parme_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_user(auth.uid())
  );

-- ============================================================
-- 2) parme_reservations
-- ============================================================
CREATE TABLE public.parme_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id text NOT NULL UNIQUE,
  brand text,
  customer_name text,
  customer_phone text,
  customer_email text,
  party_size integer,
  reservation_at timestamptz,
  status text,
  notes text,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parme_reservations_brand ON public.parme_reservations(brand);
CREATE INDEX idx_parme_reservations_phone ON public.parme_reservations(customer_phone);
CREATE INDEX idx_parme_reservations_date ON public.parme_reservations(reservation_at DESC);

GRANT SELECT ON public.parme_reservations TO authenticated;
GRANT ALL ON public.parme_reservations TO service_role;

ALTER TABLE public.parme_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem reservas Parmê"
  ON public.parme_reservations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_user(auth.uid())
  );

-- ============================================================
-- 3) parme_tickets
-- ============================================================
CREATE TABLE public.parme_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id text NOT NULL UNIQUE,
  brand text,
  customer_name text,
  customer_phone text,
  customer_email text,
  subject text,
  description text,
  status text,
  priority text,
  channel text,
  opened_at timestamptz,
  closed_at timestamptz,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parme_tickets_brand ON public.parme_tickets(brand);
CREATE INDEX idx_parme_tickets_phone ON public.parme_tickets(customer_phone);
CREATE INDEX idx_parme_tickets_opened ON public.parme_tickets(opened_at DESC);
CREATE INDEX idx_parme_tickets_status ON public.parme_tickets(status);

GRANT SELECT ON public.parme_tickets TO authenticated;
GRANT ALL ON public.parme_tickets TO service_role;

ALTER TABLE public.parme_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem tickets Parmê"
  ON public.parme_tickets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_user(auth.uid())
  );

-- ============================================================
-- 4) parme_conversations
-- ============================================================
CREATE TABLE public.parme_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parme_id text NOT NULL UNIQUE,
  brand text,
  customer_name text,
  customer_phone text,
  channel text,
  summary text,
  sentiment text,
  intent text,
  message_count integer,
  started_at timestamptz,
  extracted_at timestamptz,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parme_conversations_brand ON public.parme_conversations(brand);
CREATE INDEX idx_parme_conversations_phone ON public.parme_conversations(customer_phone);
CREATE INDEX idx_parme_conversations_extracted ON public.parme_conversations(extracted_at DESC);

GRANT SELECT ON public.parme_conversations TO authenticated;
GRANT ALL ON public.parme_conversations TO service_role;

ALTER TABLE public.parme_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem conversas Parmê"
  ON public.parme_conversations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_user(auth.uid())
  );

-- ============================================================
-- updated_at trigger (reusa função já existente do projeto)
-- ============================================================
CREATE TRIGGER trg_parme_reservations_updated_at
  BEFORE UPDATE ON public.parme_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_parme_tickets_updated_at
  BEFORE UPDATE ON public.parme_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_parme_conversations_updated_at
  BEFORE UPDATE ON public.parme_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();