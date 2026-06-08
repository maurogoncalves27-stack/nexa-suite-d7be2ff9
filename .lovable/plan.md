## Objetivo
Trocar as abas do checklist por um **pipeline linear** (Voltar / Avançar) com barra de progresso simples no topo, sem bloqueios de validação — o usuário é guiado a passar por todas as etapas naturalmente.

## Mudanças em `NutriVisitReportPanel.tsx`

### 1. Remover `Tabs/TabsList/TabsTrigger/TabsContent`
- Apagar imports e blocos relacionados.
- Substituir por estado próprio: `stepIndex` (número) e array `steps` montado dinamicamente — uma entrada por seção que tenha itens (`SECTIONS + "Outros"`) + uma última entrada `{ kind: "finalizar" }`.

### 2. Topo do pipeline (barra de progresso)
- Linha 1: `Etapa X de N · NomeDaEtapa` (texto pequeno) com badge de NCs da etapa atual se houver.
- Linha 2: barra `h-2 rounded-full bg-muted` com preenchimento `bg-primary` proporcional a `(stepIndex + 1) / steps.length`. Tokens do design system (sem cor hardcoded).

### 3. Conteúdo da etapa
- Se etapa do tipo "section": renderiza os mesmos cards de item (botão C/NC + nome + textarea de observação) já existentes, apenas filtrando pela seção da etapa atual.
- Se etapa do tipo "finalizar": renderiza o bloco atual da aba Finalizar (resumo conformes/NCs + observações gerais + responsável + assinatura + botão Salvar).

### 4. Rodapé com navegação
- Bloco `flex items-center justify-between gap-2 pt-2`:
  - Botão `Voltar` (variant outline, desabilitado em `stepIndex === 0`).
  - Texto central `Etapa X / N` (some no mobile pequeno).
  - Botão `Avançar` (primary, desabilitado em `stepIndex === steps.length - 1`).
- Etapa "finalizar" oculta o `Avançar`; o botão `Salvar registro de visita` continua dentro do conteúdo.

### 5. Validação ao salvar
- Mantém os toasts atuais. Quando faltar responsável/assinatura, em vez de `setActiveTab("finalizar")`, faz `setStepIndex(steps.length - 1)`.

### 6. Reset
- Após salvar com sucesso (no `saveReport` existente, onde `responses`/assinatura são limpos), `setStepIndex(0)` pra voltar à primeira etapa.

### 7. Limpeza
- Remover import de `Tabs*` e `CheckCircle2` se não usados em mais nada.
- Manter a banner de "Selecione uma loja" e o wrapper de `pointer-events-none opacity-50` quando `!currentStoreId`.

## Fora de escopo
- Schema do banco, gerenciador de itens, histórico, telas externas (`NutriVisit.tsx`).
- Bloqueios de avanço — o usuário escolheu "só visual, sem bloqueio".
