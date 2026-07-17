
## Objetivo

Consolidar **Clima Organizacional** dentro de **Saúde Ocupacional** e adicionar um **Painel NR-1** que demonstre em uma tela só a conformidade da empresa com a NR-1 (GRO + riscos psicossociais).

## 1. Reorganização de navegação

- `src/pages/OccupationalHealth.tsx` passa a ter as abas, nesta ordem:
  1. **Painel NR-1** (novo, default)
  2. Atestados
  3. PCMSO
  4. Documentos SST
  5. Saúde Mental
  6. **Clima Organizacional** (movido de `/clima`)
- `src/components/AppSidebar.tsx`: remover item "Clima Organizacional" do grupo RH; manter apenas "Saúde Ocupacional" (ícone `HeartPulse`, já existente).
- `src/App.tsx`: rota `/clima` passa a redirecionar para `/saude-ocupacional?tab=clima` (preserva links antigos e o `useClimateStatus` que já é usado pela Dashboard).
- Permissões continuam as mesmas de cada aba (a aba Clima aparece para qualquer usuário logado; sub-abas de gestão de campanhas/perguntas só para admin/manager, como já é hoje).
- `PAGE_TITLES` em `AppLayout.tsx` atualizado; título do card do dashboard "Clima" passa a apontar para a nova URL.

## 2. Novo componente: Painel NR-1

Arquivo: `src/components/occupational-health/Nr1CompliancePanel.tsx`, renderizado na primeira aba.

Layout: header com **score geral de conformidade NR-1 (0-100)** + 4 blocos de cards, cada um com seu mini-status (verde/amarelo/vermelho) e link para a aba correspondente.

### Bloco A — Riscos psicossociais (Clima + Humor + Saúde Mental)
Fontes: `climate_surveys`, `climate_responses`, `climate_response_answers`, `mood_checkins`, `mental_health_alerts`, `mental_health_followups`.
- Última pesquisa de clima (data, % adesão, eNPS, média por dimensão Liderança/Ambiente/Reconhecimento/Orgulho).
- % colaboradores em atraso na próxima pesquisa (via lógica já existente do `useClimateStatus`).
- Média de humor (mood check-ins) últimos 30 dias + tendência.
- Alertas de saúde mental abertos × tratados (com follow-up) no período.

### Bloco B — PCMSO / ASOs
Fontes: `medical_certificates` + eventual tabela de ASOs do PCMSO (a confirmar em `Pcmso.tsx` — se hoje não existir uma tabela dedicada de ASO, o bloco mostra apenas "PCMSO ativo/vencido por loja" e deixa placeholder para exames).
- % colaboradores ativos com ASO válido.
- Vencidos e a vencer em 30/60 dias.
- Contagem por tipo (admissional, periódico, demissional) quando disponível.

### Bloco C — Atestados e afastamentos
Fonte: `medical_certificates`.
- Taxa de absenteísmo dos últimos 3 / 12 meses (dias afastados ÷ dias trabalhados).
- Top 5 CIDs.
- Dias perdidos por loja no mês (com paleta fixa de cores das lojas).

### Bloco D — Documentos SST vigentes
Fontes: `sst_documents`, `sst_document_versions`.
- % documentos com versão vigente (PGR, LTCAT, PPP, PCMSO, etc.).
- Vencidos e a vencer em 30/60 dias.
- Pendentes de assinatura.

### Score geral NR-1
Média ponderada simples dos 4 blocos (25% cada), cada bloco normalizado 0-100 por regras claras (ex.: PCMSO = % ASOs válidos; Docs SST = % vigentes; Psicossocial = média de adesão×eNPS normalizado; Atestados = 100 − absenteísmo × k). Fórmula documentada no topo do arquivo.

## 3. Hook de dados

Novo `src/components/occupational-health/useNr1Metrics.tsx` (mesmo padrão de `useDashboardMetrics`/`useSegmentMetrics`): um `useQuery` que roda os counts em paralelo e devolve tudo tipado, com cache de 5 min. Nenhuma migration de banco é necessária — todas as tabelas já existem.

## 4. Fora de escopo

- Não mexer em `climate_*`, `mental_health_*`, `medical_certificates`, `sst_documents` (schema e RLS ficam intocados).
- Não alterar lógica de cálculo de folha nem regras de RH em produção.
- Não criar tabela nova de ASO agora (se faltar, plano futuro separado).

## Arquivos afetados

- **Novos:** `src/components/occupational-health/Nr1CompliancePanel.tsx`, `src/components/occupational-health/useNr1Metrics.tsx`.
- **Editados:** `src/pages/OccupationalHealth.tsx`, `src/components/AppSidebar.tsx`, `src/App.tsx`, `src/components/AppLayout.tsx` (PAGE_TITLES), dashboard card do Clima (se apontar para `/clima`).
- **Preservados:** `src/pages/Climate.tsx` (continua sendo renderizado, agora dentro da aba), `useClimateStatus`, todas as edge functions e tabelas.
