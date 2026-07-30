CREATE TABLE public.giana_brands (
  id text PRIMARY KEY,
  nome text NOT NULL,
  slogan text,
  descricao text,
  historia text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.giana_brands TO authenticated;
GRANT ALL ON public.giana_brands TO service_role;

ALTER TABLE public.giana_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem marcas da Giana"
ON public.giana_brands FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager gerencia marcas da Giana"
ON public.giana_brands FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_giana_brands_updated_at
BEFORE UPDATE ON public.giana_brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.giana_brands (id, nome, sort_order) VALUES
  ('aquela-parme', 'Aquela Parmê', 1),
  ('aquele-estrogonofe', 'Aquele Estrogonofe', 2),
  ('box-caipira', 'Box Caipira', 3)
ON CONFLICT (id) DO NOTHING;