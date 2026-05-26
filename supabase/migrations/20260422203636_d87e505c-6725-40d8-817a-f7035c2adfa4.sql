CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = COALESCE(EXCLUDED.email, public.profiles.email);

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
    IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
    END IF;
  END IF;

  -- Auto-vínculo por e-mail: procura colaborador sem login com mesmo e-mail
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO matched_employee_id
      FROM public.employees
     WHERE user_id IS NULL
       AND lower(email) = lower(NEW.email)
     LIMIT 1;

    IF matched_employee_id IS NOT NULL THEN
      UPDATE public.employees
         SET user_id = NEW.id, updated_at = now()
       WHERE id = matched_employee_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Backfill: vincula automaticamente todos os logins existentes sem vínculo
-- a colaboradores sem login que tenham o mesmo e-mail
UPDATE public.employees e
   SET user_id = p.user_id, updated_at = now()
  FROM public.profiles p
 WHERE e.user_id IS NULL
   AND p.email IS NOT NULL
   AND e.email IS NOT NULL
   AND lower(e.email) = lower(p.email)
   AND NOT EXISTS (
     SELECT 1 FROM public.employees e2 WHERE e2.user_id = p.user_id
   );