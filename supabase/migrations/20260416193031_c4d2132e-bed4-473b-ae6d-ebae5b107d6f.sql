
-- =========================================
-- ENUM: papéis do sistema
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee', 'trainee');

-- =========================================
-- Função genérica de updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- TABELA: stores (lojas/unidades)
-- =========================================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  manager_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: profiles (dados básicos do usuário logado)
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: user_roles (papéis – separada por segurança)
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- Funções SECURITY DEFINER para evitar recursão em RLS
-- =========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_store(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- =========================================
-- TABELA: employees (colaboradores cadastrados)
-- =========================================
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL, -- opcional, se tiver login
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  rg TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  address TEXT,
  position TEXT,                       -- cargo
  department TEXT,
  contract_type TEXT,                  -- CLT, PJ, Estágio, Trainee
  hire_date DATE,
  termination_date DATE,
  salary NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, on_leave, terminated
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_employees_store ON public.employees(store_id);
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: employee_documents (metadados dos arquivos)
-- =========================================
CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,             -- RG, CPF, Contrato, Comprovante etc.
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,            -- caminho no bucket
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_emp_docs_employee ON public.employee_documents(employee_id);

-- =========================================
-- Trigger: cria profile automaticamente após signup
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );

  -- Primeiro usuário cadastrado vira admin; demais viram employee por padrão
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- RLS POLICIES
-- =========================================

-- profiles: usuário vê o próprio; admin vê todos
CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin insert profiles" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- user_roles: usuário vê seus papéis; admin gerencia tudo
CREATE POLICY "Users view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- stores: todos autenticados leem; admin gerencia
CREATE POLICY "Authenticated view stores" ON public.stores
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage stores" ON public.stores
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- employees: admin vê todos; manager vê os da sua loja; colaborador vê o próprio
CREATE POLICY "View employees by role" ON public.employees
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'manager') AND store_id = public.get_user_store(auth.uid()))
  OR user_id = auth.uid()
);

CREATE POLICY "Admin/Manager insert employees" ON public.employees
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'manager') AND store_id = public.get_user_store(auth.uid()))
);

CREATE POLICY "Admin/Manager update employees" ON public.employees
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'manager') AND store_id = public.get_user_store(auth.uid()))
);

CREATE POLICY "Admin delete employees" ON public.employees
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- employee_documents: segue regras dos employees
CREATE POLICY "View employee documents" ON public.employee_documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
      OR e.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Insert employee documents" ON public.employee_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
    )
  )
);

CREATE POLICY "Delete employee documents" ON public.employee_documents
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
    )
  )
);

-- =========================================
-- STORAGE: bucket privado para documentos
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- caminho dos arquivos: {employee_id}/{filename}
CREATE POLICY "View employee docs storage" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id::text = (storage.foldername(name))[1]
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
      OR e.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Upload employee docs storage" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id::text = (storage.foldername(name))[1]
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
    )
  )
);

CREATE POLICY "Delete employee docs storage" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id::text = (storage.foldername(name))[1]
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND e.store_id = public.get_user_store(auth.uid()))
    )
  )
);
