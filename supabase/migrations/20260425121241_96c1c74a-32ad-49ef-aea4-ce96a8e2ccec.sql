-- ============================================================
-- Acessos externos: Fornecedores + Terceirizados unificados
-- ============================================================

-- 1) Novo papel: outsourced
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'outsourced';

-- 2) Status / aprovação no terceirizado (similar ao supplier)
ALTER TABLE public.outsourced_professionals
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- aceita pending/approved/rejected/suspended
ALTER TABLE public.outsourced_professionals
  DROP CONSTRAINT IF EXISTS outsourced_professionals_approval_status_check;
ALTER TABLE public.outsourced_professionals
  ADD CONSTRAINT outsourced_professionals_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected','suspended'));

-- 3) Tabela de permissões por módulo para parceiros externos
--    Um registro por (user_id, module). Presença = liberado.
CREATE TABLE IF NOT EXISTS public.external_partner_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_ext_perm_user ON public.external_partner_permissions(user_id);

ALTER TABLE public.external_partner_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff gerencia permissoes externas" ON public.external_partner_permissions;
CREATE POLICY "Staff gerencia permissoes externas"
  ON public.external_partner_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Parceiro vê suas permissoes" ON public.external_partner_permissions;
CREATE POLICY "Parceiro vê suas permissoes"
  ON public.external_partner_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4) Função utilitária para verificar permissão por módulo
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.external_partner_permissions
    WHERE user_id = _user_id AND module = _module
  );
$$;

-- 5) Trigger sync de role outsourced ao aprovar/rejeitar terceirizado
CREATE OR REPLACE FUNCTION public.sync_outsourced_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status <> 'approved') THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'outsourced')
        ON CONFLICT DO NOTHING;
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
    END IF;
  ELSIF NEW.approval_status IN ('rejected','suspended') AND OLD.approval_status = 'approved' THEN
    IF NEW.user_id IS NOT NULL THEN
      DELETE FROM public.user_roles
        WHERE user_id = NEW.user_id AND role = 'outsourced';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_outsourced_role_trigger ON public.outsourced_professionals;
CREATE TRIGGER sync_outsourced_role_trigger
  BEFORE UPDATE ON public.outsourced_professionals
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_role();

-- 6) Trigger: bloqueia o terceirizado de mexer em campos sensíveis
CREATE OR REPLACE FUNCTION public.protect_outsourced_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- auto-cadastro entra como pending
    NEW.approval_status := 'pending';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'active';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.approval_status := OLD.approval_status;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.cpf := OLD.cpf;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_outsourced_status_trigger ON public.outsourced_professionals;
CREATE TRIGGER protect_outsourced_status_trigger
  BEFORE INSERT OR UPDATE ON public.outsourced_professionals
  FOR EACH ROW EXECUTE FUNCTION public.protect_outsourced_status();

-- 7) Permitir auto-cadastro: o próprio terceirizado cria seu registro
DROP POLICY IF EXISTS "Terceirizado cria seu próprio cadastro" ON public.outsourced_professionals;
CREATE POLICY "Terceirizado cria seu próprio cadastro"
  ON public.outsourced_professionals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Terceirizado edita seu próprio cadastro" ON public.outsourced_professionals;
CREATE POLICY "Terceirizado edita seu próprio cadastro"
  ON public.outsourced_professionals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
