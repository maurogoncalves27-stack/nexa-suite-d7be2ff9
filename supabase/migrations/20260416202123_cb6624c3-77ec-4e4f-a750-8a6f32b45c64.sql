UPDATE public.employees
SET store_id = 'e0ce4116-6b3b-40ec-8f45-1392df6c0d75'
WHERE store_id = '399c79c1-53ca-444b-a646-73fbddce043f';

DELETE FROM public.stores
WHERE id = '399c79c1-53ca-444b-a646-73fbddce043f';