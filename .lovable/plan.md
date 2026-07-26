## Objetivo

Depois que o gestor resolve o chamado, a loja (colaborador que abriu) precisa ser avisada e **confirmar se a manutenção foi realmente concluída**. Se confirmar, encerra. Se recusar, o chamado volta pra fila do gestor com o motivo.

## Fluxo novo

1. Gestor clica **Resolver** no banner (como já é hoje) → grava histórico e muda status.
2. Em vez de ir direto para `completed`, o chamado passa por um novo status intermediário **`awaiting_confirmation`**.
3. Colaborador que abriu recebe:
   - **WhatsApp** com resumo do que foi feito + pergunta "foi resolvido? responda pela Área do Colaborador".
   - **Card na Área do Colaborador** (mesmo estilo do banner do gestor) com dois botões: **Confirmar** / **Ainda com problema**.
4. Ações:
   - **Confirmar** → status vira `completed`. Fim.
   - **Ainda com problema** → abre `Textarea` obrigatória, status volta para `pending`, `approved_by`/`approved_at`/`maintenance_record_id` são limpos, o registro em `nutri_maintenance_records` é apagado (ou marcado como revertido), e o gestor recebe novo WhatsApp + o chamado reaparece no banner com uma tag "Reaberto".

## Mudanças

### 1. Banco — migração
- Ampliar o CHECK de `status` em `nutri_maintenance_requests` para incluir `awaiting_confirmation`.
- Adicionar colunas:
  - `resolved_note text` — nota do gestor (já digitada no banner).
  - `confirmed_at timestamptz`, `confirmed_by uuid`.
  - `reopened_at timestamptz`, `reopen_reason text`, `reopen_count int default 0`.

### 2. `MaintenanceRequestsAlert.tsx` (gestor)
- Ao clicar Resolver:
  - Continua criando o `nutri_maintenance_records` (histórico como hoje).
  - Muda status para `awaiting_confirmation` (não mais `completed`), grava `resolved_note`.
  - Dispara nova edge function `notify-maintenance-resolved` para o colaborador que abriu.
- Passa a mostrar também os chamados com status `pending` **reabertos** (com badge "Reaberto" quando `reopen_count > 0`, mostrando `reopen_reason`).

### 3. Novo componente `MaintenanceConfirmAlert.tsx` (colaborador)
- Lista os chamados **do próprio user** com status `awaiting_confirmation`.
- Cada card mostra equipamento, loja, nota do gestor, data.
- Botões:
  - **Confirmar conclusão** → `UPDATE` status=`completed`, `confirmed_at`, `confirmed_by`.
  - **Ainda com problema** → abre input; ao enviar, `UPDATE` status=`pending`, seta `reopen_reason`, `reopened_at`, incrementa `reopen_count`, apaga o record de histórico atrelado, e dispara `notify-maintenance-reopened` para os gestores da loja.
- Realtime igual ao alert de gestor.

### 4. Montagem
- `EmployeeArea.tsx`: quando **não** for `managerView`, montar `MaintenanceConfirmAlert` no topo (mesmo slot do banner atual do gestor).

### 5. Edge functions
- `supabase/functions/notify-maintenance-resolved/index.ts` — WhatsApp para o `user_id` que abriu, com nome do equipamento, loja, nota do gestor e CTA "confirme na Área do Colaborador".
- `supabase/functions/notify-maintenance-reopened/index.ts` — WhatsApp para gestores/admins da loja (mesma lógica de segmentação já usada em `notify-maintenance-request`), avisando que o chamado foi reaberto com o motivo.
- Ambas respeitam `notification_settings` (event_type `maintenance_request`).

### 6. Card resumo / dashboard
- `MaintenanceSummaryCard` continua contando `pending` como "aguardando aprovação"; adicionar chip menor "aguardando confirmação da loja" com count de `awaiting_confirmation` para o gestor ter visibilidade.

## Fora de escopo

- Não mexer no fluxo antigo de aprovar-com-técnico dentro de `/nutricontrol`.
- Sem prazo automático (ex.: auto-confirmar em X dias) — pode entrar num passo seguinte se quiser.
