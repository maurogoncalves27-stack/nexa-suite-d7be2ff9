ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS icms_aliquota_padrao numeric;
UPDATE public.stores SET icms_aliquota_padrao = 12 WHERE regime_tributario = 3 AND icms_aliquota_padrao IS NULL;