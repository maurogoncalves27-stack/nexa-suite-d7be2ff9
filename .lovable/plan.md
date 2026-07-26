## Objetivo

Simplificar a manutenção: colaborador abre igual hoje (foto opcional). Gestor recebe alerta por **WhatsApp** + banner na **Área do Gestor** (não mais no sino). No banner o gestor tem **campo de observação opcional + botão "Resolver"** em 1 clique, e o histórico é gravado igual hoje.

## Mudanças

### 1. Abertura (colaborador) — sem mudança
`NutriMaintenanceControl.tsx` já suporta foto opcional. Fluxo mantido.

### 2. Alerta WhatsApp para gestor (novo)
- Nova edge function `supabase/functions/notify-maintenance-request/index.ts`.
- Recebe `request_id`, carrega chamado + loja + solicitante.
- Busca gestores/admins via `user_roles` + `employees` (telefone e loja).
- Filtra: só gestores da loja do chamado (admin sem loja recebe tudo). Respeita `notification_settings` (event_type `maintenance_request`, canal WhatsApp).
- Envia via UAZAPI (`/send/text`, mesmo padrão de `uazapi-send-text`).
- Mensagem: equipamento, loja, urgência, descrição, solicitante + link `/area-gestor`.
- Chamada fire-and-forget em `handleCreate` de `NutriMaintenanceControl.tsx` após insert bem-sucedido (retornando `id`).

### 3. Banner na Área do Gestor (substitui sino)
- `MaintenanceRequestsAlert.tsx` passa a listar cada chamado pendente como um mini-card com:
  - equipamento, loja, urgência, descrição, foto (thumb opcional);
  - **campo de texto simples** (`Textarea` compacto) para observação do gestor;
  - **botão "Resolver"** — 1 clique:
    - `INSERT nutri_maintenance_records` (data hoje, `maintenance_type='corretiva'`, `note` = observação digitada ou "Resolvido pelo gestor");
    - `UPDATE nutri_maintenance_requests` → `status='completed'` + `maintenance_record_id`;
    - toast de sucesso e refresh do banner.
- Sem escolha de técnico, sem modal, sem instruções — pura conclusão rápida.
- Mostrado no topo de `EmployeeArea` quando `managerView` (ou seja, em `/area-gestor`).

### 4. Sino
- `NotificationsBell` não referencia manutenção hoje (grep confirmou). Nenhuma remoção necessária.

### 5. Histórico
- `nutri_maintenance_records` continua sendo populado (colaborador pela tela antiga + gestor pelo botão "Resolver"). Sem mudança de schema.

## Arquivos

- `supabase/functions/notify-maintenance-request/index.ts` (novo)
- `src/components/nutricontrol/NutriMaintenanceControl.tsx` — pegar `id` no insert e invocar a nova função
- `src/components/nutricontrol/MaintenanceRequestsAlert.tsx` — passar a listar cards com `Textarea` de observação + botão "Resolver"
- `src/pages/EmployeeArea.tsx` — montar `MaintenanceRequestsAlert` no topo quando `managerView`

## Fora de escopo

- Fluxo antigo de "aprovar com técnico/instruções" continua acessível dentro de `/nutricontrol` para casos que precisem — só deixa de ser obrigatório.
