
CREATE TYPE public.supplier_offer_type AS ENUM ('launch', 'promo', 'surplus');

CREATE TABLE public.supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  offer_type public.supplier_offer_type NOT NULL DEFAULT 'promo',
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  unit TEXT,
  available_quantity NUMERIC(12,3),
  image_url TEXT,
  valid_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_offers_supplier ON public.supplier_offers(supplier_id);
CREATE INDEX idx_supplier_offers_active ON public.supplier_offers(is_active, valid_until);

ALTER TABLE public.supplier_offers ENABLE ROW LEVEL SECURITY;

-- Fornecedor gerencia próprias ofertas
CREATE POLICY "Fornecedor v\u00ea pr\u00f3prias ofertas"
ON public.supplier_offers FOR SELECT TO authenticated
USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));

CREATE POLICY "Fornecedor cria pr\u00f3prias ofertas"
ON public.supplier_offers FOR INSERT TO authenticated
WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid() AND status = 'approved'));

CREATE POLICY "Fornecedor edita pr\u00f3prias ofertas"
ON public.supplier_offers FOR UPDATE TO authenticated
USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));

CREATE POLICY "Fornecedor exclui pr\u00f3prias ofertas"
ON public.supplier_offers FOR DELETE TO authenticated
USING (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid()));

-- Equipe interna (qualquer authenticated que NÃO é supplier) vê ofertas ativas
CREATE POLICY "Equipe v\u00ea ofertas ativas"
ON public.supplier_offers FOR SELECT TO authenticated
USING (
  is_active = true
  AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE user_id = auth.uid())
);

CREATE TRIGGER update_supplier_offers_updated_at
BEFORE UPDATE ON public.supplier_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
