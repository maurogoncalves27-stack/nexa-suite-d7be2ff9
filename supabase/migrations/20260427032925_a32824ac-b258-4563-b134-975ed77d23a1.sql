-- 1) Colunas de conferência na corrida de produção
ALTER TABLE public.production_runs
  ADD COLUMN IF NOT EXISTS requested_quantity numeric,
  ADD COLUMN IF NOT EXISTS divergence_reason text;

-- 2) Função auxiliar: total pendente pedido pelas lojas para o produto final desta ficha
CREATE OR REPLACE FUNCTION public.pending_request_for_recipe(_recipe_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_output_product_id uuid;
  v_total numeric;
BEGIN
  SELECT output_product_id INTO v_output_product_id FROM public.recipes WHERE id = _recipe_id;
  IF v_output_product_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(
    COALESCE(fri.quantity_approved, fri.quantity_requested)
    - COALESCE(fri.quantity_delivered, 0)
  ), 0)
  INTO v_total
  FROM public.factory_request_items fri
  JOIN public.factory_requests fr ON fr.id = fri.request_id
  WHERE fri.product_id = v_output_product_id
    AND fr.status IN ('pending','approved');

  RETURN COALESCE(v_total, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pending_request_for_recipe(uuid) TO authenticated;

-- 3) Nova versão de produce_recipe com conferência (solicitado vs produzido)
CREATE OR REPLACE FUNCTION public.produce_recipe(
  _recipe_id uuid,
  _store_id uuid,
  _multiplier numeric,
  _notes text,
  _expiry_date date,
  _manufacture_date date,
  _lot_number text,
  _requested_quantity numeric,
  _divergence_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  -- delega tudo para a versão existente (estoque, lotes, custo, etc.)
  v_run_id := public.produce_recipe(
    _recipe_id, _store_id, _multiplier, _notes,
    _expiry_date, _manufacture_date, _lot_number
  );

  -- registra a conferência
  UPDATE public.production_runs
     SET requested_quantity = _requested_quantity,
         divergence_reason  = NULLIF(trim(_divergence_reason), '')
   WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.produce_recipe(uuid, uuid, numeric, text, date, date, text, numeric, text) TO authenticated;