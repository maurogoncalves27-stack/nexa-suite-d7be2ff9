ALTER TABLE public.pdv_tef_config DROP CONSTRAINT IF EXISTS pdv_tef_config_provider_check;
ALTER TABLE public.pdv_tef_config ADD CONSTRAINT pdv_tef_config_provider_check
  CHECK (provider = ANY (ARRAY['mock','sitef','acbr','paygo','payer']));

INSERT INTO public.pdv_tef_config (store_id, provider, agent_url, environment, is_active, notes)
VALUES
  ('b60e5cd6-ad59-4ac8-a309-e640641607b6', 'payer', 'https://127.0.0.1:3031', 'producao', true, 'Totem Payer Checkout local (:6060) via agente Nexa Totem'),
  ('d9911bc0-5ab7-4264-9fe9-118062c4ba3c', 'payer', 'https://127.0.0.1:3031', 'producao', true, 'Totem Payer Checkout local (:6060) via agente Nexa Totem'),
  ('3eff1e46-d337-4df1-bbcf-6a6f3a920eac', 'payer', 'https://127.0.0.1:3031', 'producao', true, 'Totem Payer Checkout local (:6060) via agente Nexa Totem')
ON CONFLICT DO NOTHING;