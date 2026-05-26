
INSERT INTO public.inventory_products (name, unit, category, is_active)
VALUES
  ('Peixe preparo para empanar', 'kg', 'Pré-preparo', true),
  ('camarão para estrogonofe', 'kg', 'Pré-preparo', true),
  ('Base estrogonofe de camarão', 'kg', 'Pré-preparo', true),
  ('Camarão preparo para empanar', 'kg', 'Pré-preparo', true),
  ('Espaguete c estrogonfe de camarão', 'kg', 'Prato pronto', true),
  ('Estrogonfe individual de camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Estrogonfe casal de camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Estrogonfe família de camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Individual de Peixe com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Casal de Peixe com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Família de Peixe com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Individual de Camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Casal de Camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Parmegiana Família de Camarão com arroz/batata', 'kg', 'Prato pronto', true),
  ('Etiqueta validade', 'UN', 'Embalagem', true)
ON CONFLICT DO NOTHING;
