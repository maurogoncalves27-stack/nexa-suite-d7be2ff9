-- 1) Adiciona campo de matriz (auto-referência)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS parent_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_parent_store_id ON public.stores(parent_store_id);

-- 2) Trigger para garantir hierarquia simples (uma matriz não pode ter outra acima)
CREATE OR REPLACE FUNCTION public.validate_store_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_has_parent boolean;
BEGIN
  IF NEW.parent_store_id IS NOT NULL THEN
    IF NEW.parent_store_id = NEW.id THEN
      RAISE EXCEPTION 'Uma loja não pode ser matriz de si mesma';
    END IF;
    SELECT (parent_store_id IS NOT NULL) INTO parent_has_parent
      FROM public.stores WHERE id = NEW.parent_store_id;
    IF parent_has_parent THEN
      RAISE EXCEPTION 'A loja matriz selecionada já é uma filial. Selecione uma matriz de primeiro nível.';
    END IF;
    -- Se esta loja é matriz de outras, não pode virar filial
    IF EXISTS (SELECT 1 FROM public.stores WHERE parent_store_id = NEW.id) THEN
      RAISE EXCEPTION 'Esta loja já é matriz de outras filiais. Remova as filiais antes de torná-la subordinada.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_store_hierarchy ON public.stores;
CREATE TRIGGER trg_validate_store_hierarchy
BEFORE INSERT OR UPDATE OF parent_store_id ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.validate_store_hierarchy();

-- 3) Função auxiliar: lojas acessíveis pelo gerente (a própria + filiais)
CREATE OR REPLACE FUNCTION public.user_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT public.get_user_store(_user_id) AS sid
  )
  SELECT sid FROM base WHERE sid IS NOT NULL
  UNION
  SELECT s.id FROM public.stores s, base
   WHERE base.sid IS NOT NULL AND s.parent_store_id = base.sid;
$$;

-- 4) Atualiza políticas de employees para considerar matriz/filiais
DROP POLICY IF EXISTS "View employees by role" ON public.employees;
CREATE POLICY "View employees by role"
ON public.employees FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND store_id IN (SELECT public.user_accessible_stores(auth.uid())))
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Admin/Manager insert employees" ON public.employees;
CREATE POLICY "Admin/Manager insert employees"
ON public.employees FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND store_id IN (SELECT public.user_accessible_stores(auth.uid())))
);

DROP POLICY IF EXISTS "Admin/Manager update employees" ON public.employees;
CREATE POLICY "Admin/Manager update employees"
ON public.employees FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND store_id IN (SELECT public.user_accessible_stores(auth.uid())))
);

-- 5) Atualiza políticas de employee_documents
DROP POLICY IF EXISTS "View employee documents" ON public.employee_documents;
CREATE POLICY "View employee documents"
ON public.employee_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Insert employee documents" ON public.employee_documents;
CREATE POLICY "Insert employee documents"
ON public.employee_documents FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Delete employee documents" ON public.employee_documents;
CREATE POLICY "Delete employee documents"
ON public.employee_documents FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

-- 6) Atualiza políticas de employee_dependents
DROP POLICY IF EXISTS "View employee dependents" ON public.employee_dependents;
CREATE POLICY "View employee dependents"
ON public.employee_dependents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Insert employee dependents" ON public.employee_dependents;
CREATE POLICY "Insert employee dependents"
ON public.employee_dependents FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Update employee dependents" ON public.employee_dependents;
CREATE POLICY "Update employee dependents"
ON public.employee_dependents FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Delete employee dependents" ON public.employee_dependents;
CREATE POLICY "Delete employee dependents"
ON public.employee_dependents FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_dependents.employee_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);