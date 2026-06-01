
# Integração de entrega motoboy — Lalamove + Uber Direct (adapter)

## Escopo
- **Somente pedidos do canal WhatsApp** (`pdv_orders.source='whatsapp'`). iFood continua com logística própria do iFood; Totem/Salão não despacham motoboy.
- Dois provedores plugáveis: **Lalamove** e **Uber Direct**, escolhidos por chaveamento (manual por loja, ou cotação automática "o mais barato").
- Arquitetura espelha o que já fizemos no TEF (`SiTef / PayGo / Mock`) — adapter pattern, fácil de adicionar Borzo/Loggi depois.

## Arquitetura

```text
WhatsApp bot confirma pedido
        │
        ▼
pdv_orders (source='whatsapp', status='confirmed')
        │
        ▼
edge: delivery-dispatch  ──►  DeliveryAdapter
                                ├─ LalamoveAdapter   (gateway HTTP/HMAC)
                                ├─ UberDirectAdapter (OAuth2 + REST)
                                └─ MockAdapter       (dev/teste)
        │
        ├─► cria corrida, salva tracking_id
        ▼
delivery_jobs (status, provider, fee, tracking_url, motoboy_name…)
        │
        ▼
edge: delivery-webhook  ◄── push de status dos provedores
        │
        ▼
pdv_orders.delivery_status atualizado + notificação no app
```

## Banco de dados

**Novas tabelas:**
- `delivery_provider_config` — `store_id`, `provider` (`lalamove`|`uber_direct`), `is_active`, `priority` (1=primário, 2=fallback), `credentials_ref` (qual secret usar), `service_type` (motorcycle, etc.), `pickup_address` (jsonb cacheado).
- `delivery_jobs` — `id`, `order_id` (FK `pdv_orders`), `provider`, `provider_quote_id`, `provider_order_id`, `status` (`quoted|requested|assigned|picked_up|delivered|cancelled|failed`), `fee_cents`, `eta_minutes`, `driver_name`, `driver_phone`, `tracking_url`, `created_at`, `updated_at`, `raw_payload` (jsonb).
- `delivery_job_events` — log bruto de eventos (auditoria), `job_id`, `event_type`, `payload`, `received_at`.

**Em `pdv_orders`** (já existe): garantir colunas `delivery_status`, `delivery_provider`, `delivery_fee_cents`, `delivery_tracking_url` (criar se faltarem).

## Edge functions

1. **`delivery-quote`** — recebe `order_id`, consulta cotação nos provedores ativos da loja, retorna lista ordenada por preço/ETA. Usado pelo bot WhatsApp pra decidir/mostrar preço ao cliente antes de confirmar.
2. **`delivery-dispatch`** — cria a corrida no provedor escolhido (ou no primário), grava `delivery_jobs`, atualiza `pdv_orders`.
3. **`delivery-cancel`** — cancela corrida (se ainda permitido pelo provedor).
4. **`delivery-webhook-lalamove`** — recebe push da Lalamove (valida HMAC), atualiza `delivery_jobs`.
5. **`delivery-webhook-uber`** — recebe push da Uber Direct (valida assinatura), idem.
6. **`_shared/delivery/adapter.ts`** — interface comum: `quote()`, `createOrder()`, `cancel()`, `getStatus()`.
7. **`_shared/delivery/lalamove.ts`** + **`_shared/delivery/uberDirect.ts`** — implementações.

## Secrets (via `add_secret` quando você tiver as credenciais)

**Lalamove:**
- `LALAMOVE_API_KEY`
- `LALAMOVE_API_SECRET` (pra assinar HMAC)
- `LALAMOVE_MARKET` (`BR`)

**Uber Direct:**
- `UBER_DIRECT_CLIENT_ID`
- `UBER_DIRECT_CLIENT_SECRET`
- `UBER_DIRECT_CUSTOMER_ID`

## Estratégia de chaveamento

Configurável por loja em `/configuracoes/entregas`:

