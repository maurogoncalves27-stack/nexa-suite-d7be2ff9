# Padronizar /estagio com o layout de /vagas-diaria

## Objetivo
Deixar a página **/estagio** visualmente e funcionalmente igual à **/vagas-diaria** (FreelancerJobs), reaproveitando o mesmo componente de calendário semanal por loja, as mesmas abas (Abertas / Preenchidas / Concluídas / Canceladas), os mesmos botões superiores (Copiar link público / Ver página pública / Nova vaga) e o mesmo rodapé com legenda.

## O que muda em /estagio

1. **Cabeçalho idêntico**
   - Ícone `GraduationCap` (mantém identidade do módulo) + título "Estágio" + subtítulo "Divulgue oportunidades de estágio para os candidatos se cadastrarem."
   - Lado direito: botões **Copiar link público**, **Ver página pública**, **Nova vaga de estágio** (cor primária).

2. **Navegador semanal + abas de status**
   - Setas ◀ / ▶ semana + label "DD/MM – DD/MM/AAAA  Esta semana".
   - Abas no canto direito: **Abertas · Preenchidas · Concluídas · Canceladas**.

3. **Grid calendário (linhas = lojas, colunas = dias da semana)**
   - Linhas: lojas físicas reais (`stores.is_virtual=false`) com a paleta fixa: ÁGUAS CLARAS azul, ASA NORTE verde, ASA SUL amarelo, LAGO SUL rosa.
   - Colunas: Seg→Dom da semana selecionada.
   - Cada **vaga de estágio (internship_opening)** aparece como card no dia da sua `start_date`, mostrando: valor da bolsa (quando houver), horário, candidato preenchido (se houver) e badge de status (Aberta / Preenchida / Concluída / Cancelada).

4. **Rodapé com legenda**
   - Mesmos chips coloridos: Aberta · Preenchida · Concluída · Cancelada + texto "Clique em uma vaga para editar."

5. **Dialog de criar/editar vaga de estágio**
   - Mesmo formato do dialog de Nova vaga em /vagas-diaria, adaptado aos campos de estágio (loja, título, descrição, data, horário, valor da bolsa, nº de vagas).

6. **Página pública de estágio**
   - Botão "Ver página pública" abre `/vagas?tipo=estagio` (ou rota análoga já existente) listando apenas openings de estágio.
   - Botão "Copiar link público" copia esse URL.

## O que NÃO muda (preservado)
- A página atual /estagio também gerencia **estágios ativos**, **pagamentos de bolsa**, **contratos de estágio** e **candidatos**. Esses blocos ficam **abaixo do calendário**, em **accordion/tab secundário** ("Gestão de estagiários ativos"), preservando integralmente as funcionalidades hoje existentes (InternshipPaymentsPanel, InternshipContractCard, InternshipCandidatesPanel, CRUD de internships).
- Toda a lógica de `internship_openings`, `internships`, `internship_contracts` e a trigger `trg_auto_terminate_internship` continua igual no banco — só a camada visual é refatorada.

## Implementação técnica

- **Extrair componente compartilhado** `WeeklyOpeningsCalendar` a partir do código atual de FreelancerJobs (grid loja × dia, navegação semanal, abas, legenda). Recebe via props: `openings[]`, `stores[]`, `onSelectOpening`, `onNewOpening`, `publicUrl`, labels customizáveis (título da entidade, status map).
- Refatorar `src/pages/FreelancerJobs.tsx` para usar `<WeeklyOpeningsCalendar>` (sem mudança visual).
- Refatorar `src/pages/Internships.tsx`:
  - Adaptar `internship_openings` para o shape esperado pelo calendário (mapear `start_date` → `work_date`, derivar `status` a partir das vagas preenchidas vs `positions_count`).
  - Renderizar `<WeeklyOpeningsCalendar>` no topo.
  - Mover o conteúdo atual (estagiários ativos, pagamentos, contratos, candidatos) para uma seção colapsável "Gestão de estagiários" abaixo do calendário.
- Atualizar `src/pages/PublicJobs.tsx` (ou criar filtro) para suportar listar openings de estágio.
- Usar exclusivamente tokens do design system (`primary`, `success`, `warning`, `destructive`, `muted`) — sem cores hardcoded — exceto a paleta fixa de lojas.
- Manter mobile-first: no viewport ~427px o grid vira cards empilhados por loja, igual já acontece em /vagas-diaria.

## Pontos a confirmar antes de codar
1. **Bolsa de estágio**: as openings de estágio têm valor de bolsa por dia ou por mês? Hoje `internship_openings` não tem campo de valor — devo adicionar `stipend_amount`?
2. **Múltiplas vagas (positions_count)**: quando uma opening tem 3 vagas, deve aparecer 1 card que diz "0/3 preenchidas" ou 3 cards separados no dia?
3. **Página pública**: já existe rota pública para vagas de estágio ou devo criar/adaptar `/vagas?tipo=estagio`?
