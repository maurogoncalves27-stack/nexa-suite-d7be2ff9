INSERT INTO public.store_terminal_users (user_id, store_id) VALUES
  ('5c7f28f9-fff9-478c-9898-129d4856cc74', 'fcf435c2-c382-444c-b499-4d95f07b2633'), -- asasul -> ASA SUL
  ('4202a854-9d27-400d-9738-e1d77460dc5c', 'b60e5cd6-ad59-4ac8-a309-e640641607b6'), -- asanorte -> ASA NORTE
  ('73de109f-df94-482e-9bed-1e1f339b98bc', 'd9911bc0-5ab7-4264-9fe9-118062c4ba3c'), -- aguasclaras -> ÁGUAS CLARAS
  ('3794d08e-0f5d-4138-b75e-a012c145bcb0', '3eff1e46-d337-4df1-bbcf-6a6f3a920eac')  -- lagosul -> LAGO SUL
ON CONFLICT (user_id) DO UPDATE SET store_id = EXCLUDED.store_id;