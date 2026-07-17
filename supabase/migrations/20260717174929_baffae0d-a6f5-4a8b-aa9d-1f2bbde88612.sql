
DO $$
DECLARE
  canon uuid := '4584d52f-a7ce-4192-bf6c-32f028645358';
  central uuid := '06ae09d6-4589-47a4-8a7e-b5467e94d081';
  map jsonb := jsonb_build_object(
    '4584d52f-a7ce-4192-bf6c-32f028645358','34',
    'e98df3fe-e7f9-4616-b121-74271148f9fa','35',
    'd84d6a71-ca35-4049-95b6-59575cc15142','36',
    'c3c69efc-a0f1-474e-8075-540c9b8bbd45','37',
    '457ee7ba-9225-4dce-807e-743a359c9846','39',
    '69026b65-66b0-4108-9508-7ce71fd6886b','41',
    'c6a2c540-3451-4baa-8b4f-a6ed2f1d6c70','42',
    '5f9262a5-f2e7-44c4-97be-637793aa2d0d','43'
  );
  k text;
  v text;
BEGIN
  UPDATE uniform_items
     SET name='Calçado de Borracha Preto', size_type='numero', is_active=true
   WHERE id = canon;

  FOR k, v IN SELECT * FROM jsonb_each_text(map) LOOP
    UPDATE uniform_delivery_items   SET uniform_item_id=canon, size=v WHERE uniform_item_id = k::uuid;
    UPDATE uniform_return_items     SET uniform_item_id=canon, size=v WHERE uniform_item_id = k::uuid;
    UPDATE uniform_stock_movements  SET uniform_item_id=canon, size=v WHERE uniform_item_id = k::uuid;
  END LOOP;

  -- kits: só um registro por (position, uniform_item_id). Remover duplicados antes de reapontar.
  DELETE FROM uniform_kit_items k1
    USING uniform_kit_items k2
   WHERE k1.ctid < k2.ctid
     AND k1.position = k2.position
     AND k2.uniform_item_id = ANY (ARRAY(SELECT (jsonb_object_keys(map))::uuid))
     AND k1.uniform_item_id = ANY (ARRAY(SELECT (jsonb_object_keys(map))::uuid));

  UPDATE uniform_kit_items SET uniform_item_id = canon
   WHERE uniform_item_id = ANY (ARRAY(SELECT (jsonb_object_keys(map))::uuid))
     AND NOT EXISTS (
       SELECT 1 FROM uniform_kit_items x
        WHERE x.position = uniform_kit_items.position AND x.uniform_item_id = canon
     );

  DELETE FROM uniform_stock WHERE uniform_item_id = canon;
  INSERT INTO uniform_stock (store_id, uniform_item_id, size, condition, quantity, min_alert) VALUES
    (central, canon, '35', 'usada', 1, 0),
    (central, canon, '37', 'usada', 3, 0),
    (central, canon, '41', 'nova',  2, 0),
    (central, canon, '41', 'usada', 1, 0),
    (central, canon, '42', 'nova',  1, 0);

  DELETE FROM uniform_items
   WHERE category='calcado' AND id <> canon;
END $$;
