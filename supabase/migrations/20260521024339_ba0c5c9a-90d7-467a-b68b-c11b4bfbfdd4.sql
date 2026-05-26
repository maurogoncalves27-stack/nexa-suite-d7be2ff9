-- Tabela de amarração: login do terminal de loja → store_id
CREATE TABLE IF NOT EXISTS public.store_terminal_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_terminal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminal user can read own binding"
  ON public.store_terminal_users
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

CREATE POLICY "Only admin/super manages bindings"
  ON public.store_terminal_users
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- Função para o frontend consultar a loja travada do usuário atual
CREATE OR REPLACE FUNCTION public.get_terminal_store_id(_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.store_terminal_users WHERE user_id = _uid LIMIT 1;
$$;