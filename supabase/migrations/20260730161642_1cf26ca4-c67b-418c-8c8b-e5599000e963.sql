CREATE OR REPLACE VIEW public.giana_menu_dishes AS
SELECT 'menu:'::text || mi.id::text AS id,
    CASE giana_norm(b.name)
        WHEN 'aquela parme'::text THEN 'aquela-parme'::text
        WHEN 'aquele estrogonofe'::text THEN 'aquele-estrogonofe'::text
        WHEN 'box caipira'::text THEN 'box-caipira'::text
        ELSE 'aquela-parme'::text
    END AS marca,
    mi.name AS nome,
    COALESCE(NULLIF(btrim(mi.description), ''::text), mi.name) AS descricao,
    CASE
        WHEN giana_norm(mi.name) ~~ '%individual%'::text THEN '["individual"]'::jsonb
        WHEN giana_norm(mi.name) ~~ '%casal%'::text THEN '["casal"]'::jsonb
        WHEN giana_norm(mi.name) ~~ '%familia%'::text THEN '["familia"]'::jsonb
        ELSE '[]'::jsonb
    END AS tamanhos,
    COALESCE(mi.sort_order, 0) AS sort_order,
    b.name AS marca_nome,
    c.name AS categoria,
    mi.serves_people,
    mi.total_weight_g,
    mi.protein_weight_g
   FROM menu_items mi
     LEFT JOIN menu_item_brands mib ON mib.menu_item_id = mi.id
     LEFT JOIN brands b ON b.id = mib.brand_id
     LEFT JOIN menu_categories c ON c.id = mi.category_id
  WHERE mi.is_active;