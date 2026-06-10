UPDATE public.pdv_tef_config
SET agent_url = regexp_replace(agent_url, '^https://', 'http://', 'i')
WHERE agent_url ILIKE 'https://%';

UPDATE public.pdv_tef_config
SET agent_url = 'http://127.0.0.1:3030'
WHERE agent_url IN ('http://127.0.0.1:3031', 'http://localhost:3031');