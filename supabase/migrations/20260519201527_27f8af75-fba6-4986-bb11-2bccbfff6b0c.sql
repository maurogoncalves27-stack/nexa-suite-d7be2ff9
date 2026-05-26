
CREATE OR REPLACE FUNCTION public.dfe_register_supplier_map(
  _cnpj text,
  _desc_norm text,
  _product_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dfe_supplier_product_map (supplier_cnpj, description_norm, product_id, hits, last_used_at)
  VALUES (_cnpj, _desc_norm, _product_id, 1, now())
  ON CONFLICT (supplier_cnpj, description_norm) DO UPDATE
    SET hits = CASE
                 WHEN public.dfe_supplier_product_map.product_id = EXCLUDED.product_id
                   THEN public.dfe_supplier_product_map.hits + 1
                 ELSE 1
               END,
        product_id = EXCLUDED.product_id,
        last_used_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.dfe_register_supplier_map(text, text, uuid) TO authenticated;
