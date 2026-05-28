## Objetivo
Mostrar um ícone vermelho piscando no card do pedido sempre que houver mensagem de chat iFood não lida. Por ora, sem integração real — apenas a camada de UI controlada por uma flag, pronta para receber dados reais depois da homologação iFood.

## O que muda

### 1. Flag de não-lida (mock)
- Adicionar coluna opcional `has_unread_chat boolean default false` em `public.pdv_orders` (migration).
- Carregar o campo no `Order` em `src/pages/PdvNovo.tsx` (junto com os demais selects existentes).
- Realtime já cobre updates de `pdv_orders`, então mudar a flag no banco reflete no card instantaneamente.

### 2. Ícone piscando no card (kanban /loja e /pdv-novo)
- Em `src/pages/PdvNovo.tsx`, dentro do card ativo (bloco do número do pedido na coluna corrente), renderizar ao lado do número um `MessageCircle` da lucide quando `o.has_unread_chat === true`:
  - cor `text-destructive`
  - animação: usar `animate-pulse` do Tailwind (já disponível) com badge pequeno circular `bg-destructive` atrás do ícone para reforçar
  - `title="Cliente enviou mensagem no chat do iFood"`
- Não aparece em cards finalizados (concluded/cancelled).
- Tokens do design system apenas (`destructive`), seguindo a regra de identidade visual.

### 3. Indicador no detalhe do pedido
- No dialog de detalhes (`selectedOrder`), exibir um aviso discreto no topo: `MessageCircle` vermelho + texto "Mensagem do cliente no chat do iFood — abra o app do iFood para responder".
- Botão "Marcar como lida" que faz `update pdv_orders set has_unread_chat=false where id=...`. Isso para o piscar.

### 4. Preparação para integração real (sem implementar agora)
- Comentário `// TODO iFood Chat:` nas funções `ifood-poll` e `ifood-webhook` apontando onde, no futuro, ao receber evento de chat, devemos `update pdv_orders set has_unread_chat=true` pelo `external_order_id`.
- Nada de polling/edge novo agora.

## Arquivos afetados
- `supabase/migrations/<novo>.sql` — adiciona coluna `has_unread_chat` (default false, NOT NULL).
- `src/pages/PdvNovo.tsx` — tipo `Order`, render do card (linha do número) e do dialog de detalhes; ação "Marcar como lida".
- `supabase/functions/ifood-poll/index.ts` e `supabase/functions/ifood-webhook/index.ts` — apenas comentários TODO indicando o ponto de integração.

## Fora de escopo (explicitamente adiado)
- Consumir API de chat do iFood (polling/webhook real).
- Tela de conversa / envio de mensagens dentro do NEXA.
- Notificação sonora ou push para o chat.

## Como testar (com mock)
1. Rodar `update public.pdv_orders set has_unread_chat=true where id='<id de um pedido ativo>'` no SQL.
2. Card do pedido em /loja deve passar a piscar com o ícone vermelho de mensagem ao lado do número.
3. Abrir o detalhe, clicar "Marcar como lida" — o ícone para de piscar (flag volta a false).
