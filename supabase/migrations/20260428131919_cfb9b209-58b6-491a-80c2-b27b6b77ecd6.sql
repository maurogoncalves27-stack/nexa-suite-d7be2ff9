-- 1) Add brand_id to stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_brand_id ON public.stores(brand_id);

-- Helper: simple accent fold for the few letters we care about (Ê->E, Â->A, Ã->A, etc.)
-- Done inline via translate() to avoid depending on unaccent extension.

-- 2) Backfill brand_id for virtual stores: name matches brand name (case + accent insensitive)
UPDATE public.stores s
SET brand_id = b.id
FROM public.brands b
WHERE s.is_virtual = true
  AND s.brand_id IS NULL
  AND upper(translate(s.name, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                              'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'))
      = upper(translate(b.name, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'));

-- 3) Backfill brand_id for real stores using free-text `brand` column
UPDATE public.stores s
SET brand_id = b.id
FROM public.brands b
WHERE s.is_virtual = false
  AND s.brand_id IS NULL
  AND s.brand IS NOT NULL
  AND upper(translate(s.brand, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                               'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'))
      = upper(translate(b.name, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'));

-- 4) Seed inventory_stock = 10 for every product across the 6 real (non-virtual) active stores
INSERT INTO public.inventory_stock (store_id, product_id, quantity)
SELECT st.id, p.id, 10
FROM public.stores st
CROSS JOIN public.inventory_products p
WHERE st.is_virtual = false
  AND st.is_active = true
ON CONFLICT (store_id, product_id) DO UPDATE
SET quantity = 10,
    updated_at = now();