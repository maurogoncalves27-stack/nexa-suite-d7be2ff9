-- 1) Tabela user_signatures (uma assinatura por usuário, definitiva)
CREATE TABLE public.user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  signature_path TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_ip TEXT,
  consent_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_signatures IS
  'Assinatura eletrônica única e definitiva do colaborador, reutilizada em todos os documentos assinados após o cadastro.';

-- 2) RLS
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;

-- Colaborador vê só a própria
CREATE POLICY "Users can view own signature"
  ON public.user_signatures
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admin vê todas (auditoria)
CREATE POLICY "Admins can view all signatures"
  ON public.user_signatures
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Colaborador insere a própria (única vez — UNIQUE no user_id impede duplicata)
CREATE POLICY "Users can insert own signature"
  ON public.user_signatures
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Sem UPDATE / DELETE para todos: assinatura é definitiva.
-- (Admin pode usar service role se precisar resetar manualmente em casos excepcionais.)

-- 3) Bucket de storage privado para as imagens das assinaturas
INSERT INTO storage.buckets (id, name, public)
  VALUES ('user-signatures', 'user-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas do bucket: dono lê/grava apenas dentro da própria pasta {user_id}/...
CREATE POLICY "Users can read own signature image"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'user-signatures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own signature image"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'user-signatures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin lê todas (auditoria)
CREATE POLICY "Admins can read all signature images"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'user-signatures'
    AND public.has_role(auth.uid(), 'admin')
  );

-- Index pra lookup rápido
CREATE INDEX idx_user_signatures_user_id ON public.user_signatures(user_id);