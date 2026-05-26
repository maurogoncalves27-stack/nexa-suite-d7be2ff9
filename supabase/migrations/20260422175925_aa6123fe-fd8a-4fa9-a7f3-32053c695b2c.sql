-- Tabela de recolhimentos de óleo descartado
CREATE TABLE IF NOT EXISTS public.nutri_oil_disposal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  pickup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  collector_name TEXT,
  liters NUMERIC(10,2),
  amount_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_path TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutri_oil_disposal_store_date
  ON public.nutri_oil_disposal_records (store_id, pickup_date DESC);

ALTER TABLE public.nutri_oil_disposal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutri_oil_disposal_select"
  ON public.nutri_oil_disposal_records FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR store_id = public.nutri_get_user_store_id(auth.uid())
  );

CREATE POLICY "nutri_oil_disposal_insert"
  ON public.nutri_oil_disposal_records FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR store_id = public.nutri_get_user_store_id(auth.uid())
    )
  );

CREATE POLICY "nutri_oil_disposal_update"
  ON public.nutri_oil_disposal_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "nutri_oil_disposal_delete"
  ON public.nutri_oil_disposal_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_nutri_oil_disposal_updated
  BEFORE UPDATE ON public.nutri_oil_disposal_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para recibos
INSERT INTO storage.buckets (id, name, public)
VALUES ('nutri-oil-disposal-receipts', 'nutri-oil-disposal-receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "nutri_oil_disposal_receipts_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'nutri-oil-disposal-receipts');

CREATE POLICY "nutri_oil_disposal_receipts_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nutri-oil-disposal-receipts');

CREATE POLICY "nutri_oil_disposal_receipts_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'nutri-oil-disposal-receipts' AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "nutri_oil_disposal_receipts_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'nutri-oil-disposal-receipts' AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin'::public.app_role)));