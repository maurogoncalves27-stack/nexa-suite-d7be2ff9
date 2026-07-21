
# Integração Yolo Club ↔ NEXA Suite

## Contexto

Cliente compra no app Yolo Club um **código promocional** que dá direito a **desconto** (ou combo especial) em compras no restaurante parceiro. Hoje esse resgate é manual — queremos que o cliente digite o código no **Totem** ou o garçom aplique no **NEXA Garçom**, e o NEXA valide **automaticamente** via API da Yolo em tempo real.

## O que precisamos do dev da Yolo (spec técnica pra enviar pra eles)

Precisamos de **2 endpoints REST + 1 webhook opcional**, protegidos por API key/OAuth. Modelo padrão de mercado (igual iFood/Rappi voucher):

### 1) `POST /vouchers/validate` — valida o código sem consumir

**Objetivo:** quando o cliente digita o código no totem, checamos se é válido **antes** de aplicar o desconto no carrinho.

Request:
```json
{
  "code": "YOLO-ABC123",
  "partner_id": "aquela-parme",
  "store_id": "asa-sul",           // qual loja tá validando
  "channel": "totem" | "online",
  "cart_total_cents": 8500          // opcional, pra validar valor mínimo
}
```

Response 200 (válido):
```json
{
  "valid": true,
  "voucher_id": "vch_9f2a...",       // ID interno da Yolo (usaremos no redeem)
  "customer": { "name": "João", "phone_masked": "***9988" },
  "benefit": {
    "type": "percent" | "fixed" | "combo",
    "value": 15,                     // 15% OU 1500 centavos OU id do combo
    "applies_to": "cart" | "items",
    "eligible_skus": ["PARM-001"],   // se items
    "min_cart_cents": 5000,
    "max_discount_cents": 3000
  },
  "expires_at": "2026-08-01T23:59:59Z",
  "single_use": true
}
```

Response 4xx (com motivo legível pro cliente):
```json
{ "valid": false, "reason": "expired" | "already_used" | "not_found" | "min_cart_not_met" | "wrong_store", "message": "Cupom já utilizado" }
```

### 2) `POST /vouchers/redeem` — confirma o consumo

Chamado **depois** que o pedido é fechado/pago no PDV. Idempotente por `order_id`.

Request:
```json
{
  "voucher_id": "vch_9f2a...",
  "code": "YOLO-ABC123",
  "partner_id": "aquela-parme",
  "store_id": "asa-sul",
  "order_id": "nexa-ord-12345",      // idempotency key
  "order_total_cents": 8500,
  "discount_applied_cents": 1275,
  "redeemed_at": "2026-07-21T14:32:00Z"
}
```

Response 200: `{ "redeemed": true, "voucher_id": "vch_9f2a..." }`
Response 409: `{ "redeemed": false, "reason": "already_redeemed" }`

### 3) (Opcional) `POST /vouchers/void` — estorna se pedido foi cancelado

Mesmo payload do redeem + `reason`. Libera o cupom pra ser usado de novo, ou registra estorno.

### 4) (Opcional) Webhook Yolo → NEXA

Quando a Yolo emite/cancela um voucher, notifica: `POST https://<nossa-edge>/yolo-webhook` com HMAC-SHA256 no header `X-Yolo-Signature`. Útil pra sincronizar campanhas mas **não é bloqueante** — o fluxo síncrono acima já resolve.

### Autenticação
- `Authorization: Bearer <YOLO_API_KEY>` (uma key por parceiro)
- Base URL sandbox + prod separadas
- Rate limit informado no header

---

## O que a gente vai construir no NEXA

### Backend (Lovable Cloud)
- Tabelas novas:
  - `yolo_vouchers_used` — log de cada validate/redeem (voucher_id, code, order_id, store_id, benefit_snapshot, status, timestamps) pra auditoria e não pagar cupom em duplicidade offline.
  - `yolo_config` — API key, base URL, partner_id, mapping store_id NEXA → store_id Yolo. Editável em `/configuracoes/integracoes/yolo`.
- 3 edge functions (chamam a API da Yolo com a secret `YOLO_API_KEY`):
  - `yolo-validate` — proxy pro `/vouchers/validate`
  - `yolo-redeem` — chamado no fechamento do pedido, idempotente por `order_id`
  - `yolo-void` — chamado se o pedido for cancelado (integrado ao fluxo de cancelamento do PDV)

### Frontend — Totem (`electron-totem` / `/totem`)
- Novo passo antes do pagamento: **"Tem cupom Yolo?"** → campo de código + teclado on-screen
- Chama `yolo-validate` → mostra benefício aplicado no carrinho
- No fechamento chama `yolo-redeem` com o `order_id` da NFC-e
- Se pagamento falhar, chama `yolo-void`

### Frontend — Garçom (`/garcom`)
- Botão **"Aplicar Yolo"** na comanda da mesa
- Mesmo fluxo: validate → aplica desconto na rodada → redeem no fechamento
- Se garçom cancelar item/rodada com Yolo aplicado, chama `void`

### Frontend — Online (quando existir e-commerce/link de pedido)
- Mesmo campo de cupom, mesma edge function `yolo-validate/redeem`

### Segurança
- API key da Yolo **só** na secret `YOLO_API_KEY` (nunca no client)
- Toda chamada passa pelas nossas edge functions (nunca do browser direto pra Yolo)
- Idempotency por `order_id` evita duplo desconto se o totem travar e reenviar
- Log completo em `yolo_vouchers_used` pra conciliação mensal com relatório da Yolo

---

## Detalhes técnicos (pra passar pro dev deles)

Resumo curto do que pedimos:
1. **REST JSON**, HTTPS, Bearer token por parceiro
2. Endpoints: `POST /vouchers/validate`, `POST /vouchers/redeem`, `POST /vouchers/void`
3. **Idempotência** no redeem via `order_id` (parceiro fornece)
4. Códigos de erro semânticos (`expired`, `already_used`, `not_found`, `min_cart_not_met`, `wrong_store`)
5. Ambientes **sandbox + produção** separados com credenciais distintas
6. Doc OpenAPI/Swagger e uns 5 códigos de teste no sandbox pra homologarmos
7. (Bônus) Webhook assinado com HMAC pra eventos de emissão/cancelamento

Com isso a gente entrega totem + garçom validando Yolo em ~1 sprint.

---

## Fora de escopo desta fase
- Emissão de vouchers pelo NEXA (continua na Yolo)
- Cashback pós-compra (só se a Yolo pedir explicitamente via webhook de `order.completed`)
- Integração no PDV físico do balcão (`/pdv-novo`) — dá pra incluir depois com o mesmo backend, só falta o botão na UI
