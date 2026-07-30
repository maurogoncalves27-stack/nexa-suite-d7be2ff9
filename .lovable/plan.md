## Contexto verificado

- `AdminDashboardPanel` monta "pendentes/expirados" como **template × todos os usuários do grupo** (`user_access_groups` + `profiles`), sem filtrar colaborador ativo, loja do template ou escala.
- Raquel e Taina **não existem em `employees`** — são só `profiles` com papéis `employee` + `nutritionist`; por isso apareceram como cobradas.
- Existem **8 usuários sem `employees` ativo** com submissões gravadas (Janaína, Rafael, Mayke, Thamille, Lilian, Matheus, Julio, Suelen).
- `checklist_template_stores` está preenchido, mas o painel ignora a loja.

## O que fazer

### 1. Botão/toggle no template: "Somente quem está escalado na loja"
- Nova coluna booleana em `checklist_templates` (`require_scheduled`, padrão `false`) — migração.
- No editor de template (`/checklists-gerenciar`), um **Switch** com rótulo *"Cobrar somente de quem está escalado na loja no dia"* e texto de ajuda.
- Quando ligado: o colaborador só é cobrado (pendente/expirado/denominador de conformidade) se houver escala dele naquela loja naquele dia. Sem escala cadastrada para o dia → não cobra.
- Quando desligado: comportamento atual, só com os saneamentos do item 2.
- Badge no card do template indicando que a regra está ativa.

### 2. Público-alvo saneado (vale para todos os templates)
Helper único `src/lib/checklistAudience.ts`, usado por `AdminDashboardPanel`, `ChecklistsByStorePanel` e `EmployeeChecklists`. Só é cobrado quem:
1. tem registro em `employees` com `status = 'active'` (elimina nutricionistas, terceirizados e desligados);
2. pertence ao grupo de acesso do template;
3. está lotado ou alocado na loja do template (`checklist_template_stores`);
4. **e**, se `require_scheduled` estiver ligado, está escalado no dia.

Quem não passa some de pendentes/expirados e sai do denominador de conformidade (hoje ele infla e derruba o %).

### 3. Auditoria de público
Dialog "Auditoria de público" em `/checklists-gerenciar` listando vínculos inválidos — não-colaboradores, desligados e loja divergente — com botão para remover o vínculo do grupo. Nada é apagado automaticamente; submissões históricas ficam intactas.

## Detalhe técnico
- Uma migração: `ALTER TABLE public.checklist_templates ADD COLUMN require_scheduled boolean NOT NULL DEFAULT false`.
- Leitura cruzada de `employees`, `user_access_groups`, `checklist_template_stores` e da tabela de escala.
- Tokens do design system e layout mobile-first mantidos.
