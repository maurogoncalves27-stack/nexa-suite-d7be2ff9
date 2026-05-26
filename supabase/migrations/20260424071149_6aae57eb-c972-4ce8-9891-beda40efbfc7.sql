-- Função para distribuir produto pronto da fábrica para todas as lojas vinculadas com necessidade.
-- Cria UMA transferência por loja destino, sempre originada na fábrica.
-- Retorna a lista de transferências criadas.
CREATE OR REPLACE FUNCTION public.distribute_factory_production(
  _output_product_id uuid,
  _notes text DEFAULT NULL
)
RETURNS TABLE(transfer_id uuid, destination_store_id uuid, destination_name text, quantity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_factory_id UUID;
  v_factory_stock NUMERIC(14,4);
  v_remaining NUMERIC(14,4);
  v_store RECORD;
  v_need NUMERIC(14,4);
  v_send NUMERIC(14,4);
  v_transfer UUID;
  v_items JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;

  -- Identifica fábrica
  SELECT id INTO v_factory_id
  FROM public.stores
  WHERE name ~* 'f[áa]brica'
  ORDER BY created_at
  LIMIT 1;

  IF v_factory_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma loja-fábrica encontrada';
  END IF;

  IF NOT public.user_can_access_store(v_uid, v_factory_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja fábrica';
  END IF;

  -- Saldo atual do produto pronto na fábrica
  SELECT COALESCE(quantity, 0) INTO v_factory_stock
  FROM public.inventory_stock
  WHERE store_id = v_factory_id AND product_id = _output_product_id;
  v_factory_stock := COALESCE(v_factory_stock, 0);
  v_remaining := v_factory_stock;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Sem estoque do produto na fábrica para distribuir';
  END IF;

  -- Itera lojas vinculadas com necessidade (target - saldo > 0), priorizando maior necessidade
  FOR v_store IN
    SELECT psl.store_id,
           s.name AS store_name,
           GREATEST(COALESCE(istk.target_qty,0) - COALESCE(istk.quantity,0), 0) AS need
    FROM public.product_store_links psl
    JOIN public.stores s ON s.id = psl.store_id
    LEFT JOIN public.inventory_stock istk
      ON istk.store_id = psl.store_id AND istk.product_id = psl.product_id
    WHERE psl.product_id = _output_product_id
      AND s.id <> v_factory_id
    ORDER BY need DESC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_need := v_store.need;
    IF v_need <= 0 THEN CONTINUE; END IF;

    -- Envia o que precisa, limitado pelo estoque restante
    v_send := LEAST(v_need, v_remaining);
    IF v_send <= 0 THEN CONTINUE; END IF;

    v_items := jsonb_build_array(
      jsonb_build_object('product_id', _output_product_id, 'quantity', v_send)
    );

    v_transfer := public.create_inventory_transfer(
      v_factory_id,
      v_store.store_id,
      v_items,
      NULL,
      COALESCE(_notes, 'Distribuição automática de produção')
    );

    v_remaining := v_remaining - v_send;

    transfer_id := v_transfer;
    destination_store_id := v_store.store_id;
    destination_name := v_store.store_name;
    quantity := v_send;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.distribute_factory_production(uuid, text) TO authenticated;