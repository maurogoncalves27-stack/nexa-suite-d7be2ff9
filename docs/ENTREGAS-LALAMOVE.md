# Entregas via Lalamove — pedidos com entrega pelo site (`/pedir`)

Configuração e homologação da entrega do e-commerce. O pedido é pago antes de
chegar na loja, e o pagamento aprovado aciona cozinha e motoboy no mesmo momento.

## Fluxo

| # | Etapa | Onde acontece |
|---|-------|---------------|
| 1 | Cliente monta a sacola e escolhe **Entrega** | `/pedir/:slug/carrinho` |
| 2 | CEP é resolvido em lat/lng e o frete é cotado | `geocode-address` → `delivery-quote` |
| 3 | Cliente paga no link do Mercado Pago | `ecommerce-checkout` (frete em `shipments.cost`) |
| 4 | Pagamento aprovado: pedido vira `confirmed` **e** a corrida é criada | `mercadopago-webhook` → `delivery-dispatch` |
| 5 | Loja prepara; motoboy chega no fim do preparo (`scheduleAt`) | PDV gestor |
| 6 | Coleta (`PICKED_UP`) → pedido `dispatched`; entrega (`COMPLETED`) → `concluded` | `delivery-webhook-lalamove` |
| 7 | Cliente avalia a entrega de 1 a 5 | `/pedir/avaliar/:id` |

O frete cobrado do cliente fica em `pdv_orders.delivery_fee`; o custo real pago
ao provedor fica em `delivery_jobs.fee_cents`. Os dois não se sobrescrevem.

## Secrets (Supabase → Edge Functions → Secrets)

| Secret | Valor | Observação |
|--------|-------|------------|
| `LALAMOVE_API_KEY` | chave do Partner Portal | por ambiente (sandbox ≠ produção) |
| `LALAMOVE_API_SECRET` | secret do Partner Portal | usado no HMAC-SHA256 |
| `LALAMOVE_MARKET` | `BR` | |
| `LALAMOVE_ENV` | `sandbox` ou `production` | define o host da API |
| `LALAMOVE_WEBHOOK_SECRET` | string aleatória sua | valida o push de status |
| `SITE_PUBLIC_ORIGIN` | ex. `https://pedir.aquelaparme.com.br` | monta os links de acompanhamento e avaliação |
| `DELIVERY_RATING_SECRET` | opcional | se ausente, o token de avaliação deriva da service role key |

## Webhook da Lalamove

O Partner Portal não envia headers customizados, então o secret vai na query
string da URL cadastrada:

```
https://<project>.supabase.co/functions/v1/delivery-webhook-lalamove?secret=<LALAMOVE_WEBHOOK_SECRET>
```

Sem `LALAMOVE_WEBHOOK_SECRET` configurado o endpoint responde `503` e não aceita
nenhum evento — proposital, para não processar push forjado.

## Configuração por loja

Em **Configurações → Entregas** (`/configuracoes/entregas`), com a loja selecionada:

1. **Provedores configurados**: adicione `lalamove`, prioridade `1`, e preencha o
   endereço de coleta **com latitude e longitude**. Sem coordenadas a cotação
   falha — a API v3 exige lat/lng em todos os stops.
2. **Tipos de serviço da Lalamove**: clique em *Consultar* para listar as cidades
   e os `serviceType` válidos da sua conta, e use um deles no provedor. Não
   assuma `MOTORCYCLE`: os valores variam por cidade.
3. **Canal do site**: ligue *Aceita entrega* só nas lojas piloto com provedor
   ativo. O card avisa se a entrega está ligada sem coleta geocodificada.
4. **Teste de cotação**: informe um CEP de destino; o teste resolve as
   coordenadas e cota igual ao checkout do site.

## Homologação end-to-end

1. Loja piloto com Lalamove sandbox ativo, coleta com lat/lng e
   `accepts_delivery = true`.
2. Em `/pedir/{slug}`, monte um pedido, escolha **Entrega**, informe um CEP real
   da cidade da loja e calcule o frete.
3. Pague com as credenciais de teste do Mercado Pago.
4. Verifique:
   - `pdv_orders`: `status = confirmed`, `order_type = delivery`, `delivery_fee`
     igual ao exibido no carrinho, `delivery_job_id` preenchido;
   - `delivery_jobs`: registro `requested` com `provider_order_id` e `tracking_url`;
   - `/pedir/pedido/{id}`: timeline de entrega e link de rastreio.
5. Avance a corrida no sandbox da Lalamove e confira que `PICKED_UP` leva o
   pedido a `dispatched` e `COMPLETED` a `concluded`, com o convite de avaliação
   no WhatsApp.
6. Avalie em `/pedir/avaliar/{id}` e confirme o registro em `delivery_ratings`.

**Sem credencial Lalamove:** configure o provedor `mock` como ativo e prioridade
`1`. Todo o fluxo roda ponta a ponta com frete simulado, exceto os webhooks de
status (que precisam ser simulados via `curl` no endpoint com o secret).

## Falhas e retentativa

Falha ao criar a corrida **nunca** invalida o pagamento. O webhook registra:

- `delivery_jobs` com `status = failed` e `error_message`;
- `pdv_order_events` com `delivery.dispatch_failed`.

A loja despacha manualmente pelo painel de entregas. Como `delivery_job_id`
segue nulo no pedido, uma nova tentativa não é bloqueada pela idempotência.
Corrida cancelada ou expirada também não cancela o pedido pago: fica o evento
para a loja reagir.
