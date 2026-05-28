INSERT INTO public.pdv_channels (store_id, code, name, is_active, sort_order)
VALUES ('fcf435c2-c382-444c-b499-4d95f07b2633', 'ifood', 'iFood', true, 10)
ON CONFLICT DO NOTHING;