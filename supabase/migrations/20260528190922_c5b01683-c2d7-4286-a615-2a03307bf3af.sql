INSERT INTO public.profiles (id, user_id, email, full_name)
SELECT u.id, u.id, u.email, e.full_name
FROM auth.users u
JOIN public.employees e ON e.user_id = u.id
WHERE u.id IN ('ddc31c5c-6cd2-4322-884b-6ec17bbeacd2','be68db5f-a0b9-4990-92a5-b8710de0007b')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, user_id = EXCLUDED.user_id;