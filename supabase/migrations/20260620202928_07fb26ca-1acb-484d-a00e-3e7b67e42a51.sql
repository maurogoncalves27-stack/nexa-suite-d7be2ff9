
CREATE TABLE public.reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size > 0 AND party_size <= 30),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.reservations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create a reservation" ON public.reservations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Staff can read reservations" ON public.reservations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Staff can update reservations" ON public.reservations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Staff can delete reservations" ON public.reservations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT,
  description TEXT NOT NULL,
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.support_tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can open a support ticket" ON public.support_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Staff can read tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Staff can update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Staff can delete tickets" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX chat_conversations_last_message_at_idx
  ON public.chat_conversations (last_message_at DESC);
CREATE POLICY "Staff can read conversations" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE public.google_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_photo_url TEXT,
  rating INT NOT NULL,
  text TEXT NOT NULL,
  relative_time TEXT,
  published_at TIMESTAMPTZ,
  language TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, author_name, text)
);
GRANT SELECT ON public.google_reviews TO anon, authenticated;
GRANT ALL ON public.google_reviews TO service_role;
ALTER TABLE public.google_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read google reviews" ON public.google_reviews
  FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX google_reviews_rating_idx ON public.google_reviews (rating DESC, fetched_at DESC);

CREATE TABLE public.parme_site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.parme_site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parme_site_settings TO authenticated;
GRANT ALL ON public.parme_site_settings TO service_role;
ALTER TABLE public.parme_site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read parme site settings" ON public.parme_site_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage parme site settings" ON public.parme_site_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

INSERT INTO public.parme_site_settings (key, value) VALUES
  ('branding', '{}'::jsonb),
  ('agent', '{}'::jsonb),
  ('google_places', jsonb_build_object(
    'units', jsonb_build_array(
      jsonb_build_object('label','Águas Claras','place_id',''),
      jsonb_build_object('label','Asa Sul','place_id',''),
      jsonb_build_object('label','Asa Norte','place_id',''),
      jsonb_build_object('label','Lago Sul','place_id','')
    ),
    'min_rating', 4,
    'cache_hours', 24
  ))
ON CONFLICT (key) DO NOTHING;
