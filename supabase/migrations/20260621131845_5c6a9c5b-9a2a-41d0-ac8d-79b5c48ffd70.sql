
CREATE TABLE public.user_useful_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_useful_links TO authenticated;
GRANT ALL ON public.user_useful_links TO service_role;

ALTER TABLE public.user_useful_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own links"
  ON public.user_useful_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can view shared links"
  ON public.user_useful_links
  FOR SELECT
  USING (is_shared = true);

CREATE TRIGGER trg_user_useful_links_updated_at
  BEFORE UPDATE ON public.user_useful_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_useful_links_user ON public.user_useful_links(user_id, sort_order);
