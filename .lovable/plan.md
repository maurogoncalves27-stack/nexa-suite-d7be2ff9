## Objetivo

Deixar o NEXA **em conformidade demonstrável com a NR-1 (riscos psicossociais) e LGPD** sem sobrecarregar operação nem colaborador. Humor continua existindo, mas como ferramenta **voluntária de escuta**, e ganhamos os artefatos formais que fiscalização/auditoria pedem.

## Escopo (4 entregas em ordem)

### 1. Humor 100% opcional + trilha LGPD (rápido, resolve risco jurídico)

**Arquivo:** `src/components/mental-health/WeeklyMoodCheckin.tsx`

- Adicionar botão **"Prefiro não responder hoje"** — grava um checkin com `mood = null` e `skipped = true` (novo campo) para não perguntar de novo pelos 3 dias.
- Adicionar link discreto **"Não me perguntar mais"** → grava `mood_optout` na tabela `profiles` (novo campo `mood_optout_until timestamptz`). Renovável a cada 90 dias.
- Adicionar aviso curto: *"Resposta anônima em nível de loja. Usada apenas para riscos psicossociais (NR-1). Você pode não responder ou desativar a qualquer momento."*
- Nos painéis coletivos (Nr1CompliancePanel), **ocultar métrica de humor quando N < 5** respondentes na loja/mês — evita reidentificação.

**DB:** adicionar `mood_optout_until` em `profiles` e `skipped boolean default false` em `mood_checkins`.

### 2. Módulo Riscos Psicossociais no PGR (entregável formal NR-1)

**Nova aba** em `/saude-ocupacional` → "Riscos Psicossociais (PGR)".

**Nova tabela** `psychosocial_risks`:
- categoria (carga de trabalho, assédio, jornada, relacionamento, reconhecimento, autonomia, violência externa)
- descrição, unidade/setor afetado, severidade (baixa/média/alta/crítica), probabilidade
- fonte da identificação (clima, humor agregado, ouvidoria, ocorrência, atestado, denúncia)
- plano de ação (texto), responsável (employee_id), prazo, status (aberto/em_andamento/mitigado/aceito)
- reavaliação: `next_review_at` (default +12 meses)

**UI:** tabela com filtros por loja/status/severidade + modal criar/editar + timeline de reavaliações. Popular sugestões automáticas a partir de sinais que já temos (queda no ENPS, pico de atestado CID F, ocorrências repetidas).

### 3. CID F no painel NR-1 + treinamento de líderes

**a) Quadrante novo no `Nr1CompliancePanel`:**
- Cruzar `medical_certificates.cid_code` que começa com "F" → contar afastamentos/dias por trimestre por loja.
- Alerta quando ≥ 3 CATs mentais em 90 dias na mesma loja → cria sugestão em `psychosocial_risks`.

**b) Trilha obrigatória "NR-1 para Gestores":**
- Criar `training_schedules` template com módulos: (i) o que mudou na NR-1, (ii) sinais de sofrimento mental, (iii) escuta ativa, (iv) canais de encaminhamento, (v) o que NÃO fazer (assédio disfarçado de cobrança).
- Aplicar automaticamente a todo colaborador com role `manager` e novos gestores no onboarding.
- Registro em `training_receipts` fecha a exigência de "capacitação" da NR-1.

### 4. Relatório NR-1 trimestral em PDF

- Botão **"Gerar relatório NR-1"** em `/saude-ocupacional` → edge function `nr1-report-pdf`.
- Conteúdo: (a) capa com CNPJ/período, (b) 4 quadrantes do painel, (c) tabela de riscos psicossociais com plano de ação e status, (d) indicadores de absenteísmo e CID F por loja, (e) treinamentos realizados no período, (f) assinatura do responsável SST.
- Salvo em `sst_document_versions` (auto-arquivado).

## Detalhes técnicos

- **Reidentificação:** todo painel coletivo de humor/clima aplica gate `N ≥ 5`. Implementado no hook `useNr1Metrics`.
- **Base legal LGPD:** consentimento explícito por check-in + finalidade declarada (art. 11, §2º, "a") + direito de revogação via opt-out.
- **Anonimato:** humor continua individual no banco (necessário para lógica dos 3 dias), mas nenhum agregado com N<5 é exposto e não há tela "humor do Fulano" para gestor.
- **Trigger:** ao inserir `medical_certificates` com CID começando em "F", chamar função que checa janela 90d e insere sugestão em `psychosocial_risks` se ≥3.

## O que NÃO vamos fazer

- **Não** tornar humor obrigatório (violaria NR-1 + LGPD).
- **Não** expor humor individual para gestor (só agregado ≥5).
- **Não** mexer no fluxo de folha, ponto ou financeiro (fora do escopo NR-1).

## Ordem de implementação

1. Migration (mood_optout, skipped, psychosocial_risks, trigger CID F) + grants + RLS
2. Ajuste do WeeklyMoodCheckin (opt-out + skip)
3. Gate N≥5 no useNr1Metrics + quadrante CID F
4. Aba "Riscos Psicossociais" + CRUD
5. Trilha de treinamento de líderes (seed do template)
6. Edge function `nr1-report-pdf` + botão de exportação
