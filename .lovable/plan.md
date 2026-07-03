## Objetivo
Unificar **Atestados Médicos**, **PCMSO** e **Saúde Mental (NR-1)** em uma única página **"Saúde Ocupacional"** com abas, mantendo todas as funcionalidades atuais e respeitando as permissões distintas de cada módulo.

## Nova página

**Rota:** `/saude-ocupacional` (as rotas antigas `/atestados`, `/pcmso`, `/rh/saude-mental` continuam funcionando via redirect para a aba correta, para não quebrar links/bookmarks).

**Layout:** cabeçalho padrão + `Tabs` mobile-first com 3 abas:

1. **Atestados** — painel atual (`MedicalCertificatesPanel`).
2. **PCMSO** — conteúdo atual de `Pcmso.tsx` (ASO, laudos, exames com validade).
3. **Saúde Mental** — conteúdo atual de `MentalHealth.tsx` (heatmap, alertas, acompanhamentos).

**Ícone/título:** `HeartPulse` + "Saúde Ocupacional" com subtítulo "Atestados, PCMSO e saúde mental (NR-1)".

## Permissões por aba

Cada aba é renderizada só se o usuário tem acesso; abas bloqueadas somem do `TabsList` (não aparecem desabilitadas):

- **Atestados:** staff + contabilidade (mesma regra de hoje).
- **PCMSO:** admin, manager, hr, mental_health.
- **Saúde Mental:** admin, hr, mental_health.

Se o usuário só tem acesso a uma aba, ela abre direto sem mostrar as tabs. Se não tem acesso a nenhuma, redireciona para `/`.

## Sidebar

No grupo **Recursos Humanos → Jornada**, substituir os 3 itens atuais por **1 item único**:

- "Saúde Ocupacional" (`HeartPulse`) → `/saude-ocupacional`

Os 3 itens antigos deixam de aparecer no menu.

## Navegação profunda

Query param `?tab=atestados|pcmso|saude-mental` controla a aba ativa (permite linkar direto). Redirects:

- `/atestados` → `/saude-ocupacional?tab=atestados`
- `/pcmso` → `/saude-ocupacional?tab=pcmso`
- `/rh/saude-mental` → `/saude-ocupacional?tab=saude-mental`

## Detalhes técnicos

- Criar `src/pages/OccupationalHealth.tsx` com o container de tabs + gating por role via `useAuth`.
- Refatorar `Pcmso.tsx` e `MentalHealth.tsx` extraindo o **corpo** (sem o header `<h1>`) para componentes reutilizáveis (`PcmsoPanel`, `MentalHealthPanel`) — o header vira responsabilidade da nova página. Os arquivos de página antigos passam a apenas renderizar o novo `OccupationalHealth` já com a aba correta, para os redirects funcionarem.
- Atualizar `PAGE_TITLES` em `src/components/AppLayout.tsx`: mais específica primeiro (`/saude-ocupacional` → "Saúde Ocupacional", grupo "Jornada"); manter os matches antigos por compatibilidade.
- Atualizar `ACCOUNTANT_URLS` no sidebar para incluir `/saude-ocupacional` (contabilidade acessa só a aba Atestados).
- Não mexer em migrations, tabelas, edge functions nem regras de RLS — só reorganização de UI/rotas.

## Fora de escopo
- Não alterar formulários, gráficos ou lógica interna dos 3 módulos.
- Não mexer no check-in semanal de humor (`WeeklyMoodCheckin` continua no `AppLayout`).
