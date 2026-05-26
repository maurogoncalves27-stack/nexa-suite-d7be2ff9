-- Tabela de exceções de acesso por usuário
CREATE TABLE IF NOT EXISTS public.user_access_overrides (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bypass_geofence BOOLEAN NOT NULL DEFAULT false,
  extra_store_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.user_access_overrides ENABLE ROW LEVEL SECURITY;

-- Admin/manager veem e editam tudo
CREATE POLICY "Staff manage all overrides"
  ON public.user_access_overrides
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Cada usuário pode ver o próprio override
CREATE POLICY "Users view own override"
  ON public.user_access_overrides
  FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger de updated_at
CREATE TRIGGER trg_user_access_overrides_updated
  BEFORE UPDATE ON public.user_access_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: usuário tem bypass de geofence?
CREATE OR REPLACE FUNCTION public.has_geofence_bypass(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_user(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.user_access_overrides
         WHERE user_id = _user_id AND bypass_geofence = true
      );
$function$;

-- Atualiza user_accessible_stores para considerar extra_store_ids do override
CREATE OR REPLACE FUNCTION public.user_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Bypass legado (LILIAN LIMA hardcoded): vê tudo
  SELECT id FROM public.stores
   WHERE public.has_all_stores_access(_user_id)
  UNION
  -- Loja vinculada no profile
  SELECT public.get_user_store(_user_id)
   WHERE public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Filiais virtuais da loja vinculada
  SELECT s.id
    FROM public.stores s
   WHERE s.parent_store_id = public.get_user_store(_user_id)
     AND public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Lojas extras concedidas pelo override
  SELECT unnest(extra_store_ids)
    FROM public.user_access_overrides
   WHERE user_id = _user_id;
$function$;