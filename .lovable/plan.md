## Objetivo

Atender **NR-1** (gestão de riscos psicossociais) com:
1. Check-in **semanal** de humor no primeiro acesso da semana.
2. Painel RH de **Saúde Mental** com alertas automáticos.
3. Transformar módulo de Atestados em **Atestados & PCMSO**, permitindo upload de ASO/exames ocupacionais/laudos e vinculação com os alertas de humor.

---

## Parte 1 — Check-in de humor (colaborador)

**Quando:** modal aparece no 1º acesso da semana (segunda a domingo), em qualquer área do app. Pode pular ("prefiro não responder"), mas fica registrado.

**Como responde:**
- 5 emojis: 😄 Ótimo · 😊 Bem · 😐 Neutro · 😟 Baixo · 😢 Muito baixo (score 5→1)
- Campo texto opcional "quer comentar algo? (confidencial)"
- Ao escolher 😟 ou 😢, aparece bloco fixo: *"Se precisar conversar, o RH está disponível. Ligue [telefone] ou marque atendimento confidencial [botão]."*

**Confidencialidade:** comentário e nome só visíveis para RH e psicólogo (nova role). Gestor de loja NUNCA vê individual — só agregado anônimo da unidade.

---

## Parte 2 — Painel RH `/rh/saude-mental`

Nova página no menu **RH**, acesso `hr_admin` + nova role `mental_health` (psicólogo/técnico SESMT).

**Conteúdo:**
- **Cards resumo semana atual:** total respondentes, % participação, humor médio, nº alertas ativos.
- **Heatmap por loja/setor** (agregado, sem nomes) — cores fixas por loja.
- **Evolução 12 semanas** (linha) — humor médio da empresa e por loja.
- **Lista de alertas ativos** (identificado, só para RH/psicólogo):
  - Regra: colaborador registrou 😟/😢 em **3 check-ins consecutivos** OU 4 dos últimos 6.
  - Cada alerta: nome, loja, histórico últimas 8 semanas, comentários, botão **"Registrar acompanhamento"** (data, tipo — conversa/encaminhamento SESMT/afastamento — nota confidencial).
  - Botão **"Vincular a PCMSO"** cria/liga ao registro PCMSO do colaborador.
- **Histórico individual** (ao clicar no colaborador): linha do tempo humor + acompanhamentos + docs PCMSO relacionados.
- **Exportar relatório NR-1** (PDF) por período.

---

## Parte 3 — Módulo Atestados → **Atestados & PCMSO**

Rota renomeada `/atestados` → `/atestados-pcmso`. Duas abas:

### Aba 1 — Atestados (funcionamento atual, intocado)

### Aba 2 — PCMSO
Reaproveita `medical_certificates` adicionando categorização por `document_type`:
- `aso_admissional`
- `aso_periodico`
- `aso_demissional`
- `aso_mudanca_funcao`
- `aso_retorno_trabalho`
- `laudo_pcmso` (documento-base do programa)
- `laudo_psicossocial` (NR-1 específico)
- `exame_complementar`
- `acompanhamento_saude_mental` (gerado pelo painel)

**UI da aba PCMSO:**
- Tabela por colaborador × tipo de exame com **próxima data prevista** (baseada em periodicidade cadastrada por função em `positions` — novo campo `pcmso_periodicity_months`, default 12).
- Semáforo: 🟢 em dia · 🟡 vence em 30 dias · 🔴 vencido.
- Botão "Upload ASO/Laudo" abre form: colaborador, tipo, data emissão, data validade, médico, arquivo. Arquivo vai para pasta do colaborador (imutável, conforme regra do projeto).
- Filtro por loja, função, status, tipo.
- **Aba adicional "Programa PCMSO"**: upload do laudo-base anual da empresa/loja (não vinculado a colaborador).

---

## Parte 4 — Sidebar e navegação

- Renomear item "Atestados Médicos" → **"Atestados & PCMSO"**.
- Novo item em RH: **"Saúde Mental (NR-1)"** com ícone `HeartPulse`, acesso `hr_admin`/`mental_health`.
- Atualizar `PAGE_TITLES` em `AppLayout.tsx`.

---

## Detalhes técnicos

### Novas tabelas
```sql
-- Check-ins semanais
mood_checkins (
  id, employee_id, user_id, week_start (date, segunda),
  mood_score (1-5, null = pulou),
  comment (text, criptografado no client? — v1 fica plain, RLS restrito),
  needs_support (bool, derivado de score<=2),
  created_at,
  UNIQUE(employee_id, week_start)
)

-- Alertas gerados
mental_health_alerts (
  id, employee_id, triggered_at, rule ('3_consecutive_low'|'4_of_6_low'),
  status ('open'|'in_progress'|'resolved'|'dismissed'),
  assigned_to (uuid, hr/psicólogo),
  resolved_at, resolution_notes
)

-- Acompanhamentos (histórico confidencial)
mental_health_followups (
  id, alert_id (nullable), employee_id,
  followup_date, type ('conversation'|'sesmt_referral'|'external_referral'|'leave'|'other'),
  notes (text), created_by, created_at,
  pcmso_document_id (fk medical_certificates, nullable)
)
```

### Alterações em tabelas existentes
```sql
ALTER TABLE medical_certificates
  ADD COLUMN document_type text DEFAULT 'atestado',
  ADD COLUMN valid_until date,
  ADD COLUMN is_pcmso boolean DEFAULT false;

ALTER TABLE positions
  ADD COLUMN pcmso_periodicity_months int DEFAULT 12,
  ADD COLUMN pcmso_requires_psychosocial boolean DEFAULT false;
```

### RLS
- `mood_checkins`: colaborador vê/insere só o próprio; RH e psicólogo veem todos; gestor de loja **não vê** (nem agregado sai daqui — vem de view).
- View `v_mood_weekly_store_agg` (SECURITY DEFINER) → só métricas agregadas por loja/semana, sem employee_id. Gestor consulta essa view.
- `mental_health_alerts` e `_followups`: só RH e nova role `mental_health`.
- `medical_certificates` PCMSO: mesmas policies atuais + nova role `mental_health` para leitura.

### Nova role
Adicionar `mental_health` em `app_role` enum. Cadastrada via `/configuracoes/usuarios` como qualquer outra.

### Automação de alertas
Trigger `AFTER INSERT` em `mood_checkins` roda função `check_mood_alert_rules(employee_id)`:
- busca últimos 6 check-ins,
- aplica regras,
- se dispara e não existe alerta open → cria em `mental_health_alerts` + insere `user_notifications` para todos os `hr_admin`/`mental_health`.

### Arquivamento PCMSO na pasta do colaborador
Todo upload PCMSO passa por `uploadEmployeePdfBlob` (regra do projeto), com subpasta `pcmso/<tipo>/`.

---

## O que fica de fora desta iteração

- Chat/vídeo com psicólogo dentro do app (só telefone/link externo por enquanto).
- eSocial S-2220 (monitoramento saúde) — só quando módulo PCMSO estiver populado.
- Questionário psicossocial completo (COPSOQ/PROCARE) — v2, quando NR-1 exigir avaliação estruturada.

---

## Ordem de entrega
1. Migration (tabelas + role + trigger).
2. Modal semanal de humor + hook `useWeeklyMoodCheckin`.
3. Página `/rh/saude-mental` (cards, heatmap, alertas, drill-down).
4. Refactor `/atestados` → `/atestados-pcmso` com aba PCMSO.
5. Sidebar + PAGE_TITLES + memory (regras do módulo).
