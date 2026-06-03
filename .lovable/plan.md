## Problema confirmado

Não existe job automático de virada de mês para `work_schedules`. A geração só acontece quando alguém abre `/escala` e clica em "Gerar escala". Quando o mês vira, todo colaborador que não foi regenerado fica com 0 dias.

Em junho/2026, o único caso real é a **Julia Gabriella (Asa Sul, 6x1)** — tinha 14 dias em maio (18–31, 10:40–16:00, folga domingo) e nada em junho. Os demais "sem escala em junho" também não tinham em maio (Fábrica + Escritório híbrido), então não são regressão — são cadastros nunca gerados ou escala "HÍBRIDO" que o gerador atual não suporta.

## O que vamos fazer

### 1. Edge function `rollover-schedules` (nova)

Roda mensalmente e replica o **último mês com escala** de cada colaborador ativo no **mês alvo** (próximo mês), respeitando o padrão semanal.

Regras:
- Apenas colaboradores `status = 'active'` com `work_schedule IN ('5X2','6X1','12X36')`.
- Pula colaborador que já tem qualquer linha em `work_schedules` no mês alvo (idempotente; não sobrescreve trabalho manual do gestor).
- Para **5x2/6x1**: detecta os dias da semana de folga olhando o último mês cheio do colaborador e replica `start_time`/`end_time`/intervalos do dia "típico".
- Para **12x36**: alterna trabalho/folga usando o último dia conhecido como âncora (mantém a paridade).
- Não toca em colaboradores com escala "HÍBRIDO" ou outras não suportadas — registra no log.
- Retorna `{ generated: { employee_id, days, off_days }[], skipped: { employee_id, reason }[] }`.

Suporta dois modos via body:
- `{ year, month }` → roda backfill manual de qualquer mês.
- `{}` → roda para o **próximo mês** a partir de hoje (uso do cron).

### 2. Cron job mensal

Agendar via `cron.schedule` no dia **25 às 03:00** chamando `rollover-schedules` sem body. Dia 25 dá margem de 5 dias úteis para o gestor revisar antes da virada.

### 3. Backfill imediato

Após o deploy, disparar `rollover-schedules` com `{ year: 2026, month: 6 }` para gerar a escala de junho da Julia (e qualquer outro caso elegível que aparecer entre agora e o deploy).

### 4. Aviso visível na página `/escala`

Pequeno banner informando: "Escalas são geradas automaticamente no dia 25 do mês anterior com base no último mês. Você pode ajustar manualmente a qualquer momento."

## Fora do escopo

- Não vamos forçar geração para colaboradores com escala "HÍBRIDO" — esses seguem manuais como hoje.
- Não vamos alterar o gerador manual existente em `/escala`.
- Não vamos mexer em `payroll_edit_locks`, ponto, ou folha.

## Detalhes técnicos

- Arquivos novos: `supabase/functions/rollover-schedules/index.ts`.
- Migração: cron job (via `supabase--insert`, não `migration`, porque embute anon key — segue padrão do `ems-ingest`).
- UI: pequeno alerta em `src/pages/Schedules.tsx` no topo (1 bloco, sem refatorar o resto).
- Sem mudanças de schema; usa apenas `work_schedules`, `employees`, `stores`.
