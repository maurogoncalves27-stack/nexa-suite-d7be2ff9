
## Problema

Hoje, ao sair das abas **Conciliação bancária**, **Extrato** e **DRE** e voltar, tudo é reiniciado:
- Conta selecionada, período (de/até), status volta ao padrão (mês atual)
- A rolagem volta pro topo
- Ao salvar uma conciliação no meio da lista, a página recarrega os dados e joga o usuário de volta pro topo

Isso acontece porque cada página guarda os filtros em `useState` local. Quando o React desmonta a página (troca de rota), o estado é perdido. E, após salvar, a lista é recarregada sem manter a posição de scroll.

## Objetivo

1. Manter os filtros escolhidos (conta, data inicial, data final, status, busca) mesmo saindo e voltando da aba.
2. Manter a posição de rolagem ao voltar pra aba.
3. Ao salvar/atualizar uma linha na Conciliação, a lista continua no mesmo lugar (sem "pular pro topo").

## Escopo (só essas três telas)

- `src/pages/BankReconciliation.tsx` (Conciliação)
- `src/pages/FinanceAccountStatement.tsx` (Extrato)
- `src/pages/FinanceDre.tsx` (DRE)

Nenhuma outra tela, regra de negócio ou cálculo é alterado.

## Como vai funcionar

**1. Filtros persistentes por aba**
Criar um hook utilitário `usePersistentState(key, initialValue)` que usa `sessionStorage` (limpa ao fechar o navegador, mas sobrevive à navegação entre abas). Trocar os `useState` dos filtros dessas três páginas por esse hook, com chaves separadas:
- `finance:reconciliation:filters`
- `finance:statement:filters`
- `finance:dre:filters`

Assim, quando o usuário volta pra aba, os campos já vêm preenchidos com o que ele tinha filtrado, sem precisar filtrar de novo.

**2. Rolagem preservada ao voltar pra aba**
Mesmo hook aplicado à posição de scroll da página. Ao desmontar, salva o `scrollY`; ao montar de novo, restaura depois que os dados carregam.

**3. Salvar na Conciliação sem "pular pro topo"**
Hoje, após salvar uma linha, a lista inteira é recarregada e a página perde a posição. Vamos:
- Guardar `window.scrollY` antes de recarregar
- Após a lista renderizar novamente, restaurar a mesma posição
- Onde possível, atualizar só a linha alterada em vez de recarregar tudo (otimização adicional só se for simples; senão fica o "guardar e restaurar scroll")

## Detalhes técnicos

- Novo arquivo `src/hooks/usePersistentState.ts` — wrapper de `useState` que lê/grava em `sessionStorage` (JSON.stringify/parse, com try/catch).
- Novo hook `src/hooks/useScrollRestoration.ts` — salva `scrollY` no `sessionStorage` sob uma chave por rota, restaura após montar (usa `requestAnimationFrame` pra esperar o layout).
- Nas três páginas: trocar os `useState` de filtros pelos hooks acima e chamar `useScrollRestoration("finance:<tela>")` no topo.
- Em `BankReconciliation`, envolver o `refetch` após salvar com `preserveScroll(async () => { await refetch(); })` (helper que memoriza e restaura o scroll).
- Não mexer em `ScrollToTop` global (se existir), porque ele deve continuar valendo para navegação normal — apenas essas três rotas restauram a última posição salva quando há uma.

## Fora do escopo

- Não vamos persistir filtros em URL (querystring) agora — sessionStorage já resolve. Se quiser links compartilháveis depois, dá pra migrar.
- Não vamos alterar lógica de cálculo, RLS ou edge functions.
