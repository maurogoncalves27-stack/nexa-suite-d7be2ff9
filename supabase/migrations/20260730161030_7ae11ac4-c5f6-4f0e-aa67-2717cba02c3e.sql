CREATE OR REPLACE VIEW public.giana_menu_dishes
WITH (security_invoker = true) AS
SELECT
  ('menu:' || mi.id::text) AS id,
  CASE public.giana_norm(b.name)
    WHEN 'aquela parme' THEN 'aquela-parme'
    WHEN 'aquele estrogonofe' THEN 'aquele-estrogonofe'
    WHEN 'box caipira' THEN 'box-caipira'
    ELSE 'aquela-parme'
  END AS marca,
  mi.name AS nome,
  COALESCE(NULLIF(btrim(mi.description), ''), mi.name) AS descricao,
  CASE
    WHEN public.giana_norm(mi.name) LIKE '%individual%' THEN '["individual"]'::jsonb
    WHEN public.giana_norm(mi.name) LIKE '%casal%' THEN '["casal"]'::jsonb
    WHEN public.giana_norm(mi.name) LIKE '%familia%' THEN '["familia"]'::jsonb
    ELSE '[]'::jsonb
  END AS tamanhos,
  COALESCE(mi.sort_order, 0) AS sort_order,
  b.name AS marca_nome,
  c.name AS categoria
FROM public.menu_items mi
LEFT JOIN public.menu_item_brands mib ON mib.menu_item_id = mi.id
LEFT JOIN public.brands b ON b.id = mib.brand_id
LEFT JOIN public.menu_categories c ON c.id = mi.category_id
WHERE mi.is_active;

GRANT SELECT ON public.giana_menu_dishes TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.giana_search_dish(_termo TEXT)
RETURNS TABLE (id TEXT, marca TEXT, nome TEXT, descricao TEXT, tamanhos JSONB, score REAL)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.marca, d.nome, d.descricao, d.tamanhos,
         GREATEST(
           similarity(public.giana_norm(d.nome), public.giana_norm(_termo)),
           CASE WHEN public.giana_norm(d.nome) LIKE '%' || public.giana_norm(_termo) || '%'
                  OR public.giana_norm(_termo) LIKE '%' || public.giana_norm(d.nome) || '%'
                THEN 0.9 ELSE 0 END
         )::real AS score
  FROM public.giana_menu_dishes d
  ORDER BY score DESC, d.sort_order
  LIMIT 5;
$$;
