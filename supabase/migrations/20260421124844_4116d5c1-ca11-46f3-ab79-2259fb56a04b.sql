-- Tabela de configurações globais de tema (single-row pattern)
CREATE TABLE public.theme_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL UNIQUE DEFAULT 'global',
  mode TEXT,
  primary_hsl TEXT,
  accent_hsl TEXT,
  background_hsl TEXT,
  sidebar_bg_hsl TEXT,
  radius TEXT,
  font_family TEXT,
  font_scale NUMERIC,
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler o tema global
CREATE POLICY "Theme settings readable by everyone"
ON public.theme_settings
FOR SELECT
USING (true);

-- Apenas admins podem inserir
CREATE POLICY "Only admins can insert theme settings"
ON public.theme_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem atualizar
CREATE POLICY "Only admins can update theme settings"
ON public.theme_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger de updated_at
CREATE TRIGGER update_theme_settings_updated_at
BEFORE UPDATE ON public.theme_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para propagar mudanças automaticamente
ALTER PUBLICATION supabase_realtime ADD TABLE public.theme_settings;