-- Remove UAZAPI senders and columns; keep only Z-API
DELETE FROM public.whatsapp_senders WHERE provider = 'uazapi';

ALTER TABLE public.whatsapp_senders DROP CONSTRAINT IF EXISTS whatsapp_senders_provider_check;
ALTER TABLE public.whatsapp_senders DROP COLUMN IF EXISTS uazapi_base_url;
ALTER TABLE public.whatsapp_senders DROP COLUMN IF EXISTS uazapi_token;
ALTER TABLE public.whatsapp_senders ALTER COLUMN provider SET DEFAULT 'zapi';
UPDATE public.whatsapp_senders SET provider = 'zapi' WHERE provider IS DISTINCT FROM 'zapi';
ALTER TABLE public.whatsapp_senders
  ADD CONSTRAINT whatsapp_senders_provider_check CHECK (provider = 'zapi');