1. **Manual fixo** — sempre Lalamove, ou sempre Uber.
2. **Primário + fallback** — tenta primário; se falhar/sem motoboy, tenta o secundário.
3. **Cotação automática** — chama os dois, pega o mais barato (ou mais rápido, configurável).

Default sugerido: **primário Lalamove + fallback Uber Direct** (Lalamove costuma ser mais barato em BSB; Uber tem mais cobertura quando Lalamove falha).

## UI

**`/configuracoes/entregas`** (admin):
- Por loja: seletor de estratégia, ordem de prioridade, toggle on/off por provedor.
- Endereço de coleta (autopreenche de `stores`, editável).
- Teste de cotação (digita CEP destino, mostra preço/ETA dos dois provedores).
- Lista de últimas 50 corridas com status, motoboy, valor.

**No bot WhatsApp** (ajuste no `whatsapp-customer-ai-reply`):
- Nova tool `quote_delivery(address)` que chama `delivery-quote`.
- IA mostra ao cliente: "Frete R$ 12,50 — ETA 35min. Confirma?"
- Ao confirmar pagamento, dispara `delivery-dispatch` automaticamente.

**No `/pdv-novo`** (KDS futuro):
- Card do pedido WhatsApp mostra status da entrega (`Procurando motoboy → A caminho → Entregue`) e link de tracking.

## Pré-requisitos BLOQUEANTES

Não tenho como ligar nenhum dos dois agora. Você precisa antes:

1. **Lalamove** — cadastro em [partner.lalamove.com](https://partner.lalamove.com), aprovação como parceiro business, credenciais de produção (e sandbox pra teste).
2. **Uber Direct** — cadastro em [merchants.ubereats.com/manager](https://merchants.ubereats.com/manager) ou contato com o time Direct Brasil; eles liberam OAuth credentials.
3. **Endereço de coleta validado** das 4 lojas (latitude/longitude precisas — provedores cobram por distância exata).

Enquanto não chegar, posso construir com **MockAdapter** retornando cotações falsas — útil pra desenvolver o fluxo WhatsApp ponta a ponta sem gastar dinheiro real em testes.

## Fases de entrega

**Fase 0 — Andaime (~2h, sem credencial)**
- Migration das tabelas `delivery_*`.
- Edge functions com MockAdapter funcional (cotação fake, status simulado).
- Página `/configuracoes/entregas` básica.
- Integração no bot WhatsApp com tool `quote_delivery`.

**Fase 1 — Lalamove (~3h, quando credencial chegar)**
- LalamoveAdapter real (HMAC, endpoints v3).
- Webhook de status.
- Teste sandbox → produção.

**Fase 2 — Uber Direct (~3h)**
- UberDirectAdapter real (OAuth2 + REST).
- Webhook.
- Lógica de chaveamento/cotação automática.

**Fase 3 — Polimento**
- Métricas (taxa de aceite, tempo médio, custo médio por provedor por loja).
- Alertas se motoboy demorar > X min pra ser atribuído.

## Fora de escopo
- iFood (mantém logística própria).
- Salão/Totem (não despacham).
- Roteirização de motoboy próprio (caso queira no futuro: avaliar Borzo/OnFleet).
- Pagamento separado do frete pelo cliente — frete entra no total do pedido WhatsApp.

## Riscos
- **Cobertura Lago Sul** pode ser irregular em ambos os provedores fora do horário de pico.
- **Preço dinâmico** — frete cotado pode mudar entre cotação e confirmação (mitigar: dispatch em ≤2min após cotação, ou cobrar do cliente o valor do dispatch real).
- **Cancelamento pós-coleta** — provedores cobram mesmo se cliente cancelar; precisa lógica clara de quem absorve.
- **LGPD** — endereço/telefone do cliente vai pro provedor; já está coberto no aviso inicial do bot.

## Decisão
Posso começar pela **Fase 0 (andaime + MockAdapter)** agora pra você ir testando o fluxo WhatsApp completo, ou prefere esperar ter ao menos uma das credenciais (Lalamove é mais rápido de conseguir) pra ir direto na Fase 1?
