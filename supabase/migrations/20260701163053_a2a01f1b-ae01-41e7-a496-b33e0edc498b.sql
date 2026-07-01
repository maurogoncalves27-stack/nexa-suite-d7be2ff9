
-- Fase 1: Modelo de classificação de produtos (escopo, papéis, fluxo)
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS stock_scope text NOT NULL DEFAULT 'factory_and_store',
  ADD COLUMN IF NOT EXISTS usage_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS production_flow text NOT NULL DEFAULT 'comprado';

ALTER TABLE public.inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_stock_scope_check;
ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_stock_scope_check
  CHECK (stock_scope IN ('central','factory','store','factory_and_store'));

ALTER TABLE public.inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_production_flow_check;
ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_production_flow_check
  CHECK (production_flow IN ('comprado','produzido_fabrica','misto'));

-- Backfill inicial baseado nas flags atuais
UPDATE public.inventory_products SET
  stock_scope = CASE
    WHEN factory_only = true AND is_internal = true THEN 'factory'
    WHEN factory_only = true THEN 'factory_and_store'
    WHEN product_type = 'revenda' THEN 'store'
    WHEN product_type = 'embalagem' THEN 'central'
    ELSE 'factory_and_store'
  END,
  production_flow = CASE
    WHEN product_type = 'produzido' THEN 'produzido_fabrica'
    ELSE 'comprado'
  END,
  usage_roles = CASE
    WHEN product_type = 'revenda' THEN ARRAY['venda_loja']
    WHEN product_type = 'produzido' AND factory_only = true THEN ARRAY['venda_fabrica','insumo_montagem']
    WHEN product_type = 'produzido' THEN ARRAY['venda_fabrica','insumo_montagem']
    WHEN product_type = 'insumo' AND is_internal = true THEN ARRAY['insumo_producao']
    WHEN product_type = 'insumo' THEN ARRAY['insumo_producao','insumo_montagem']
    WHEN product_type = 'embalagem' THEN ARRAY['insumo_montagem']
    WHEN product_type = 'personalizado' THEN ARRAY['insumo_montagem']
    ELSE ARRAY[]::text[]
  END
WHERE stock_scope = 'factory_and_store' AND cardinality(usage_roles) = 0;

CREATE INDEX IF NOT EXISTS idx_inventory_products_stock_scope ON public.inventory_products(stock_scope);
CREATE INDEX IF NOT EXISTS idx_inventory_products_usage_roles ON public.inventory_products USING gin(usage_roles);

-- Fase 2: Trigger para sincronizar inventory_stock com o escopo do produto
CREATE OR REPLACE FUNCTION public.sync_inventory_stock_by_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store RECORD;
  v_is_factory boolean;
  v_should_have boolean;
BEGIN
  IF NEW.infinite_stock = true THEN
    -- Produtos de estoque infinito: remove linhas zeradas
    DELETE FROM inventory_stock WHERE product_id = NEW.id AND quantity = 0;
    RETURN NEW;
  END IF;

  FOR v_store IN
    SELECT id, name FROM stores WHERE is_virtual = false
  LOOP
    v_is_factory := (v_store.name ~* 'f[áa]brica');
    v_should_have := CASE NEW.stock_scope
      WHEN 'central' THEN (v_store.name ~* 'estoque central')
      WHEN 'factory' THEN v_is_factory OR (v_store.name ~* 'estoque central')
      WHEN 'store' THEN NOT v_is_factory
      WHEN 'factory_and_store' THEN true
      ELSE true
    END;

    IF v_should_have THEN
      INSERT INTO inventory_stock (store_id, product_id, quantity)
      VALUES (v_store.id, NEW.id, 0)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    ELSE
      DELETE FROM inventory_stock
      WHERE store_id = v_store.id AND product_id = NEW.id AND quantity = 0;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_stock_scope ON public.inventory_products;
CREATE TRIGGER trg_sync_inventory_stock_scope
AFTER INSERT OR UPDATE OF stock_scope, infinite_stock, is_active
ON public.inventory_products
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_stock_by_scope();

-- Faxina inicial: remove linhas zeradas fora do escopo
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM inventory_products WHERE is_active LOOP
    UPDATE inventory_products SET stock_scope = stock_scope WHERE id = p.id;
  END LOOP;
END $$;
