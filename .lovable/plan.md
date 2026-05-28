## Problema
Pedidos concluídos e cancelados sumiram da tela `/loja`. As colunas "Concluído" e "Cancelado" foram ocultadas (correto), mas o render do card também passou a descartar qualquer pedido cujo status não bate com nenhuma coluna visível — então os cards verdes/vermelhos nunca chegam a ser desenhados.

Trecho responsável em `src/pages/PdvNovo.tsx` (~linha 1107):
```ts
const colIdx = COLUMNS.findIndex((c) => matchesCol(c, o));
if (colIdx === -1) return null;   // ← derruba concluded/cancelled
```

## Correção
1. Em `src/pages/PdvNovo.tsx`, dentro do `.map` de `displayOrders`, tratar o caso finalizado ANTES de calcular `colIdx`:
   - Se `o.status` é `concluded`, `cancelled` ou `dispute`, renderizar direto o botão verde/vermelho já existente (bloco `if (isFinal)`), sem exigir `colIdx`.
   - Só depois, para pedidos ativos, calcular `colIdx` e retornar `null` quando não houver coluna correspondente.
2. Manter a ordenação atual (`ordersByColumn`/`displayOrders` já colocam finalizados depois dos ativos).

Nenhuma outra mudança: colunas continuam ocultas, sem mexer em iFood, edge functions, ou layout.

## Arquivos afetados
- `src/pages/PdvNovo.tsx` — reordenar o bloco do `.map` para renderizar cards finalizados independentemente de `colIdx`.

## Como validar
- Em `/loja`, fechar um pedido (Concluir). O card verde "Concluído #NNNN" deve aparecer abaixo dos pedidos vigentes.
- Cancelar outro pedido. O card vermelho "Cancelado #NNNN" também aparece abaixo.
- Atualizar a página: os cards finalizados do dia continuam visíveis (já que `displayOrders` filtra por "hoje").
