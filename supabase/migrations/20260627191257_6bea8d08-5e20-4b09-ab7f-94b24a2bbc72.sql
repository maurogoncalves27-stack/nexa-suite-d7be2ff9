
-- 1. Novas colunas
ALTER TABLE public.occurrences
  ADD COLUMN IF NOT EXISTS subcategory_options text[],
  ADD COLUMN IF NOT EXISTS requires_subcategory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_category text;

ALTER TABLE public.occurrence_alerts
  ADD COLUMN IF NOT EXISTS subcategory text;

-- 2. Preserva categoria antiga
UPDATE public.occurrences SET legacy_category = category WHERE legacy_category IS NULL;

-- 3. Re-mapeia para causa-raiz
-- COZINHA / PRODUÇÃO
UPDATE public.occurrences SET category = 'COZINHA'
 WHERE occurrence IN (
   'PROBLEMAS COM A QUALIDADE DO PEDIDO',
   'PONTO ERRADO PROTEINA',
   'CLIENTE ENCONTROU OBJETOS ESTANHOS NA COMIDA'
 );

-- MONTAGEM / EXPEDIÇÃO
UPDATE public.occurrences SET category = 'MONTAGEM'
 WHERE occurrence IN (
   'FALTOU ITENS NO PEDIDO',
   'POUCA QUANTIDADE',
   'ENTREGOU PEDIDO TROCADO PARA ENTREGADOR',
   'PEDIDO VIOLADO OU REVIRADO'
 );

-- ESTOQUE
UPDATE public.occurrences SET category = 'ESTOQUE'
 WHERE occurrence ILIKE '%NÃO TEM ESTOQUE%' OR occurrence ILIKE '%NAO TEM ESTOQUE%';

-- LOGÍSTICA / ENTREGADOR
UPDATE public.occurrences SET category = 'LOGISTICA'
 WHERE occurrence ILIKE '%MOTOBOY%'
    OR occurrence ILIKE '%ENTREGADOR%'
    OR occurrence ILIKE '%PEDIDO ESTÁ ATRASADO%'
    OR occurrence ILIKE '%PEDIDO ESTA ATRASADO%'
    OR occurrence ILIKE '%VEICULO DO ENTREGADOR%';

-- CLIENTE
UPDATE public.occurrences SET category = 'CLIENTE'
 WHERE occurrence ILIKE 'CLIENTE PEDE %'
    OR occurrence ILIKE 'CLIENTE PEDIU %'
    OR occurrence ILIKE 'CLIENTE QUER %'
    OR occurrence ILIKE 'CLIENTE SOLICITA%'
    OR occurrence ILIKE 'CLIENTE RECLAMA%'
    OR occurrence = 'ACRESCENTAR ITENS AO PEDIDO';

-- PAGAMENTO
UPDATE public.occurrences SET category = 'PAGAMENTO'
 WHERE occurrence ILIKE '%PAGAMENTO%';

-- INFRAESTRUTURA / SISTEMA
UPDATE public.occurrences SET category = 'INFRAESTRUTURA'
 WHERE occurrence ILIKE 'LOJA SEM%'
    OR occurrence ILIKE '%TOTEM%'
    OR occurrence ILIKE '%FALHA NOS SISTEMAS%'
    OR occurrence ILIKE '%MANGUEIRA DO%GÁS%'
    OR occurrence ILIKE '%MANGUEIRA DO%GAS%';

-- 4. Marca ocorrências que exigem subcategoria + opções
UPDATE public.occurrences
   SET requires_subcategory = true,
       subcategory_options = ARRAY['Temperatura','Sabor','Apresentação','Objeto estranho','Ponto da proteína','Item queimado','Outro']
 WHERE occurrence = 'PROBLEMAS COM A QUALIDADE DO PEDIDO';

UPDATE public.occurrences
   SET requires_subcategory = true,
       subcategory_options = ARRAY['Bebida','Acompanhamento','Sobremesa','Talher/molho','Item principal','Complemento','Outro']
 WHERE occurrence = 'FALTOU ITENS NO PEDIDO';

UPDATE public.occurrences
   SET requires_subcategory = true,
       subcategory_options = ARRAY['Saída da loja','Trânsito','Entregador parado','Endereço errado','Outro']
 WHERE occurrence ILIKE '%MOTOBOY ATRASA%' OR occurrence ILIKE '%PEDIDO ESTÁ ATRASADO%' OR occurrence ILIKE '%PEDIDO ESTA ATRASADO%';

UPDATE public.occurrences
   SET requires_subcategory = true,
       subcategory_options = ARRAY['Maquininha','Pix','Cartão recusado','App','Outro']
 WHERE occurrence ILIKE '%PAGAMENTO%';

UPDATE public.occurrences
   SET requires_subcategory = true,
       subcategory_options = ARRAY['Energia','Água','Internet','Gás','Totem','Sistema iFood','Outro']
 WHERE category = 'INFRAESTRUTURA';
