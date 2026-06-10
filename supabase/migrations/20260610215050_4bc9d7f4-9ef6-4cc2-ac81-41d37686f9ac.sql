UPDATE public.pdv_tef_config
SET agent_url = 'https://127.0.0.1:3031'
WHERE agent_url ILIKE 'http%://127.0.0.1:303%'
   OR agent_url ILIKE 'http%://localhost:303%';