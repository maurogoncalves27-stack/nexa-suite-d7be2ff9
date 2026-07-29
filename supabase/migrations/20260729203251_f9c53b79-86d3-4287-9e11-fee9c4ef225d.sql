-- 1) Zera order_number quando ele é apenas um trecho do telefone do cliente
UPDATE public.support_tickets
SET order_number = NULL
WHERE order_number IS NOT NULL
  AND contact IS NOT NULL
  AND length(regexp_replace(contact, '\D', '', 'g')) >= 8
  AND regexp_replace(contact, '\D', '', 'g') LIKE '%' || regexp_replace(order_number, '\D', '', 'g') || '%';

-- 2) Preenche títulos ausentes a partir do relato
UPDATE public.support_tickets
SET title = CASE
  WHEN description ~* '(não\s+(chegou|veio|recebi)|não\s+foi\s+entregue|sumiu)' THEN 'Pedido não entregue'
  WHEN description ~* '(faltou|faltando|esqueceram|pela\s+metade)' THEN 'Item faltando no pedido'
  WHEN description ~* 'errad' THEN 'Pedido errado'
  WHEN description ~* 'fri[oa]' THEN 'Pedido frio'
  WHEN description ~* '(atras|demor)' THEN 'Atraso na entrega'
  WHEN description ~* '(cobran|estorno|reembolso)' THEN 'Problema de cobrança/reembolso'
  ELSE 'Reclamação de pedido'
END
WHERE title IS NULL OR btrim(title) = '';