## (1) Fix 403 ForbiddenOrderAccess no fetch de detalhes + (2) Nova coluna "Pedido embalado"

### Parte 1 — Resolver o 403 do detail fetch

**Diagnóstico**
- Webhooks chegando em LAGO SUL (`ifood_environment=production`) vêm de `appName: iconnect_v3_homologation` (simulador iFood).
- O `getIfoodAccessToken("production")` usa as únicas envs configuradas (`IFOOD_CLIENT_ID`/`IFOOD_CLIENT_SECRET`), que hoje são **as de homologação** — daí o token volta válido mas sem escopo no merchant real → 403 na rota `/order/v1.0/orders/{id}`.
- Resultado: `orderDetails = null`, e o pedido entra no banco zerado (sem `displayId`, sem cliente, sem itens, sem total). Mesma causa do toast `iFood confirm falhou 403`.

**Estratégia (sem mexer na homologação ativa)**
1. Em `supabase/functions/ifood-webhook/index.ts`:
   - Detectar payloads de homologação pelo `metadata.appName`/`CLIENT_ID` contendo `homologation`.
   - Quando for homologação, forçar `env = "sandbox"` no `getToken()` independente do `store.ifood_environment` (só para o detail fetch e ações subsequentes desse evento).
   - Logar explicitamente quando o detail fetch falhar (status + body) numa tabela leve de auditoria — usar `pdv_ifood_failed_events` que já existe (`error` com `detail_fetch_403:<body>`), em vez de engolir silenciosamente.
   - Não criar `pdv_orders` "vazio" se o detail fetch falhar: registrar em `pdv_ifood_failed_events` e retornar 200 para o iFood retentar (ou esperar próximo evento). Isso evita lixo no kanban com hex no número.
2. Aplicar a mesma detecção em `supabase/functions/ifood-poll/index.ts`.
3. Mesma lógica para o endpoint `confirm` (ou onde a edge `ifood-action` faz POST de confirmação) — se o evento original veio de `iconnect_v3_homologation`, usar token sandbox.

**Fallback de UI**
- Em `src/pages/PdvNovo.tsx`, trocar `id.slice(0, 4)` por `"—"` nos 4 pontos que exibem o número do pedido. Assim, se algum pedido vier sem `displayId`, não aparece hex.

### Parte 2 — Coluna interna "Pedido embalado"

**Requisito**
- Nova coluna entre **Em produção** e **Pronto p/ retirada**, **somente interna** (não muda status do iFood, não dispara confirm/dispatch/etc.).
- Pedido recém-chegado: vai direto pra "Em produção" (já implementado com auto-accept).
- Operador clica "Embalar" → cartão pula pra "Pedido embalado".
- Em "Pedido embalado", botão "Pronto p/ retirada" abre o checklist atual (`READY_CHECKLIST`) e segue o fluxo iFood normal (status → `ready`).

**Modelo de dados** (migration)
- Adicionar coluna `packed_at TIMESTAMPTZ NULL` em `public.pdv_orders`.
- Sem alterar o enum de status, sem RLS nova (herda da tabela).

**Mudanças em `src/pages/PdvNovo.tsx`**
1. Adicionar `packed_at?: string | null` no tipo `Order`. Incluir em todos os `.select(...)` (operação e histórico).
2. Criar novo conceito de "coluna virtual" no kanban — `ALL_COLUMNS` ganha:
   ```
   { key: "embalado", label: "Pedido embalado",
     statuses: ["preparing"], // filtro extra: packed_at IS NOT NULL
     nextLabel: "Pronto p/ retirada", nextTo: "ready" }
   ```
   E ajustar a coluna "Em produção" para:
   ```
   statuses: ["placed","confirmed","preparing"] (com packed_at IS NULL) ...
   ```
3. Trocar a partição de `ordersByColumn` para um predicado por coluna (não só `statuses.includes`), reconhecendo `packed_at`:
   - "produção": status ∈ {placed,confirmed,preparing} AND `packed_at == null`
   - "embalado": status == "preparing" AND `packed_at != null`
   - demais colunas inalteradas.
4. Ajustar `colIdx` na renderização de cada card pela mesma regra.
5. Novo botão "Embalar" na coluna "Em produção": `UPDATE pdv_orders SET packed_at = now() WHERE id = $1` (via `supabase.from("pdv_orders").update(...)`), sem chamar `advanceStatus` nem `pdv_advance_order_status`. Refresh local + realtime já cuida.
6. Botão da coluna "Pedido embalado" usa o fluxo existente do checklist (`setReadyChecklistOrder(o)`) — mesmo comportamento da coluna "produção" hoje.
7. Atualizar contadores do header e a paleta `headerCls/accentCls` da nova coluna usando tokens do design system (sem cores Tailwind hardcoded — provavelmente `bg-secondary text-secondary-foreground` ou similar, alinhado com o resto).

**Impressão / iFood**
- Nenhuma alteração em `routePrintOrder`, `advanceStatus`, `pdv_advance_order_status`, webhook, poll ou ações iFood. O campo `packed_at` é puramente visual.

### Resultado
- Pedidos do iFood param de aparecer com número hex; quando vierem da homologação, o detail fetch usa o token correto.
- Operação ganha o passo de embalagem sem poluir nem atrasar nada no iFood.
