ALTER TABLE public.employee_face_descriptors ADD COLUMN IF NOT EXISTS photo_path TEXT;

-- Política de storage: permitir colaborador ler/escrever sua própria foto de avatar
-- O bucket time-clock-photos já existe (privado). Vamos usar prefixo 'avatars/'.

DO $$
BEGIN
  -- INSERT: usuário autenticado pode subir avatar do próprio cadastro de colaborador
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Employees can upload own avatar'
  ) THEN
    CREATE POLICY "Employees can upload own avatar"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'time-clock-photos'
        AND (storage.foldername(name))[1] = 'avatars'
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.user_id = auth.uid()
            AND e.id::text = (storage.foldername(name))[2]
        )
      );
  END IF;

  -- SELECT: usuário pode ver seu próprio avatar; admin/manager veem todos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Read own or managed avatars'
  ) THEN
    CREATE POLICY "Read own or managed avatars"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'time-clock-photos'
        AND (storage.foldername(name))[1] = 'avatars'
        AND (
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.user_id = auth.uid()
              AND e.id::text = (storage.foldername(name))[2]
          )
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
        )
      );
  END IF;

  -- UPDATE/DELETE para permitir recadastro
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Employees can update own avatar'
  ) THEN
    CREATE POLICY "Employees can update own avatar"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'time-clock-photos'
        AND (storage.foldername(name))[1] = 'avatars'
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.user_id = auth.uid()
            AND e.id::text = (storage.foldername(name))[2]
        )
      );
  END IF;
END $$;