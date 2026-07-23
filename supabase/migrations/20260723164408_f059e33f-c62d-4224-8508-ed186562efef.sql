
CREATE TABLE public.nutri_equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_temp_c numeric NOT NULL,
  max_temp_c numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nutri_equipment_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.nutri_equipment_types TO authenticated;
GRANT ALL ON public.nutri_equipment_types TO service_role;

ALTER TABLE public.nutri_equipment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eq_types_select" ON public.nutri_equipment_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "eq_types_manage" ON public.nutri_equipment_types
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'nutritionist') OR
    public.is_super_user(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'nutritionist') OR
    public.is_super_user(auth.uid())
  );

CREATE TRIGGER trg_nutri_equipment_types_updated
  BEFORE UPDATE ON public.nutri_equipment_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.nutri_equipment_types (name, min_temp_c, max_temp_c, sort_order) VALUES
  ('Congelador', -25, -15, 1),
  ('Resfriado', 0, 5, 2),
  ('Seco', 15, 25, 3)
ON CONFLICT (name) DO NOTHING;
