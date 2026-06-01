-- Tabela para gerenciar imagens do totem (fundos do atrai + logos por marca)
CREATE TABLE IF NOT EXISTS public.totem_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('background', 'logo')),
  brand_slug text,
  image_url text NOT NULL,
  storage_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_totem_assets_kind ON public.totem_assets(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_totem_assets_brand ON public.totem_assets(brand_slug) WHERE brand_slug IS NOT NULL;

GRANT SELECT ON public.totem_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.totem_assets TO authenticated;
GRANT ALL ON public.totem_assets TO service_role;

ALTER TABLE public.totem_assets ENABLE ROW LEVEL SECURITY;

-- Leitura pública (totem rodando em quiosque sem login)
CREATE POLICY "Totem assets are viewable by everyone"
  ON public.totem_assets FOR SELECT
  USING (true);

-- Apenas staff autenticado pode gerenciar
CREATE POLICY "Authenticated staff can insert totem assets"
  ON public.totem_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can update totem assets"
  ON public.totem_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can delete totem assets"
  ON public.totem_assets FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_totem_assets_updated_at
  BEFORE UPDATE ON public.totem_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Políticas de upload/leitura no bucket totem-backgrounds (já existe e é público)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Totem assets bucket public read') THEN
    CREATE POLICY "Totem assets bucket public read" ON storage.objects FOR SELECT USING (bucket_id = 'totem-backgrounds');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Totem assets bucket auth upload') THEN
    CREATE POLICY "Totem assets bucket auth upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'totem-backgrounds');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Totem assets bucket auth delete') THEN
    CREATE POLICY "Totem assets bucket auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'totem-backgrounds');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Totem assets bucket auth update') THEN
    CREATE POLICY "Totem assets bucket auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'totem-backgrounds');
  END IF;
END $$;