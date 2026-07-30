CREATE OR REPLACE FUNCTION public.giana_search_dish(_termo text)
 RETURNS TABLE(id text, marca text, nome text, descricao text, tamanhos jsonb, score real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.marca, d.nome,
         d.descricao
           || COALESCE(' | Serve: ' || trim(to_char(d.serves_people, 'FM999999.99')) || ' pessoa(s)', '')
           || COALESCE(' | Peso total: ' || trim(to_char(d.total_weight_g, 'FM999999.99')) || 'g', '')
           || COALESCE(' | Proteína: ' || trim(to_char(d.protein_weight_g, 'FM999999.99')) || 'g', '') AS descricao,
         d.tamanhos,
         GREATEST(
           similarity(public.giana_norm(d.nome), public.giana_norm(_termo)),
           CASE WHEN public.giana_norm(d.nome) LIKE '%' || public.giana_norm(_termo) || '%'
                  OR public.giana_norm(_termo) LIKE '%' || public.giana_norm(d.nome) || '%'
                THEN 0.9 ELSE 0 END
         )::real AS score
  FROM public.giana_menu_dishes d
  ORDER BY score DESC, d.sort_order
  LIMIT 5;
$function$;