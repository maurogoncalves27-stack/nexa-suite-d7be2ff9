ALTER TABLE public.whatsapp_customer_messages
ADD COLUMN IF NOT EXISTS ai_processing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.whatsapp_customer_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wcm_unique_zapi_user_message
ON public.whatsapp_customer_messages (zapi_message_id)
WHERE role = 'user' AND zapi_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wcm_pending_user_processing
ON public.whatsapp_customer_messages (conversation_id, created_at DESC)
WHERE role = 'user' AND ai_processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wcm_reply_to_message
ON public.whatsapp_customer_messages (reply_to_message_id)
WHERE reply_to_message_id IS NOT NULL;