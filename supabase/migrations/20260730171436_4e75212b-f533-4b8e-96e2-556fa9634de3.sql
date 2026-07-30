CREATE TABLE public.review_manual_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('ifood','google')),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  avg numeric(3,2) NOT NULL DEFAULT 0,
  count integer NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, store_id, brand_id, week_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_manual_ratings TO authenticated;
GRANT ALL ON public.review_manual_ratings TO service_role;

ALTER TABLE public.review_manual_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem notas manuais"
ON public.review_manual_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/gestor gerencia notas manuais"
ON public.review_manual_ratings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_review_manual_ratings_updated_at
BEFORE UPDATE ON public.review_manual_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_review_manual_ratings_week ON public.review_manual_ratings (source, week_key);