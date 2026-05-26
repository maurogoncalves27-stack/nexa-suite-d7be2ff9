
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('google','ifood','falae','outro')),
  external_id text,
  external_url text,
  rating int CHECK (rating BETWEEN 1 AND 5),
  title text,
  comment text,
  customer_name text,
  customer_contact text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','respondido','ignorado')),
  published_at timestamptz,
  ai_suggestion text,
  reply_text text,
  replied_by uuid,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_reviews_status ON public.customer_reviews(status);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_source ON public.customer_reviews(source);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_store ON public.customer_reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_brand ON public.customer_reviews(brand_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_published ON public.customer_reviews(published_at DESC);

CREATE TRIGGER trg_customer_reviews_updated
BEFORE UPDATE ON public.customer_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe lê avaliações"
ON public.customer_reviews FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Equipe insere avaliações"
ON public.customer_reviews FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Falaê público pode inserir"
ON public.customer_reviews FOR INSERT
TO anon
WITH CHECK (source = 'falae');

CREATE POLICY "Equipe atualiza avaliações"
ON public.customer_reviews FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
