
-- ============================================================
-- Unificar categorias compartilhadas entre as 3 marcas (iFood)
-- ============================================================
DO $$
DECLARE
  parme_id   uuid := 'c4d18a78-a226-4396-8c98-3eaabe9438e1';
  box_id     uuid := '66966f19-064b-4a5a-91f0-4de601800e5d';
  estrog_id  uuid := '49b2d873-707d-4f5c-8f5b-0ea42fd82ebd';
  asa_norte  uuid := 'b60e5cd6-ad59-4ac8-a309-e640641607b6';

  -- canônicas
  c_bebidas  uuid := 'b42016cd-a309-4e17-89ea-c6e479860b99'; -- Bebidas
  c_doce     uuid := '65ab1a34-bc3d-4412-90f6-b3de7985d0f7'; -- Deixe a vida mais doce!
  c_massa    uuid := 'cf409b86-f6ba-4cdd-905b-4f70d561d9f0'; -- Massa Demais!
  c_salada   uuid := '9e6e3162-c6f6-4539-9f50-4ee501ac0d6f'; -- Pratos Vegetarianos e Saladas
  c_milan    uuid := '9eb409fb-7127-42e1-929a-74dc8530dd4a'; -- Milanesas crocantes
  c_promo    uuid := '3337ae0c-9c53-4f98-9dac-65c065b654ba'; -- Promoções imperdíveis!

  shared_ids uuid[];
  it RECORD;
BEGIN
  shared_ids := ARRAY[c_bebidas, c_doce, c_massa, c_salada, c_milan, c_promo];

  -- 1) Mover itens das variantes para as canônicas
  UPDATE menu_items SET category_id = c_bebidas WHERE category_id IN (
    '45d0a97c-b67f-4f2a-8336-9c8b2d3188da','86be3b14-4072-4795-8062-e04076b712f8','87cad0e3-38e1-4727-960a-71b4f5f2441a'
  );
  UPDATE menu_items SET category_id = c_doce WHERE category_id IN (
    '51f6260e-8154-449c-be6a-59372861e083','20191bb3-8ced-4ce5-b452-d6563b65b88c'
  );
  UPDATE menu_items SET category_id = c_massa WHERE category_id IN (
    'f4ce90bc-d446-4e0b-a66f-f815071fd62e','c5180064-8446-4110-9ee1-b1c6b101cbb6','81241ab0-775f-4e88-b671-3ef9d0a32ce7'
  );
  UPDATE menu_items SET category_id = c_salada WHERE category_id IN (
    '0d557262-3ab9-4e5e-adcf-c6a9c632f8ab','2bb93f7b-48b4-48f4-8a7d-cbfb406a1ff3'
  );
  UPDATE menu_items SET category_id = c_milan WHERE category_id IN (
    '5fd2382c-2e50-4a7b-9400-b1313cce3561','08c53adf-0fcb-43ea-a549-31b84190c0e1'
  );

  -- 2) Garantir item ligado às 3 marcas para todo item nas categorias compartilhadas
  FOR it IN SELECT id FROM menu_items WHERE category_id = ANY(shared_ids) LOOP
    INSERT INTO menu_item_brands (menu_item_id, brand_id) VALUES
      (it.id, parme_id),(it.id, box_id),(it.id, estrog_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 3) Linkar categorias canônicas às 3 marcas
  INSERT INTO menu_category_brands (category_id, brand_id)
  SELECT c, b FROM unnest(shared_ids) c CROSS JOIN unnest(ARRAY[parme_id, box_id, estrog_id]) b
  ON CONFLICT DO NOTHING;

  -- 4) Apagar categorias-variantes (agora vazias)
  DELETE FROM menu_category_brands WHERE category_id IN (
    '45d0a97c-b67f-4f2a-8336-9c8b2d3188da','86be3b14-4072-4795-8062-e04076b712f8','87cad0e3-38e1-4727-960a-71b4f5f2441a',
    '51f6260e-8154-449c-be6a-59372861e083','20191bb3-8ced-4ce5-b452-d6563b65b88c',
    'f4ce90bc-d446-4e0b-a66f-f815071fd62e','c5180064-8446-4110-9ee1-b1c6b101cbb6','81241ab0-775f-4e88-b671-3ef9d0a32ce7',
    '0d557262-3ab9-4e5e-adcf-c6a9c632f8ab','2bb93f7b-48b4-48f4-8a7d-cbfb406a1ff3',
    '5fd2382c-2e50-4a7b-9400-b1313cce3561','08c53adf-0fcb-43ea-a549-31b84190c0e1'
  );
  DELETE FROM menu_categories WHERE id IN (
    '45d0a97c-b67f-4f2a-8336-9c8b2d3188da','86be3b14-4072-4795-8062-e04076b712f8','87cad0e3-38e1-4727-960a-71b4f5f2441a',
    '51f6260e-8154-449c-be6a-59372861e083','20191bb3-8ced-4ce5-b452-d6563b65b88c',
    'f4ce90bc-d446-4e0b-a66f-f815071fd62e','c5180064-8446-4110-9ee1-b1c6b101cbb6','81241ab0-775f-4e88-b671-3ef9d0a32ce7',
    '0d557262-3ab9-4e5e-adcf-c6a9c632f8ab','2bb93f7b-48b4-48f4-8a7d-cbfb406a1ff3',
    '5fd2382c-2e50-4a7b-9400-b1313cce3561','08c53adf-0fcb-43ea-a549-31b84190c0e1'
  );

  -- 5) Excluir Hits, Hits 2 e Hits (BOX CAIPIRA) — itens + categorias (exclusivos iFood)
  DELETE FROM menu_items WHERE category_id IN (
    '145c9d6b-e415-4ec7-bd06-5afe26127a1a','e2c0a524-92dd-4a2b-a780-37a4cd140cb7','ffcbe0d5-abf3-4758-83d1-8747a72be611'
  );
  DELETE FROM menu_category_brands WHERE category_id IN (
    '145c9d6b-e415-4ec7-bd06-5afe26127a1a','e2c0a524-92dd-4a2b-a780-37a4cd140cb7','ffcbe0d5-abf3-4758-83d1-8747a72be611'
  );
  DELETE FROM menu_categories WHERE id IN (
    '145c9d6b-e415-4ec7-bd06-5afe26127a1a','e2c0a524-92dd-4a2b-a780-37a4cd140cb7','ffcbe0d5-abf3-4758-83d1-8747a72be611'
  );

  -- 6) Porções e Adicionais (3 variantes) → restritas à loja ASA NORTE
  FOR it IN
    SELECT id FROM menu_items WHERE category_id IN (
      'fe77444f-e619-4eed-8358-d8ce25e6069a',
      '6c802182-2c2d-44cc-96b0-9d16071ef188',
      '82864282-cd2e-4ae1-a319-3f66d189cad5'
    )
  LOOP
    DELETE FROM menu_item_stores WHERE menu_item_id = it.id;
    INSERT INTO menu_item_stores (menu_item_id, store_id) VALUES (it.id, asa_norte)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
