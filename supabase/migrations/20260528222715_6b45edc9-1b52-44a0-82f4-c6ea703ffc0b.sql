ALTER TABLE public.pdv_orders
ADD COLUMN IF NOT EXISTS has_unread_chat boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_has_unread_chat
ON public.pdv_orders (has_unread_chat) WHERE has_unread_chat = true;