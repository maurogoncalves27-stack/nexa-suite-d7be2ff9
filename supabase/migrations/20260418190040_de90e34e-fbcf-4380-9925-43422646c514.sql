-- ========== Passkeys (WebAuthn) ==========
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_name text NOT NULL DEFAULT 'Dispositivo',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own passkeys"
  ON public.user_passkeys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own passkeys"
  ON public.user_passkeys FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT/UPDATE só via edge function (service role); nenhuma policy permissiva pública.

-- ========== Face descriptors para login ==========
CREATE TABLE IF NOT EXISTS public.user_face_descriptors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  descriptor double precision[] NOT NULL,
  sample_count int NOT NULL DEFAULT 1,
  photo_path text,
  is_active boolean NOT NULL DEFAULT true,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_face_descriptors_user_id ON public.user_face_descriptors(user_id);

ALTER TABLE public.user_face_descriptors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own face"
  ON public.user_face_descriptors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own face"
  ON public.user_face_descriptors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own face"
  ON public.user_face_descriptors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own face"
  ON public.user_face_descriptors FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all faces"
  ON public.user_face_descriptors FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_user_face_updated_at
  BEFORE UPDATE ON public.user_face_descriptors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== Função: lookup do user_id por e-mail (usada antes do login biométrico) ==========
-- Retorna NULL se não encontrar (não vaza informação sobre existência da conta).
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM public, anon, authenticated;
-- Será chamada apenas pelas edge functions com service role.