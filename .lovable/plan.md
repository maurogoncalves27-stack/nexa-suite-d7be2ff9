## Causa

`recipes.output_product_id` é `NOT NULL` no banco. Quando a ficha é "Pronto" (não-fábrica), o save envia `output_product_id = null` e o Postgres rejeita → toast "Falha ao salvar". Em "Pré-preparo" passa porque manda o produto final.

## Fix

Migration única: `ALTER TABLE public.recipes ALTER COLUMN output_product_id DROP NOT NULL;`

Sem mudança de código — o form já manda `null` corretamente quando é Pronto.
