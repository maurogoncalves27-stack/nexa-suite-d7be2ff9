## Objetivo
Rodar uma bateria de "clientes fictícios" conversando com a Giana (mesmo endpoint `parme-chat` que o site usa), com cenários variados (dúvidas, reclamações, reservas, delivery). Cada conversa é gravada normalmente em `chat_conversations` (mesma pipeline real), aparece na aba **Conversas** do CRM com badge identificadora de teste, e gera um relatório resumido para você inspecionar.

## Como funciona
Nada de mock paralelo: o teste chama o edge function `parme-chat` real, com `session_id` próprio prefixado `test-YYYYMMDD-HHMM-<cenario>-<n>`. Assim:
- A conversa entra em `chat_conversations` como qualquer outra.
- Tickets/reservas que a Giana criar são reais (em ambiente de dev) — por isso marcamos com tag.
- O CRM já mostra tudo na aba Conversas (independente, com badges 🎫/📅).

## Componentes

### 1. Edge function nova `parme-chat-simulate`
`supabase/functions/parme-chat-simulate/index.ts`

Recebe:
```json
{ "scenarios": ["duvida_cardapio","reclamacao_atraso","reserva_sabado","delivery_asa_norte"], "runs_per_scenario": 3 }
```

Para cada cenário:
1. Gera `session_id = test-<timestamp>-<cenario>-<n>`.
2. Usa um **roteirista** (chamada à Lovable AI Gateway com `google/gemini-3-flash-preview`) que gera 3-6 turnos de cliente, um por vez, **reagindo** à resposta anterior da Giana. Cada cenário tem persona (nome fictício, telefone fictício 6199990000+n, bairro, problema).
3. Para cada turno do cliente: POST em `parme-chat` com o histórico acumulado e o `session_id`. Lê a resposta da Giana (stream → texto). Acumula no histórico. Espera 1s entre turnos.
4. No fim do cenário, marca `chat_conversations.client_meta.test_run = { run_id, scenario, started_at, finished_at, persona }`.
5. Avalia automaticamente (gemini julgando): `passed: bool`, `score: 0-10`, `issues: string[]` — comparando o que a Giana fez vs o esperado do cenário (ex.: cenário `reserva_sabado` deveria chamar a tool `agendar_reserva`).

Retorna JSON com `run_id` e resultados consolidados (cenário, score, issues, link interno).

Cenários de partida (catálogo no arquivo `scenarios.ts`):
- `duvida_cardapio` — "vocês têm opção sem glúten?"
- `duvida_horario` — "que horas abrem domingo?"
- `reclamacao_atraso` — "pedi às 19h e até agora nada, pedido #" + número aleatório
- `reclamacao_item_faltando` — "faltou a batata no meu pedido"
- `reclamacao_frio` — "o estrogonofe chegou frio"
- `reserva_completa` — fornece todos os dados de uma vez
- `reserva_pingada` — só "quero reservar", força Giana a perguntar campo por campo
- `delivery_asa_norte` / `delivery_lago_sul` — pede sugestão de loja
- `oi_curto` — só "oi" e fecha (testa modo compacto)
- `troll` — pergunta fora de escopo ("qual a capital da França?")

### 2. Página `/crm-tests` no app
`src/pages/CrmTests.tsx` + rota em `App.tsx` + entrada no `AppSidebar.tsx` (módulo CRM, ícone `FlaskConical` — verificar que não duplica).

UI mobile-first usando o cabeçalho padrão (h1 + ícone `text-primary`):
- Botão **"Rodar bateria de testes"** com seletor de cenários (multi-check) e nº de runs por cenário (slider 1-5).
- Lista de execuções anteriores (lê de uma nova tabela `chat_test_runs`).
- Cada execução expande mostrando: cenário, persona, score, issues, link "Ver conversa" que abre a conversa no modal existente do CRM (reaproveita `parme-get-conversation-messages`).
- Badge de filtro em `/crm`: chip "Testes" para mostrar/esconder conversas com `client_meta.test_run`.

### 3. Tabela `chat_test_runs`
Migration mínima:
```sql
create table public.chat_test_runs(
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  scenario text not null,
  session_id text not null,
  persona jsonb,
  passed boolean,
  score numeric,
  issues jsonb,
  evaluator_notes text,
  created_at timestamptz default now()
);
grant select, insert on public.chat_test_runs to authenticated;
grant all on public.chat_test_runs to service_role;
alter table public.chat_test_runs enable row level security;
create policy "test_runs_super_user_all" on public.chat_test_runs
  for all to authenticated using (public.is_super_user(auth.uid())) with check (public.is_super_user(auth.uid()));
```

### 4. Ajustes pequenos
- `CRM.tsx`: badge "🧪 Teste" quando `client_meta?.test_run` existe; filtro padrão **esconde** testes (toggle "Mostrar testes").
- `PAGE_TITLES` em `AppLayout.tsx` recebe `/crm-tests`.

## Não vai mexer
- Não toca em `parme-chat/index.ts` (a pipeline real precisa continuar idêntica).
- Não toca em tools da Giana, reservas, tickets.
- Não cria mock de Giana — usa o agente real, garantindo que o teste reflete o comportamento de produção.

## Validação
1. Abrir `/crm-tests` → marcar 4 cenários × 2 runs → rodar.
2. Esperar ~1 min → tabela mostra 8 execuções com score e issues.
3. Clicar em "Ver conversa" → modal abre com histórico completo de cliente↔Giana.
4. Ir em `/crm`, alternar "Mostrar testes" → conversas aparecem com badge 🧪.
5. Confirmar que conversa de cenário `reserva_completa` tem badge 📅 e que `reclamacao_*` tem 🎫.

## Custo
Cada bateria de 10 cenários × 2 runs ≈ 20 conversas × ~4 turnos × 2 chamadas Gemini Flash (cliente + Giana) + 20 avaliações = ~180 chamadas Flash. Barato, mas avisa o usuário antes de rodar grande.
