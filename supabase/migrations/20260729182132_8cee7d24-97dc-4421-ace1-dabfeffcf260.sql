CREATE TABLE public.yolo_store_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  yolo_branch_id TEXT,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yolo_store_tokens TO authenticated;
GRANT ALL ON public.yolo_store_tokens TO service_role;

ALTER TABLE public.yolo_store_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage yolo store tokens"
ON public.yolo_store_tokens FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_yolo_store_tokens_updated_at
BEFORE UPDATE ON public.yolo_store_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.yolo_config
  ADD COLUMN IF NOT EXISTS validate_path TEXT NOT NULL DEFAULT '/vouchers/validate',
  ADD COLUMN IF NOT EXISTS confirm_path TEXT NOT NULL DEFAULT '/vouchers/confirm',
  ADD COLUMN IF NOT EXISTS code_header_name TEXT NOT NULL DEFAULT 'x-yolo-code';