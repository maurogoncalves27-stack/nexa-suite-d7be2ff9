CREATE TABLE public.giana_stores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT,
  horario TEXT,
  tem_salao BOOLEAN NOT NULL DEFAULT false,
  aceita_retirada BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giana_stores TO authenticated;
GRANT ALL ON public.giana_stores TO service_role;
ALTER TABLE public.giana_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem lojas Giana" ON public.giana_stores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor gerencia lojas Giana" ON public.giana_stores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE TABLE public.giana_dishes (
  id TEXT PRIMARY KEY,
  marca TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tamanhos JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giana_dishes TO authenticated;
GRANT ALL ON public.giana_dishes TO service_role;
ALTER TABLE public.giana_dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem pratos Giana" ON public.giana_dishes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor gerencia pratos Giana" ON public.giana_dishes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE TABLE public.giana_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  termos TEXT[] NOT NULL DEFAULT '{}',
  resposta TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giana_faq TO authenticated;
GRANT ALL ON public.giana_faq TO service_role;
ALTER TABLE public.giana_faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem FAQ Giana" ON public.giana_faq
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor gerencia FAQ Giana" ON public.giana_faq
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_user(auth.uid()));

CREATE INDEX giana_dishes_nome_trgm ON public.giana_dishes USING gin (nome gin_trgm_ops);
CREATE INDEX giana_faq_titulo_trgm ON public.giana_faq USING gin (titulo gin_trgm_ops);
CREATE INDEX giana_faq_termos_idx ON public.giana_faq USING gin (termos);

CREATE TRIGGER trg_giana_stores_updated BEFORE UPDATE ON public.giana_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_giana_dishes_updated BEFORE UPDATE ON public.giana_dishes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_giana_faq_updated BEFORE UPDATE ON public.giana_faq
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.giana_norm(_t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(_t, ''))) $$;

CREATE OR REPLACE FUNCTION public.giana_search_dish(_termo TEXT)
RETURNS TABLE (id TEXT, marca TEXT, nome TEXT, descricao TEXT, tamanhos JSONB, score REAL)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.marca, d.nome, d.descricao, d.tamanhos,
         GREATEST(
           similarity(public.giana_norm(d.nome), public.giana_norm(_termo)),
           CASE WHEN public.giana_norm(d.nome) LIKE '%' || public.giana_norm(_termo) || '%'
                  OR public.giana_norm(_termo) LIKE '%' || public.giana_norm(d.nome) || '%'
                THEN 0.9 ELSE 0 END
         )::real AS score
  FROM public.giana_dishes d
  WHERE d.is_active
  ORDER BY score DESC, d.sort_order
  LIMIT 5;
$$;

CREATE OR REPLACE FUNCTION public.giana_search_faq(_pergunta TEXT)
RETURNS TABLE (id UUID, titulo TEXT, resposta TEXT, score REAL)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.id, f.titulo, f.resposta,
         GREATEST(
           COALESCE((SELECT MAX(CASE WHEN public.giana_norm(_pergunta) LIKE '%' || public.giana_norm(t) || '%' THEN 1.0 ELSE 0 END)
                     FROM unnest(f.termos) AS t), 0),
           similarity(public.giana_norm(f.titulo), public.giana_norm(_pergunta))
         )::real AS score
  FROM public.giana_faq f
  WHERE f.is_active
  ORDER BY score DESC, f.sort_order
  LIMIT 3;
$$;

GRANT EXECUTE ON FUNCTION public.giana_norm(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.giana_search_dish(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.giana_search_faq(TEXT) TO authenticated, service_role;