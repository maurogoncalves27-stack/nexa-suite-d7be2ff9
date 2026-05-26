-- Infere unidade de medida pelo nome do produto.
-- Regras conservadoras: KG continua sendo o padrão (cozinha).
-- Mudamos apenas quando o nome indica claramente outra unidade.

UPDATE public.inventory_products SET unit = 'UN'
WHERE unit = 'kg' AND (
  UPPER(name) ~ '\m(EMBALAGEM|EMBAL|CAIXA|BOX|POTE|TAMPA|TALHER|CANUDO|GUARDANAPO|SACOLA|MARMITA|MARMITEX|BANDEJA|COPO|GARFO|FACA|COLHER|PRATO|ROLO|UNIDADE|UNID|UND|UN|PCT|PACOTE|FARDO|DUZIA|DZ|OVO|OVOS|ADESIVO|CARDAPIO|CARTAO|ETIQUETA|SACO)\M'
);

UPDATE public.inventory_products SET unit = 'L'
WHERE unit = 'kg' AND (
  UPPER(name) ~ '\m(LITRO|LITROS|LT|REFRIGERANTE|SUCO|AGUA|VINAGRE|OLEO|AZEITE|LEITE|CERVEJA|VINHO|BEBIDA)\M'
);

UPDATE public.inventory_products SET unit = 'L'
WHERE unit = 'kg' AND UPPER(name) LIKE '%COCA%COLA%';

-- Normaliza 'kg' minúsculo para 'KG' maiúsculo (consistência com UNITS do front)
UPDATE public.inventory_products SET unit = 'KG' WHERE unit = 'kg';