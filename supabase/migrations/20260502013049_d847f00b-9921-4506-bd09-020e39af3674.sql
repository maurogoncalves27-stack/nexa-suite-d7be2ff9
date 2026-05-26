-- 1) Campos iFood em stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ifood_merchant_id text,
  ADD COLUMN IF NOT EXISTS ifood_merchant_uuid uuid,
  ADD COLUMN IF NOT EXISTS ifood_environment text NOT NULL DEFAULT 'production'
    CHECK (ifood_environment IN ('sandbox', 'production'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_stores_ifood_merchant_uuid
  ON public.stores(ifood_merchant_uuid)
  WHERE ifood_merchant_uuid IS NOT NULL;

-- 2) Loja virtual de homologação (idempotente — só cria se ainda não existir)
DO $$
DECLARE
  v_parent uuid;
  v_store_id uuid;
BEGIN
  -- Já existe?
  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE ifood_merchant_uuid = '1c7f678a-d9fd-4bd1-90c8-c4220b45d76b'::uuid
  ) THEN
    RETURN;
  END IF;

  -- Pega 1ª loja física ativa como parent
  SELECT id INTO v_parent
  FROM public.stores
  WHERE is_virtual = false AND is_active = true
  ORDER BY name
  LIMIT 1;

  INSERT INTO public.stores (
    name, is_virtual, is_active, parent_store_id,
    ifood_merchant_id, ifood_merchant_uuid, ifood_environment,
    legal_name
  ) VALUES (
    'iFood Homologação',
    true,
    true,
    v_parent,
    '3771231',
    '1c7f678a-d9fd-4bd1-90c8-c4220b45d76b'::uuid,
    'sandbox',
    'Teste - 66.397.924 MAURO GONCALVES DE SOUZA'
  ) RETURNING id INTO v_store_id;

  -- Canal padrão da loja virtual
  INSERT INTO public.pdv_channels (store_id, code, name, is_active, sort_order)
  VALUES (v_store_id, 'ifood', 'iFood (homologação)', true, 0)
  ON CONFLICT DO NOTHING;
END $$;