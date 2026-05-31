
# WhatsApp como canal adicional de notificação

Objetivo: enviar notificações de colaborador também via WhatsApp (mantendo o push), usando provedor SaaS não-oficial agora (Z-API) e já deixando arquitetura pronta pra trocar pela **API oficial Meta Cloud** depois sem reescrever nada.

## Decisões base
- **Provedor inicial: Z-API** (SaaS brasileiro, REST simples, sobe em ~30min, ~R$ 100/mês). Recomendado em vez de Evolution self-hosted pra não termos custo de manutenção de VPS agora.
- **Push continua funcionando normalmente.** WhatsApp é canal extra paralelo.
- **Número de destino:** `employees.phone` (já cadastrado). Sem novo campo agora.
- **Opt-out:** colaborador pode desativar WhatsApp na área dele (sem mexer no telefone do cadastro).
- **Meta de migração:** trocar pra API oficial Meta Cloud (gratuita até 1k conv/mês) quando aprovarem o número comercial. Toda lógica de envio fica atrás de um `whatsappAdapter` exatamente como já fizemos com TEF.

## Arquitetura

```text
notify-user (já existe)
    ├── insert user_notifications  (in-app/sino)  [mantido]
    ├── send web push              (push)         [mantido]
    └── enqueue WhatsApp (novo) ──► edge: send-whatsapp ──► adapter
                                                              ├── zapi (ativo)
                                                              └── meta-cloud (stub futuro)
```

## Passos de implementação

### 1. Banco
- Tabela `whatsapp_notifications_log` (id, user_id, employee_id, phone, message, provider, status, provider_message_id, error, sent_at, created_at) — auditoria + retry.
- Coluna `employees.whatsapp_opt_out boolean default false`.
- (Opcional, fase 2) tabela `whatsapp_templates` se quisermos mensagens parametrizadas; agora começa só com texto livre.

### 2. Secrets
- `WHATSAPP_PROVIDER` = `zapi`
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` (3 valores que a Z-API dá no painel)
- Pedidos via `add_secret` quando entrarmos em build.

### 3. Edge function `send-whatsapp`
- Recebe `{ user_id?, employee_id?, phone?, message, category?, tag? }`.
- Resolve telefone (prioridade: phone explícito → employees.phone do user_id).
- Checa `whatsapp_opt_out`. Se opt-out, pula com status `skipped`.
- Normaliza número pra E.164 (+55…).
- Chama adapter (`/lib/whatsapp/zapiAdapter.ts` no edge): POST `https://api.z-api.io/instances/{id}/token/{token}/send-text` com header `Client-Token`.
- Grava log com resultado.

### 4. Integrar no `notify-user`
- Após o bloco de push, em paralelo: chama `send-whatsapp` (fire-and-forget, não bloqueia resposta).
- Filtro por categoria: começar enviando apenas categorias importantes (`occurrence`, `announcement` priority=urgent, `payslip`, `schedule`). Categorias triviais ficam só no push. Lista controlada por const no código (fácil de ajustar).

### 5. UI do colaborador
- Em `/area-colaborador` (ou Settings do colaborador): toggle "Receber notificações no WhatsApp" + exibe o número que será usado e link "atualizar telefone no RH".
- Atualiza `employees.whatsapp_opt_out`.

### 6. UI admin (RH)
- Página simples em `/configuracoes` ou aba nova "WhatsApp": status da instância Z-API (ping `/status`), últimos 50 envios da `whatsapp_notifications_log`, botão "enviar teste".

### 7. Migração futura para Meta Cloud (não fazer agora, só deixar pronto)
- Criar `metaCloudAdapter.ts` stub.
- Trocar `WHATSAPP_PROVIDER=meta_cloud` + secrets `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID` quando aprovarem.
- Nenhuma outra parte do código muda.

## Riscos a comunicar pro usuário (ficam registrados)
- Chip dedicado: usar um número **novo**, não o pessoal/comercial principal — risco de ban existe.
- Aquecer o número: começar com volume baixo (10-20 msgs/dia) e ir subindo.
- Sem SLA: se WhatsApp mudar protocolo, Z-API pode ficar fora algumas horas.
- Para mensagens "iniciadas pela empresa" em larga escala, oficial Meta Cloud é o destino correto — Z-API é ponte temporária.

## Detalhes técnicos relevantes
- Adapter pattern espelhando o TEF (`src/lib/tef/*`), mas no edge (Deno).
- Envio é fire-and-forget do `notify-user` pra não atrasar push.
- Rate limit simples no `send-whatsapp`: máx 1 msg/seg por número (Z-API recomenda).
- Telefone inválido ou opt-out → `status='skipped'` no log, não vira erro.
- `whatsapp_notifications_log` com RLS: admin/HR leem tudo; colaborador lê só os próprios.

## Fora do escopo desta fase
- Receber respostas do colaborador via webhook (Z-API suporta, mas não precisamos agora).
- Templates HSM/aprovados (só na fase Meta Cloud).
- Mídia (imagem/PDF do holerite via WhatsApp) — fase 2 se quiser.
- Mexer em iFood, TEF, PDV-novo (parqueados pela prioridade atual).

Confirma esse plano que eu já implemento? Se sim, vou precisar que você crie a conta Z-API em https://app.z-api.io e me passe os 3 valores quando eu pedir os secrets.
