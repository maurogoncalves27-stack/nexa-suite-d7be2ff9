
ALTER TABLE public.whatsapp_senders
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'zapi',
  ADD COLUMN IF NOT EXISTS uazapi_base_url text,
  ADD COLUMN IF NOT EXISTS uazapi_token text,
  ALTER COLUMN zapi_instance_id DROP NOT NULL,
  ALTER COLUMN zapi_token DROP NOT NULL,
  ALTER COLUMN zapi_client_token DROP NOT NULL;

ALTER TABLE public.whatsapp_senders
  DROP CONSTRAINT IF EXISTS whatsapp_senders_provider_check;
ALTER TABLE public.whatsapp_senders
  ADD CONSTRAINT whatsapp_senders_provider_check CHECK (provider IN ('zapi','uazapi'));
