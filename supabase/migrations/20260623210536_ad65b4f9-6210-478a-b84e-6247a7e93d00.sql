UPDATE public.pdv_ifood_widgets
SET widget_id = '51f75fec-0ac2-41c1-84c6-af0df25bfe04'
WHERE store_id = (SELECT id FROM public.stores WHERE name = 'ÁGUAS CLARAS' LIMIT 1);