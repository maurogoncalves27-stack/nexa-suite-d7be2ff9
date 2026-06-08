## Objetivo
Implantar na Visita Técnica da Nutricionista (`/nutri-visita`) o checklist completo de auditoria enviado pela Raquel, com 8 seções e ~52 itens, organizados por categoria.

## Abordagem
A página já existe (`NutriVisitReportPanel`) com `nutri_visit_checklist_items` (lista plana) + respostas C/NC + observação + assinatura. Hoje a tabela está vazia. Em vez de criar uma estrutura nova, vou:

1. **Adicionar campo `section`** em `nutri_visit_checklist_items` (texto, ex.: "1. Documentação e Requisitos Legais").
2. **Seedar os 52 itens** da Raquel já agrupados por seção, com `sort_order` sequencial.
3. **Agrupar a UI por seção** (accordion por categoria) tanto no formulário de nova visita quanto no relatório salvo — mantendo o fluxo atual (toggle Conforme/Não Conforme + observação + assinatura).
4. **Painel admin** ganha seletor de seção ao adicionar/editar itens.

Nada muda na lógica de respostas, assinatura, exclusão ou relatórios antigos — só ganha agrupamento visual e carga inicial.

## Seções a seedar
1. Documentação e Requisitos Legais (6 itens)
2. Higiene e Comportamento dos Manipuladores (7)
3. Recebimento e Armazenamento de Mercadorias (6)
4. Áreas de Frio - Geladeiras, Freezers e Câmaras (5)
5. Pré-Preparo e Preparo dos Alimentos (5)
6. Distribuição e Exposição do Alimento Pronto (4)
7. Higienização de Instalações, Equipamentos e Utensílios (5)
8. Gestão de Resíduos e Controle de Pragas (5)

## Detalhes técnicos
- Migração: `ALTER TABLE nutri_visit_checklist_items ADD COLUMN section text;` (sem default, nullable para compat).
- Seed via `INSERT` em uma única operação (tabela está vazia hoje).
- `NutriVisitReportPanel.tsx`: agrupar `checklistItems` por `section` usando `Accordion` (todas seções abertas por padrão no formulário, colapsáveis no relatório). Itens sem `section` ficam num grupo "Outros".
- Admin (adicionar item): novo `Select` com a lista fixa de 8 seções + opção de digitar nova.
- Tipos TS atualizados automaticamente após a migração.

## Fora de escopo
- Não mexer no NutriControle diário (`nutri_items` / `NutriDailyChecklist`).
- Não alterar formato do PDF/relatório (mantém o atual, só ganha agrupamento na tela).
- Não tocar em assinatura, storage, RLS.

Pode aplicar?