ALTER TABLE public.pdv_orders
ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_cancelled_at
ON public.pdv_orders (cancelled_at DESC)
WHERE status = 'cancelled';
