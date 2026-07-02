
## Objetivo
Mudanças 100% visuais no CRM e no painel de avaliações. Nada de alterar dados/edge functions/tabelas.

## 1. Remover aba "Dashboard" do CRM (`src/pages/CRM.tsx`)
- Remover `<TabsTrigger value="dashboard">` e o `<TabsContent value="dashboard">` (linhas ~773‑776 e 809‑815).
- Remover o componente `CRMDashboard` inteiro (função + imports não usados: `Star`, `Clock`, `translateStatus` se ficarem órfãos, recharts se não usados em outro lugar).
- Aba padrão passa a ser **Reservas** (`defaultValue="reservations"`).
- Ajustar a grid do `TabsList` de 6 para 5 colunas.

## 2. Distribuir os KPIs úteis nas abas certas (mini-cards no topo de cada aba)
Cada aba ganha uma faixa enxuta de KPIs (3‑4 cards pequenos) que respondem "o que preciso saber hoje?":

- **Reservas** (topo): Hoje · Próximos 7 dias · Pendentes · Confirmadas. Mini sparkline de reservas nos próximos 14 dias (o `resPerDay` que já existia).
- **Tickets** (topo): Abertos · Em andamento · Resolvidos hoje · SLA vencendo. Sparkline de tickets criados nos últimos 14 dias.
- **Conversas** (topo): Total · Sem resposta · Últimas 24h · Top marca. Barra horizontal compacta com top marcas (`convByBrand`).
- **Avaliações** (aba do CRM): médias Google / iFood / Nutri (os 3 cards que já existiam) + link "ver detalhes" que leva para o módulo completo de Avaliações.
- **Agente IA**: sem KPI adicional (mantém como está).

Os cálculos (`resByStatus`, `ticketsByStatus`, `resPerDay`, `ticketsPerDay`, `convByBrand`, `ratingAverages`) são movidos para dentro dos respectivos `TabsContent` (ou extraídos como sub-componentes `ReservationsHeaderKPIs`, `TicketsHeaderKPIs`, etc.) para não perder nada útil do dashboard antigo.

## 3. Remover a matriz de notas por loja (`src/pages/CustomerReviews.tsx`)
- Remover o bloco "Quadro de notas por loja" (linhas 520‑638) inteiro dentro do `TabsContent value="painel"`.
- A informação já está coberta pelos cards por loja/marca acima e pela aba **Gráficos**.

## 4. Revisão geral / melhorias visuais (CRM + Avaliações)

Ajustes de UI/UX sem tocar em regra de negócio:

- **Cabeçalho unificado** no padrão obrigatório do projeto (`h1` + ícone `text-primary` + descrição) — hoje o CRM usa um cabeçalho custom; padronizar.
- **TabsList sticky** no topo com blur (`sticky top-0 z-10 backdrop-blur bg-background/80`) para não perder navegação em telas longas.
- **Filtros compactados** numa barra única (loja + período + busca) usando `Popover` de "Filtros avançados" no mobile, em vez de vários selects empilhados.
- **Cards de KPI** com estilo consistente: ícone à esquerda em círculo `bg-primary/10`, número grande tabular-nums, delta vs. semana anterior quando fizer sentido (mesma seta azul↑ / vermelha↓ já usada em Avaliações — reaproveitar componente).
- **Cores semânticas** (usar tokens `success`/`warning`/`destructive`/`primary`) em vez das classes cruas `text-emerald-*`, `text-blue-*`, `text-red-*` que aparecem nos ratingCards e nas células da matriz — atende a regra "IDENTIDADE VISUAL IMUTÁVEL".
- **Reservas**: transformar a lista em cards no mobile (padrão mobile-first) com badge de status colorido; no desktop mantém tabela.
- **Tickets**: agrupar visualmente por status (colunas tipo mini-kanban colapsáveis) no desktop; lista simples com filtro de status no mobile.
- **Conversas**: split-view (lista à esquerda + detalhe à direita) no desktop ≥lg; drawer no mobile.
- **Avaliações (aba do CRM)**: manter apenas as 3 médias + últimos 5 comentários recentes + CTA "Abrir painel completo".
- **Painel de Avaliações** (`CustomerReviews.tsx`): após remover a matriz, reorganizar a aba "Painel" em 2 colunas no desktop (cards por marca/loja à esquerda, resumo + últimos comentários à direita) para reduzir scroll.
- **Empty states** com ícone + frase curta + ação primária em todas as listas vazias.
- **Skeletons** consistentes durante `loading` em vez de "Carregando…" em texto.

## Detalhes técnicos
- Arquivos alterados: `src/pages/CRM.tsx` (grande refactor visual), `src/pages/CustomerReviews.tsx` (remover matriz + reorganizar painel).
- Novos sub-componentes locais em `CRM.tsx`: `ReservationsHeaderKPIs`, `TicketsHeaderKPIs`, `ConversationsHeaderKPIs`, `ReviewsMiniPanel` — todos puramente presentacionais, recebendo os arrays já filtrados por props.
- Nenhuma mudança em Supabase, tipos, hooks de dados ou edge functions.
- Sem novas dependências. Recharts e lucide-react já disponíveis.
- Typecheck após alterações (`tsgo`) para garantir que remoção do `CRMDashboard` não deixou imports órfãos.

## Fora de escopo
- Não mudar filtros de negócio, não tocar em queries, não alterar `google-reviews-sync` nem tabelas.
- Não mexer na aba **Agente IA**.
- Não redesenhar as cores/marca — só migrar hardcoded para tokens existentes.
