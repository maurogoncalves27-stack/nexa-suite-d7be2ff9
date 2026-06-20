## Objetivo
Adicionar ação **Confirmar** em cada linha da aba *Reservas* do CRM (`/crm`). Ao clicar:
1. Status local `parme_reservations.status = 'confirmed'`.
2. PATCH no Parmê (`/api/public/reservations/:id`) para refletir lá.
3. Envia WhatsApp automático ao cliente pela instância Z-API **Cliente** (mesma já usada em `whatsapp-customer-ai-reply`).

## UI — `src/pages/CRM.tsx`
- Nova coluna/ação na tabela de reservas: botão `CheckCircle2` verde ao lado do lixeira, escondido quando `status === 'confirmed' | 'cancelled'`.
- AlertDialog "Confirmar reserva?" mostrando preview da mensagem (read-only) com nome, data, hora e party_size.
- Handler `handleConfirmReservation(parmeId)` → `supabase.functions.invoke("parme-confirm-reservation", { body: { parme_id } })`.
- Toasts: loading / sucesso ("Reserva confirmada e WhatsApp enviado") / warning se Parmê ainda não tiver PATCH público (`parme_endpoint_unavailable`) / warning se WhatsApp falhar mas status confirmado (`whatsapp_failed`).
- Badge de status ganha cor: `confirmed` → verde, `cancelled` → destrutivo, demais → outline.

## Edge function nova — `supabase/functions/parme-confirm-reservation/index.ts`
- Valida JWT (`supabase.auth.getClaims`) + CORS via `npm:@supabase/supabase-js@2/cors`.
- Body: `{ parme_id: string }` (Zod).
- Busca a reserva local (service_role) para obter `name/phone/reservation_date/reservation_time/party_size`.
- `PATCH https://parme.lovable.app/api/public/reservations/:parme_id` com `X-Consumer-Id/Secret` e `{ status: "confirmed" }`.
  - 404/HTML → responde `{ error: "parme_endpoint_unavailable" }` (503) e **não** confirma local (mesma semântica do delete).
  - 2xx → segue.
- `UPDATE parme_reservations SET status='confirmed', updated_at=now() WHERE parme_id=?`.
- Monta mensagem padrão em PT-BR:
  > Olá {nome}! Sua reserva no Aquela Parmê está **confirmada** para {data} às {hora} para {n} pessoa(s). Qualquer mudança é só responder por aqui. 🍝
- Envia via Z-API **Cliente** usando `ZAPI_CUSTOMER_INSTANCE_ID / ZAPI_CUSTOMER_TOKEN / ZAPI_CUSTOMER_CLIENT_TOKEN` (já configurados). Normaliza telefone (E.164 BR, prefixo 55).
- Resposta: `{ ok: true, whatsapp_sent: boolean, whatsapp_error?: string }`. Falha de WhatsApp **não** reverte confirmação — UI mostra warning.
- Sem `verify_jwt = false` (default Lovable Cloud já cobre a chamada autenticada do app).

## Projeto Parmê (você precisa pedir lá)
Expor no projeto de origem:
```
PATCH /api/public/reservations/:id
Headers: X-Consumer-Id, X-Consumer-Secret
Body: { status: "confirmed" | "cancelled" | "pending" }
```
- Atualiza o registro e retorna 200 com a reserva.
- 404 se id inexistente; 401 se credenciais inválidas.
- (Análogo ao DELETE já implementado.)

## Sem mudanças de schema
`parme_reservations.status` já existe (TEXT). Nada de migration.

## Sem novos secrets
`ZAPI_CUSTOMER_*` e `PARME_CONSUMER_ID/SECRET` já estão no projeto (usados por `whatsapp-customer-ai-reply` e `parme-delete-reservation`).
