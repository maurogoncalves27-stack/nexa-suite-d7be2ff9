-- ============================================================
-- 1) Expandir pdv_orders com campos do fluxo iFood Order
-- ============================================================
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS delivery_by text,                    -- 'IFOOD' | 'MERCHANT'
  ADD COLUMN IF NOT EXISTS pickup_code text,
  ADD COLUMN IF NOT EXISTS delivery_code text,
  ADD COLUMN IF NOT EXISTS expected_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_text text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS concluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Restringe status válidos (drop antes pra ser idempotente)
ALTER TABLE public.pdv_orders DROP CONSTRAINT IF EXISTS pdv_orders_status_check;
ALTER TABLE public.pdv_orders
  ADD CONSTRAINT pdv_orders_status_check
  CHECK (status IN ('placed','confirmed','preparing','ready','dispatched','concluded','cancelled','dispute'));

-- ============================================================
-- 2) Tabela de eventos (event sourcing leve)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pdv_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'internal',          -- 'ifood' | 'internal' | 'merchant'
  event_code text NOT NULL,                         -- ex: PLACED, CONFIRMED, CFM, ORDER_PATCHED, CANCELLED, CONCLUDED, DSP, RTP
  external_event_id text,                           -- evt_xxx do iFood (pra ack/dedup)
  previous_status text,
  new_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdv_order_events_order ON public.pdv_order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdv_order_events_store ON public.pdv_order_events(store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdv_order_events_external ON public.pdv_order_events(external_event_id) WHERE external_event_id IS NOT NULL;

ALTER TABLE public.pdv_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read pdv_order_events" ON public.pdv_order_events;
CREATE POLICY "auth read pdv_order_events" ON public.pdv_order_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth write pdv_order_events" ON public.pdv_order_events;
CREATE POLICY "auth write pdv_order_events" ON public.pdv_order_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 3) Função de transição com validação de máquina de estados
-- ============================================================
CREATE OR REPLACE FUNCTION public.pdv_advance_order_status(
  p_order_id uuid,
  p_new_status text,
  p_event_code text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'internal',
  p_external_event_id text DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_reason_text text DEFAULT NULL
) RETURNS public.pdv_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pdv_orders;
  v_allowed boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.pdv_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_order_id;
  END IF;

  -- Cancelamento e disputa podem acontecer de quase qualquer estado ativo
  IF p_new_status IN ('cancelled','dispute') THEN
    IF v_order.status IN ('concluded','cancelled') THEN
      RAISE EXCEPTION 'Pedido em status % não pode ser % ', v_order.status, p_new_status;
    END IF;
    v_allowed := true;
  ELSE
    -- Transições válidas no caminho feliz
    v_allowed := CASE
      WHEN v_order.status = 'placed'     AND p_new_status = 'confirmed'   THEN true
      WHEN v_order.status = 'confirmed'  AND p_new_status = 'preparing'   THEN true
      WHEN v_order.status = 'preparing'  AND p_new_status = 'ready'       THEN true
      WHEN v_order.status = 'ready'      AND p_new_status = 'dispatched'  THEN true
      WHEN v_order.status = 'ready'      AND p_new_status = 'concluded'   THEN true  -- takeout/balcão
      WHEN v_order.status = 'dispatched' AND p_new_status = 'concluded'   THEN true
      ELSE false
    END;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transição inválida: % -> %', v_order.status, p_new_status;
  END IF;

  -- Atualiza pedido + timestamp da etapa
  UPDATE public.pdv_orders SET
    status                    = p_new_status,
    confirmed_at              = COALESCE(confirmed_at,           CASE WHEN p_new_status = 'confirmed'   THEN v_now END),
    preparation_started_at    = COALESCE(preparation_started_at, CASE WHEN p_new_status = 'preparing'   THEN v_now END),
    ready_at                  = COALESCE(ready_at,               CASE WHEN p_new_status = 'ready'       THEN v_now END),
    dispatched_at             = COALESCE(dispatched_at,          CASE WHEN p_new_status = 'dispatched'  THEN v_now END),
    concluded_at              = COALESCE(concluded_at,           CASE WHEN p_new_status = 'concluded'   THEN v_now END),
    cancelled_at              = COALESCE(cancelled_at,           CASE WHEN p_new_status = 'cancelled'   THEN v_now END),
    cancellation_reason_code  = COALESCE(p_reason_code, cancellation_reason_code),
    cancellation_reason_text  = COALESCE(p_reason_text, cancellation_reason_text),
    closed_at                 = CASE WHEN p_new_status IN ('concluded','cancelled') THEN v_now ELSE closed_at END,
    updated_at                = v_now
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Registra evento
  INSERT INTO public.pdv_order_events (
    order_id, store_id, source, event_code, external_event_id,
    previous_status, new_status, payload, triggered_by
  ) VALUES (
    p_order_id,
    v_order.store_id,
    p_source,
    COALESCE(p_event_code, upper(p_new_status)),
    p_external_event_id,
    (SELECT status FROM public.pdv_orders WHERE id = p_order_id), -- já é o novo, ok
    p_new_status,
    p_payload,
    auth.uid()
  );

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pdv_advance_order_status(uuid, text, text, jsonb, text, text, text, text) TO authenticated;