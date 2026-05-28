## Ocultar colunas Concluído e Cancelado do kanban /pdv-novo

### Problema
As colunas "Concluído" e "Cancelado" ocupam espaço no kanban de operação. Pedidos finalizados e cancelados vão para o fim da fila e já têm uma aba dedicada de histórico, tornando essas colunas desnecessárias no painel diário.

### Mudanças em `src/pages/PdvNovo.tsx`

1. **Filtrar colunas do kanban**
   - Em `COLUMNS`, adicionar `c.key !== "concluido" && c.key !== "cancelado"` ao filtro existente, de modo que essas duas colunas nunca apareçam no kanban de operação.

2. **Ajustar `displayOrders`**
   - Atualmente `displayOrders` inclui pedidos `concluded`/`cancelled`/`dispute` do dia atual, exibindo-os como cards compactos no final da lista.
   - Como as colunas sumem, esses cards também devem sumir do kanban. Filtrar `displayOrders` para incluir **apenas** pedidos com status ativos (`placed`, `confirmed`, `preparing`, `ready`, `dispatched`).
   - O histórico continua intacto na aba "Histórico de pedidos".

3. **Ajustar contadores do cabeçalho das colunas**
   - O cabeçalho do kanban soma counts com lógica específica para `concluido` e `cancelado`; remover esses acréscimos já que as colunas não existirão mais.

### Resultado esperado
- Kanban de operação mostra apenas: Em análise (se auto-aceitar desligado), Em produção, Pronto p/ retirada, Em entrega.
- Pedidos concluídos/cancelados do dia deixam de aparecer no kanban; consulta-se via aba "Histórico de pedidos".
