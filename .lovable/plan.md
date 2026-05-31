# Bot WhatsApp do Cliente — SAC + Pedidos com IA

Canal de atendimento automatizado por WhatsApp, separado do canal de notificações internas. IA conversa de forma natural, tira dúvidas, monta pedido e envia link de pagamento Pix. Sem inbox humano nesta fase.

## Decisões já tomadas

- **Provider**: Z-API (mesmo já configurado para notificações), mas **instância nova** com chip dedicado ao cliente. Migração futura para Meta Cloud quando aprovado.
- **Tom**: IA livre via Lovable AI Gateway (`google/gemini-3-flash-preview` por padrão — rápido e barato).
- **Sem handoff humano** nesta fase. Se a IA não souber resolver, ela orienta a ligar ou tentar de novo.
- **Pagamento**: link Pix gerado via TEF/C6 (conta centralizada já existe) ou “pagar na entrega”.
- **Escopo inicial**: 1 loja piloto (sugestão: Asa Sul). Replicar depois.

## Fluxos suportados

**SAC**
- Horário de funcionamento, endereço, telefone, formas de pagamento.
- Cardápio (link ou texto resumido).
- Status de pedido em andamento (consulta por nome/telefone).
- Reclamação simples (registra em tabela e responde com prazo de retorno).

**Pedido**
1. Cliente: “quero um parmê de frango”.
2. IA consulta cardápio (function call `search_menu`), confirma item, sugere acompanhamentos.
3. Monta carrinho na conversa, mostra subtotal.
4. Pede endereço e forma de pagamento.
5. Gera link Pix (function call `create_pix_payment`) ou marca “pagar na entrega”.
6. Cria pedido no sistema (`pdv_orders` com `origin='whatsapp'`), notifica KDS futuro.
7. Envia confirmação e prazo estimado.

## Arquitetura

```text
Cliente WhatsApp
       │
       ▼
  Z-API (instância CLIENTE)
       │ webhook on-message
       ▼
edge: whatsapp-webhook  ──► salva em whatsapp_conversations / whatsapp_messages
       │
       ▼
edge: whatsapp-ai-reply ──► Lovable AI Gateway (gemini-3-flash)
       │                      ├─ tool: search_menu
       │                      ├─ tool: get_store_info
       │                      ├─ tool: check_order_status
       │                      ├─ tool: create_order (draft)
       │                      ├─ tool: create_pix_payment
       │                      └─ tool: register_complaint
       ▼
  Z-API send-text  ──► Cliente
```

## Banco de dados (novas tabelas)

- `whatsapp_customer_conversations` — id, phone (E.164), customer_name, store_id, status (`active|idle|closed`), last_message_at, context_summary (resumo curto pra IA economizar tokens).
- `whatsapp_customer_messages` — id, conversation_id, role (`user|assistant|tool`), content, tool_name, tool_args, tool_result, created_at.
- `whatsapp_customer_orders_draft` — id, conversation_id, items (jsonb), address (jsonb), payment_method, total, status (`drafting|awaiting_payment|confirmed|cancelled`), pdv_order_id (FK quando confirmado).
- `whatsapp_customer_complaints` — id, conversation_id, phone, message, status, created_at.

Todas com RLS: admin/atendente leem tudo da loja; cliente final não tem acesso (não logado).

## Edge functions

1. **`whatsapp-webhook`** (público, sem JWT)
   - Recebe POST da Z-API a cada mensagem recebida.
   - Identifica/cria conversa por `phone`.
   - Salva mensagem do cliente.
   - Dispara `whatsapp-ai-reply` em background.

2. **`whatsapp-ai-reply`** (interno)
   - Carrega últimas 20 mensagens + `context_summary`.
   - Chama Lovable AI Gateway com system prompt + tools (function calling).
   - Loop de tool calls até resposta final (máx 5 iterações pra não estourar).
   - Envia resposta via Z-API.
   - A cada 10 mensagens, resume conversa em `context_summary` (economia de tokens).

