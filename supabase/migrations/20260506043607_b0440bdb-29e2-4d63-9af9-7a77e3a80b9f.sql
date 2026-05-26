-- Reclassificar todos os PORCIONADOS como produzidos pela fábrica (não cotáveis)
UPDATE public.inventory_products
SET product_type = 'produzido'
WHERE is_active = true
  AND category = 'PORCIONADOS'
  AND product_type = 'insumo';