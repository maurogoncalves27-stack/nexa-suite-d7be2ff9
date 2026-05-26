-- Categorias customizáveis para credenciais e contatos
CREATE TABLE public.vault_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('credential','contact')),
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

ALTER TABLE public.vault_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view vault_categories"
  ON public.vault_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff manage vault_categories"
  ON public.vault_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_vault_categories_updated_at
BEFORE UPDATE ON public.vault_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Credenciais (logins/senhas)
CREATE TABLE public.vault_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,
  username TEXT,
  password TEXT,
  url TEXT,
  notes TEXT,
  category_id UUID REFERENCES public.vault_categories(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

CREATE INDEX idx_vault_credentials_store ON public.vault_credentials(store_id);
CREATE INDEX idx_vault_credentials_category ON public.vault_credentials(category_id);
CREATE INDEX idx_vault_credentials_service ON public.vault_credentials USING gin (service_name gin_trgm_ops);

ALTER TABLE public.vault_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view vault_credentials"
  ON public.vault_credentials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff manage vault_credentials"
  ON public.vault_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_vault_credentials_updated_at
BEFORE UPDATE ON public.vault_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contatos importantes
CREATE TABLE public.vault_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role_or_company TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  category_id UUID REFERENCES public.vault_categories(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

CREATE INDEX idx_vault_contacts_store ON public.vault_contacts(store_id);
CREATE INDEX idx_vault_contacts_category ON public.vault_contacts(category_id);
CREATE INDEX idx_vault_contacts_name ON public.vault_contacts USING gin (name gin_trgm_ops);

ALTER TABLE public.vault_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view vault_contacts"
  ON public.vault_contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff manage vault_contacts"
  ON public.vault_contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_vault_contacts_updated_at
BEFORE UPDATE ON public.vault_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Categorias iniciais sugeridas
INSERT INTO public.vault_categories (name, kind, sort_order) VALUES
  ('Wi-Fi','credential',1),
  ('iFood','credential',2),
  ('Banco','credential',3),
  ('E-mail','credential',4),
  ('Sistema','credential',5),
  ('Rede social','credential',6),
  ('Outro','credential',99),
  ('Fornecedor','contact',1),
  ('Manutenção','contact',2),
  ('Contador','contact',3),
  ('Emergência','contact',4),
  ('Cliente','contact',5),
  ('Outro','contact',99);
