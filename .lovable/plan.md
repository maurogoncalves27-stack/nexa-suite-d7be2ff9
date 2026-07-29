## Objetivo
Na aba de conversas do CRM (`src/pages/CRM.tsx`), em vez de uma linha por conversa, mostrar uma linha por **cliente**, com as conversas daquele cliente agrupadas em sanfona.

## Como agrupar
Chave do cliente, nesta ordem:
1. Telefone normalizado (`pickClientPhone`) — casando também por sufixo (últimos 8 dígitos) para tolerar variações de DDI/DDD.
2. Se não houver telefone: nome do cliente normalizado (minúsculo, sem acentos), quando for um nome válido.
3. Caso contrário: a própria conversa vira um grupo de 1 (sem telefone nem nome não dá para afirmar que é o mesmo cliente).

## Comportamento da lista
- Linha do grupo: nome do cliente (o mais completo entre as conversas), telefone com link WhatsApp, prévia da última mensagem, total de mensagens somado, data da última mensagem do grupo, badges agregados (tickets, reservas, severidade mais alta, "revisada" só se todas estiverem arquivadas) e um contador `Nx conversas`.
- Grupo com 1 conversa: comporta-se exatamente como hoje (clique abre o modal direto).
- Grupo com 2+ conversas: chevron expande e lista as conversas individuais (data + prévia + badges), cada uma abrindo o modal da conversa ao clicar.
- Ordenação dos grupos pela última mensagem mais recente; dentro do grupo, mais recente primeiro.
- Busca e filtros (issue/arquivadas) continuam aplicados às conversas antes do agrupamento; um grupo aparece se qualquer conversa dele passar no filtro.
- Excluir/arquivar continuam por conversa (dentro do grupo/modal), sem ação em massa.

## Técnico
- Mudança apenas de apresentação em `src/pages/CRM.tsx`: novo `useMemo` `groupedConversations` derivado de `visibleConversations`, e estado `expandedGroups: Set<string>`.
- Sem alteração de banco, edge functions ou lógica da Giana.
- Mobile-first: manter colunas atuais (Prévia segue oculta no mobile) e recuo/indent leve nas linhas filhas.
