-- Avaliação da entrega pelo cliente (último passo do fluxo do pedido pelo site).
-- Gravada pela edge function ecommerce-delivery-rating, que valida um token
-- derivado do id do pedido — o cliente avalia sem precisar de login.
CREATE TABLE public.delivery_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  provider text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX idx_delivery_ratings_store_date ON public.delivery_ratings(store_id, created_at DESC);
CREATE INDEX idx_delivery_ratings_job ON public.delivery_ratings(job_id);

GRANT SELECT ON public.delivery_ratings TO authenticated;
GRANT ALL ON public.delivery_ratings TO service_role;

ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;

-- Escrita só pela edge function (service_role, que ignora RLS).
CREATE POLICY "Staff read delivery ratings"
  ON public.delivery_ratings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_user(auth.uid())
  );

CREATE TRIGGER trg_delivery_ratings_updated_at
  BEFORE UPDATE ON public.delivery_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