3. **Tools chamáveis pela IA** (implementadas dentro da própria edge):
   - `search_menu(query, store_id)` → consulta `pdv_categories`/`pdv_items` ativos da loja.
   - `get_store_info(store_id)` → horário, endereço, formas de pagamento.
   - `check_order_status(phone)` → última `pdv_orders` do telefone.
   - `create_order_draft(items, address, payment_method)` → grava em `whatsapp_customer_orders_draft`.
   - `create_pix_payment(draft_id)` → gera link Pix (mock na Fase 1, integração real C6 na Fase 2).
   - `register_complaint(message)` → grava em `whatsapp_customer_complaints`.
   - `confirm_order(draft_id)` → cria `pdv_orders` real e marca draft como confirmado.

## UI admin (NEXA Gestor)

Página **`/configuracoes/whatsapp-cliente`** (só admin):
- Toggle on/off do bot por loja.
- Configuração: prompt do sistema (editável), horário de atendimento, mensagem fora do horário.
- Lista de conversas recentes (últimas 50) com prévia.
- Visualização de uma conversa (read-only, tipo chat).
- Estatísticas: nº conversas/dia, nº pedidos gerados, ticket médio, taxa de conversão.
- Lista de reclamações pendentes.

Sidebar: novo item em **Configurações → WhatsApp Cliente** (separado do existente “WhatsApp” que é o de notificações internas).

## Segurança e proteção

- Rate limit por número: máx 30 msgs/min (anti-spam/loop).
- Lista de bloqueio: tabela `whatsapp_blocked_numbers` (admin pode banir).
- Filtro de conteúdo: se a IA detectar tentativa de jailbreak/abuso, responde mensagem genérica e sinaliza para revisão.
- LGPD: aviso na primeira mensagem (“Esta conversa é processada por IA e armazenada para melhoria do atendimento”).

## Fases de entrega

**Fase 1 — MVP SAC (sem pedido)** ~1 dia
- Tabelas, webhook, IA respondendo dúvidas (horário/endereço/cardápio em texto).
- Painel admin básico de conversas.
- Sem geração de pedido. Cliente é direcionado pro iFood/telefone se quiser pedir.

**Fase 2 — Pedido com pagamento na entrega** ~1 dia
- Tools de cardápio + criar pedido.
- Pedido cai em `pdv_orders` com pagamento “na entrega”.
- Sem Pix ainda.

**Fase 3 — Pix integrado** ~1 dia
- Geração de cobrança Pix C6.
- Webhook de confirmação de pagamento.
- Pedido só vira “confirmado” após Pix pago.

**Fase 4 — Polimento**
- Resumo automático de contexto.
- Métricas/dashboard.
- Migração para Meta Cloud quando aprovado.

## Riscos

- **Ban do chip**: chip novo + volume de atendimento aumenta risco. Acelerar Meta Cloud assim que possível.
- **IA inventar item/preço**: mitigado por function calling — IA não fala preço sem chamar `search_menu` (instrução forte no system prompt).
- **Custo Lovable AI**: cada conversa consome créditos. Estimar ~R$0,01-0,05 por conversa com Gemini Flash. Monitorar no admin.
- **Conflito com canal de notificações**: chip e instância Z-API totalmente separados — sem risco de mistura.

## O que preciso de você antes de começar

1. **Chip novo** ativo no WhatsApp (número exclusivo do atendimento ao cliente).
2. **Nova instância Z-API** criada com esse chip (não reutilizar a de notificações). Vou precisar dos 3 valores novos: `ZAPI_CUSTOMER_INSTANCE_ID`, `ZAPI_CUSTOMER_TOKEN`, `ZAPI_CUSTOMER_CLIENT_TOKEN`.
3. **Loja piloto**: confirma Asa Sul ou prefere outra?
4. **Cardápio**: posso usar o que já está em `pdv_items` da loja escolhida, ou prefere um cardápio simplificado/separado pro WhatsApp?

Assim que aprovar, começo pela Fase 1 (SAC).