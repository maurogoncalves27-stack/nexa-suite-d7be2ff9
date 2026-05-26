-- Tabela oficial de cargos
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view positions"
  ON public.positions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manage positions"
  ON public.positions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos 9 cargos atuais
INSERT INTO public.positions (name, sort_order) VALUES
  ('Supervisor de Loja', 1),
  ('Encarregado de Escritório', 2),
  ('Encarregado de Produção', 3),
  ('Analista de RH', 4),
  ('Auxiliar Administrativo', 5),
  ('Auxiliar de Cozinha', 6),
  ('Auxiliar de Produção', 7),
  ('Atendente', 8),
  ('Estoquista', 9);