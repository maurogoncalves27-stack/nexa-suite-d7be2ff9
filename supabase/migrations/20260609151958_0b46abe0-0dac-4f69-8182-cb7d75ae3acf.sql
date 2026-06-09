-- 1) Garante que o trigger on_auth_user_created existe em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill: cria profile para qualquer auth.user que não tenha
INSERT INTO public.profiles (user_id, full_name, email)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3) Backfill: garante role mínima 'employee' para usuários sem nenhuma role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'employee'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) Auto-vínculo retroativo por e-mail: colaboradores sem login
UPDATE public.employees e
   SET user_id = u.id, updated_at = now()
  FROM auth.users u
 WHERE e.user_id IS NULL
   AND e.email IS NOT NULL
   AND lower(e.email) = lower(u.email);
