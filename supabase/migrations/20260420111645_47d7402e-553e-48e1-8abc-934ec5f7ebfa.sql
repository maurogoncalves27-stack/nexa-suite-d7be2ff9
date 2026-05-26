-- Backfill profiles a partir de auth.users (usuários antigos sem profile)
INSERT INTO public.profiles (user_id, full_name, email)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Garantir que o primeiro usuário (sem nenhum role) vire admin para destrancar gestão de acessos
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'employee'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;