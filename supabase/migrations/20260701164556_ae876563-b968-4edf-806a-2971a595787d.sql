
-- Fase B.1: Tabela de fatores de conversão
CREATE TABLE IF NOT EXISTS public.product_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  conversion_type text NOT NULL CHECK (conversion_type IN ('compra','preparo','porcionamento')),
  from_unit text NOT NULL,
  from_qty numeric NOT NULL CHECK (from_qty > 0),
  to_unit text NOT NULL,
  to_qty numeric NOT NULL CHECK (to_qty > 0),
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, conversion_type, from_unit, to_unit)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_conversions TO authenticated;
GRANT ALL ON public.product_conversions TO service_role;

ALTER TABLE public.product_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_conversions_select_authenticated"
  ON public.product_conversions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "product_conversions_manage_staff"
  ON public.product_conversions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS idx_product_conversions_product ON public.product_conversions(product_id, conversion_type);

CREATE OR REPLACE FUNCTION public.set_updated_at_product_conversions()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_product_conversions_updated_at
BEFORE UPDATE ON public.product_conversions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_product_conversions();

-- Coluna que diz se o ingrediente é usado cru ou pronto
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS ingredient_state text
  CHECK (ingredient_state IN ('cru','pronto') OR ingredient_state IS NULL);

-- Backfill: compra (a partir de purchase_unit/pack_size)
INSERT INTO public.product_conversions (product_id, conversion_type, from_unit, from_qty, to_unit, to_qty, is_default, notes)
SELECT
  p.id,
  'compra',
  UPPER(p.purchase_unit),
  1,
  UPPER(COALESCE(p.unit, 'UN')),
  p.pack_size,
  true,
  'Backfill automático de purchase_unit/pack_size'
FROM public.inventory_products p
WHERE p.purchase_unit IS NOT NULL
  AND p.pack_size IS NOT NULL
  AND p.pack_size > 0
  AND UPPER(p.purchase_unit) <> UPPER(COALESCE(p.unit, 'UN'))
ON CONFLICT DO NOTHING;

-- Backfill: preparo (a partir de fichas de pré-preparo com 1 único insumo e output_product_id)
INSERT INTO public.product_conversions (product_id, conversion_type, from_unit, from_qty, to_unit, to_qty, is_default, notes)
SELECT DISTINCT ON (r.output_product_id)
  ri.product_id,
  'preparo',
  UPPER(pin.unit),
  ri.quantity,
  UPPER(r.yield_unit),
  r.yield_quantity,
  true,
  'Backfill da ficha ' || r.name
FROM public.recipes r
JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id AND ri.is_packaging = false
JOIN public.inventory_products pin ON pin.id = ri.product_id
WHERE r.output_product_id IS NOT NULL
  AND r.yield_quantity > 0
  AND ri.quantity > 0
  AND (
    SELECT COUNT(*) FROM public.recipe_ingredients rix
    WHERE rix.recipe_id = r.id AND rix.is_packaging = false
  ) = 1
ON CONFLICT DO NOTHING;
