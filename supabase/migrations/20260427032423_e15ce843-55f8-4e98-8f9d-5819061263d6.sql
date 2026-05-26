CREATE TABLE IF NOT EXISTS public.storage_group_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_group text NOT NULL CHECK (storage_group IN ('seco','refrigerado','congelado','embalagem','outros')),
  keyword text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_storage_group_rules_keyword ON public.storage_group_rules (lower(keyword));

ALTER TABLE public.storage_group_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read storage_group_rules" ON public.storage_group_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage storage_group_rules" ON public.storage_group_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

INSERT INTO public.storage_group_rules (storage_group, keyword, priority) VALUES
  ('refrigerado','leite',10),('refrigerado','queijo',10),('refrigerado','iogurte',10),
  ('refrigerado','manteiga',10),('refrigerado','requeijao',10),('refrigerado','requeijão',10),
  ('refrigerado','presunto',10),('refrigerado','mussarela',10),('refrigerado','muçarela',10),
  ('refrigerado','frios',10),('refrigerado','molho fresco',10),
  ('congelado','congelado',5),('congelado','congelada',5),('congelado','sorvete',5),
  ('congelado','frango',20),('congelado','carne',20),('congelado','peixe',20),
  ('congelado','hamburguer',10),('congelado','hambúrguer',10),('congelado','batata pre',10),
  ('embalagem','embalagem',5),('embalagem','sacola',5),('embalagem','saco ',10),
  ('embalagem','caixa ',20),('embalagem','copo',20),('embalagem','tampa',10),
  ('embalagem','guardanapo',10),('embalagem','marmita',10),('embalagem','bandeja',10),
  ('embalagem','papel',30),('embalagem','filme',20),('embalagem','rotulo',20),('embalagem','rótulo',20)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.classify_product_storage_group(_product_name text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_group text;
BEGIN
  SELECT storage_group INTO v_group
    FROM public.storage_group_rules
   WHERE lower(_product_name) LIKE '%' || lower(keyword) || '%'
   ORDER BY priority ASC, length(keyword) DESC
   LIMIT 1;
  RETURN COALESCE(v_group, 'seco');
END;
$$;

CREATE OR REPLACE FUNCTION public.friday_separation_checklist()
RETURNS TABLE (
  store_id uuid, store_name text, storage_group text,
  product_id uuid, product_name text, unit text,
  quantity numeric, current_stock numeric, min_qty numeric, max_qty numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_factory_id uuid;
BEGIN
  SELECT id INTO v_factory_id FROM public.stores WHERE store_type = 'fabrica' LIMIT 1;
  RETURN QUERY
  WITH transfers AS (
    SELECT t.to_store_id AS store_id, t.product_id, t.suggested_qty AS qty
      FROM public.suggest_transfers() t
     WHERE t.from_store_id = v_factory_id AND t.suggested_qty > 0
  )
  SELECT s.id, s.name, public.classify_product_storage_group(ip.name),
         ip.id, ip.name, ip.unit, tr.qty,
         COALESCE(ist.quantity, 0), COALESCE(ist.min_qty, 0), COALESCE(ist.max_qty, 0)
    FROM transfers tr
    JOIN public.stores s ON s.id = tr.store_id
    JOIN public.inventory_products ip ON ip.id = tr.product_id
    LEFT JOIN public.inventory_stock ist ON ist.store_id = tr.store_id AND ist.product_id = tr.product_id
   WHERE COALESCE(s.is_virtual, false) = false AND COALESCE(s.is_active, true) = true
   ORDER BY s.name, public.classify_product_storage_group(ip.name), ip.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_product_storage_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friday_separation_checklist() TO authenticated;