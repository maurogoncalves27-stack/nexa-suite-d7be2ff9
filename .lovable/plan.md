## O que o usuário relatou

Ele está conciliando no dia **13/05**. Toda vez que finaliza uma conciliação naquela data, a página recarrega e volta para o **topo (08/06)**, e ele precisa rolar muito até reencontrar o 13/05 e continuar. Quer que o sistema mantenha a posição.

## Causa

Em `src/components/finance/BankReconciliationPanel.tsx`, após cada `reconcileCandidate` / `reconcileBatch` / `undo` / `autoReconcileAll`, chamamos `loadData()`, que reseta o array de `transactions`. Como a tabela é ordenada DESC por `posted_at` (08/06 → 13/05 → mais antigas), o re-render joga o scroll de volta para o topo. Além disso, a transação recém-conciliada some da lista (com "Ocultar conciliadas"), o que agrava a sensação de "perdi meu lugar".

## Correção proposta (cirúrgica, só nesse painel)

1. **Lembrar a data foco** ao conciliar: antes de chamar `loadData()`, salvar `posted_at` da transação que acabou de ser conciliada num `useRef` (ex.: `focusDateRef`).
2. **Restaurar scroll após o reload**: num `useEffect` que dispara quando `loading` vira `false` e `focusDateRef.current` está setado:
   - Marcar cada `<TableRow>` com `data-posted-at={tx.posted_at}`.
   - Procurar a primeira linha com `posted_at <= focusDateRef.current` (ou seja, a próxima transação ainda pendente daquela data ou imediatamente anterior).
   - Chamar `row.scrollIntoView({ block: "center" })` e limpar a ref.
3. **Fallback**: se não houver nenhuma linha com data ≤ foco (acabaram as do dia), rolar para o fim da lista atual em vez de voltar ao topo.
4. **Não mudar** ordenação, filtros, paginação, RPCs nem qualquer outro comportamento.

### Bônus opcional (só se você aprovar)

Adicionar um pequeno seletor de **"Ir para data"** (input `type="date"`) ao lado do campo de busca, que faz o mesmo `scrollIntoView` sob demanda — útil quando ele reabre a tela no dia seguinte.

## Arquivos afetados

- `src/components/finance/BankReconciliationPanel.tsx` (único arquivo)

## Risco

Baixo. Mudança só de UX/scroll; nenhuma lógica de conciliação, RPC ou query é alterada.

Posso implementar?