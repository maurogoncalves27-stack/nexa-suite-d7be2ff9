ALTER TABLE public.employees
ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female', 'other'));