-- Provider de emissão NFC-e por loja (piloto ACBr: Asa Sul)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS nfce_emission_provider TEXT NOT NULL DEFAULT 'focus_nfe'
    CHECK (nfce_emission_provider IN ('focus_nfe', 'acbr_local'));

COMMENT ON COLUMN public.stores.nfce_emission_provider IS
  'focus_nfe = edge nfce-emit (Focus). acbr_local = agente electron-acbr no PC da loja.';

-- Piloto Asa Sul
UPDATE public.stores
SET nfce_emission_provider = 'acbr_local'
WHERE id = 'fcf435c2-c382-444c-b499-4d95f07b2633';
