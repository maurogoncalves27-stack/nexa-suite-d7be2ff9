## Objetivo
Reunir em **uma única página** (`/configuracoes/alertas`) todos os alertas do sistema, com switches para ligar/desligar **Push** e **WhatsApp** por tipo de alerta, e permitir cadastrar **múltiplos remetentes de WhatsApp** e escolher qual número dispara cada alerta.

## Alertas mapeados (categorias em uso hoje)
- **RH / Pessoas**: `timeclock` (atraso ponto CLT+freela), `hr` (RH geral), `announcement` (avisos), `payslip` (holerite), `schedule` (escala/férias), `appointment` (lembrete de consulta médica), `mental_health` (follow-up humor)
- **Operacional**: `occurrence` (ocorrências), `network` (WAN offline), `temperature` (EMS), `delivery` (motoboy)
- **PDV / Cliente**: `customer_complaint` (WhatsApp cliente), `giana_feedback`, `candidate_message` (recrutamento)

Cada categoria vira uma linha na página com: nome, descrição, switch **Push**, switch **WhatsApp**, select de **Remetente WhatsApp**.

## Estrutura

### Tabelas novas
1. `notification_settings` — 1 linha por `alert_key` com `push_enabled`, `whatsapp_enabled`, `whatsapp_sender_id`.
2. `whatsapp_senders` — `label`, `phone_display`, `zapi_instance_id`, `zapi_token`, `zapi_client_token`, `is_default`, `active`. Somente **admin** lê/escreve (RLS via `has_role`). Credenciais nunca vão pro browser em texto claro fora da tela de edição.

### Backend
- `send-whatsapp`: passa a aceitar `sender_id` opcional; se vier, busca credenciais em `whatsapp_senders`; senão usa o **default** da tabela; fallback final para as env vars atuais (Z-API). Nenhum código existente quebra.
- `notify-user`: antes de disparar push/WA, consulta `notification_settings` pela categoria; se `push_enabled=false` pula push; se `whatsapp_enabled=false` pula WA; passa `sender_id` configurado.

### Frontend
- Nova página `src/pages/NotificationSettings.tsx` acessível em `/configuracoes/alertas`.
- Botão "Alertas e notificações" na tela `Settings.tsx`.
- Item "Alertas e notificações" no menu Configurações (`AppSidebar` já usa link direto — adiciono botão em `Settings.tsx`).
- Atualizo `PAGE_TITLES` em `AppLayout.tsx`.

## Fora de escopo
- Não altero o fluxo do WhatsApp **cliente** (SAC) — segue com sua própria config em `whatsapp_customer_config`.
- Sem novas categorias de alerta agora; só reúne as existentes.

Posso seguir?