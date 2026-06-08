## Objetivo
Deixar a página `/nutri-visita` mais enxuta:
1. Esconder o bloco "Gerenciar itens do checklist" atrás de uma engrenagem (só admin), abrindo num `Dialog`.
2. Trocar o `Accordion` de 8 seções por **Tabs** (uma aba por seção), mantendo o contador de NC por aba.

## Mudanças

### 1. Engrenagem para gerenciar itens
- No cabeçalho de `/nutri-visita` (`src/pages/NutriVisit.tsx`), adicionar `Button` com ícone `Settings` ao lado do botão "Histórico", visível só para admin (via `useAuth().isAdmin`).
- Esse botão abre um `Dialog` cujo conteúdo é o atual bloco "Gerenciar itens do checklist" (criar item, listar/editar/excluir por seção).
- Extrair esse bloco do `NutriVisitReportPanel` para um novo componente `NutriVisitChecklistManagerDialog.tsx`, recebendo `open`, `onOpenChange` e callback `onChanged` para recarregar a lista no painel principal.
- Remover o bloco inline do `NutriVisitReportPanel` (a página fica só com seleção de loja + "Nova visita técnica").

### 2. Abas em vez de accordion no formulário
- Em `NutriVisitReportPanel`, substituir o `<Accordion type="multiple">` das 8 seções por `<Tabs>` (shadcn `tabs`):
  - `TabsList` com scroll horizontal (`overflow-x-auto`), uma `TabsTrigger` por seção que tem itens.
  - Cada trigger mostra `"1. Documentação"` (número curto) + badge de NC quando houver (`bg-destructive`).
  - `TabsContent` lista os itens daquela seção, idêntico ao layout atual (toggle C/NC + observação).
  - Mobile-first: `TabsList` rola lateralmente; rótulos podem ser truncados (`"1. Docs"`, `"2. Higiene"`, etc.) — manter rótulo completo no `title=`/aria.
- Não alterar o modo de visualização do relatório salvo (continua agrupado por seção em lista, é só leitura).

### 3. Sem mudanças de banco
- Nenhuma migração. Mesma estrutura de `nutri_visit_checklist_items` e respostas.

## Fora de escopo
- Histórico de visitas (`/nutri-visita/historico`) — sem mudanças.
- Painel da Nutricionista, NutriControle diário — sem mudanças.
- Auto-preenchimento do nome — já feito.

Pode aplicar?