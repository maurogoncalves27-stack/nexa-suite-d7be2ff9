-- `MOTORCYCLE` não existe no mercado brasileiro da Lalamove: a API v3 recusa a
-- cotação com "value must be one of CAR, HATCHBACK, LALAGO, TRUCK330, UV_4H,
-- UV_FIORINO, VAN". O default herdado quebraria toda cotação no Brasil.
-- LALAGO é o serviço mais barato e o único presente em todas as cidades BR.
ALTER TABLE public.delivery_provider_config
  ALTER COLUMN service_type SET DEFAULT 'LALAGO';

UPDATE public.delivery_provider_config
  SET service_type = 'LALAGO'
  WHERE service_type = 'MOTORCYCLE';
